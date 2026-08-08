"""Train the food classification CNN.

Transfer learning on MobileNetV2, in two phases:

  Phase 1  Freeze the ImageNet base, train only the new classifier head. The
           base already recognises edges, textures and shapes; we are just
           learning to map those onto our 12 dishes.
  Phase 2  Unfreeze the top layers and fine-tune at a much lower learning
           rate, letting the later filters specialise onto food.

Training from scratch is deliberately not offered. With ~60-250 images per
class a from-scratch CNN memorises the training set within a few epochs and
generalises poorly — the exact overfitting problem transfer learning solves.

Usage:

    python ml/train.py                     # both phases, sensible defaults
    python ml/train.py --epochs 20 --fine-tune-epochs 10
    python ml/train.py --no-fine-tune      # phase 1 only, much faster

Outputs (all under ml/artifacts/):
    model.keras            best weights by validation accuracy
    class_indices.json     class name -> output index, consumed by the backend
    training_history.csv   per-epoch metrics for the results chapter
"""

import argparse
import csv
import json
import sys

from common import (
    ARTIFACTS_DIR,
    BATCH_SIZE,
    CLASS_INDEX_PATH,
    HISTORY_PATH,
    IMAGE_SIZE,
    MODEL_PATH,
    SEED,
    TRAIN_DIR,
    load_class_keys,
)

# Fraction of the training set held back to monitor each epoch. The separate
# test/ directory stays untouched until evaluate.py, so the reported final
# accuracy is on data the model has never influenced.
VALIDATION_SPLIT = 0.2


def build_augmentation(keras):
    """Augmentation matching Chapter 3's methodology.

    Chapter 3 lists shift, shear and zoom at 0.2 and horizontal flip, which map
    directly onto these layers. Rotation is given as 0.2 there; expressed as a
    fraction of a full turn that would be +/-72 degrees, which is far more than
    a plated meal ever varies, so it is applied as a more realistic +/-20
    degrees (0.055 of a turn).

    These layers are applied to the training dataset, NOT embedded in the model
    (see build_model). They are inert at inference time either way, but keeping
    them out of the saved model avoids a Keras 3 serialisation bug: RandomShear
    writes its factor as the range [-0.2, 0.2] and its own deserialiser then
    rejects the negative value, so a model containing it saves but will not
    load.
    """
    layers = [
        keras.layers.RandomFlip("horizontal", seed=SEED),
        keras.layers.RandomRotation(0.055, seed=SEED),
        keras.layers.RandomTranslation(0.2, 0.2, seed=SEED),
        keras.layers.RandomZoom(0.2, seed=SEED),
    ]

    # RandomShear is only in newer Keras versions; skip it rather than fail.
    if hasattr(keras.layers, "RandomShear"):
        layers.append(keras.layers.RandomShear(0.2, 0.2, seed=SEED))
    else:
        print("Note: this Keras build has no RandomShear layer; skipping shear.")

    return keras.Sequential(layers, name="augmentation")


def augment_dataset(dataset, augmentation, tf):
    """Apply augmentation in the input pipeline, on the fly each epoch."""
    return dataset.map(
        lambda images, labels: (augmentation(images, training=True), labels),
        num_parallel_calls=tf.data.AUTOTUNE,
    )


def build_model(keras, num_classes: int):
    """MobileNetV2 with a fresh classifier head.

    Rescaling is baked into the model as a layer. That is deliberate: it means
    the serving code only has to resize to 224x224 and hand over raw pixels,
    removing the most common source of train/serve skew. Augmentation is
    deliberately NOT included — it belongs to training only, and embedding it
    makes the saved model fragile to load.
    """
    base = keras.applications.MobileNetV2(
        input_shape=(IMAGE_SIZE, IMAGE_SIZE, 3),
        include_top=False,
        weights="imagenet",
    )
    base.trainable = False

    inputs = keras.Input(shape=(IMAGE_SIZE, IMAGE_SIZE, 3), name="image")
    # MobileNetV2 expects inputs scaled to [-1, 1].
    x = keras.layers.Rescaling(1.0 / 127.5, offset=-1.0, name="preprocess")(inputs)
    x = base(x, training=False)
    x = keras.layers.GlobalAveragePooling2D(name="pool")(x)
    x = keras.layers.Dropout(0.3, name="dropout")(x)
    outputs = keras.layers.Dense(num_classes, activation="softmax", name="predictions")(x)

    model = keras.Model(inputs, outputs, name="plately_food_classifier")
    return model, base


def compute_class_weights(class_names: list[str]) -> dict[int, float]:
    """Weight each class inversely to how many training images it has.

    The dataset is roughly two to one against the Nigerian dishes — 45 images
    for each international class against 17 to 27 for amala, eba, egusi, moi
    moi, jollof and pounded yam. Unweighted, the loss is minimised by learning
    the six well-represented classes well and treating the rest as noise, and
    that is measurably what happened: in the first Colab run every single one
    of the 34 Nigerian misclassifications landed on an international class and
    none on another Nigerian class. The model was not confusing amala with eba;
    it had learned not to answer "amala" at all.

    Weighting makes a mistake on a rare class cost proportionally more, which
    is the standard remedy and costs nothing but a rerun. It is not a
    substitute for more photographs — a weight cannot invent detail that 17
    images of eba do not contain — but it establishes how much of the problem
    is imbalance and how much is scarcity, and those need different fixes.

    Same formula as sklearn's compute_class_weight(class_weight="balanced"),
    written out to avoid the dependency: n_samples / (n_classes * n_class).
    """
    counts = {
        name: sum(1 for path in (TRAIN_DIR / name).iterdir() if path.is_file())
        for name in class_names
    }
    total = sum(counts.values())
    present = [name for name in class_names if counts[name]]
    return {
        index: total / (len(present) * counts[name])
        for index, name in enumerate(class_names)
        if counts[name]
    }


def write_history(histories: list) -> None:
    """Flatten one or more History objects into a single CSV."""
    rows: list[dict] = []
    epoch = 0
    for phase_index, history in enumerate(histories, start=1):
        keys = list(history.history.keys())
        length = len(history.history[keys[0]])
        for i in range(length):
            epoch += 1
            row = {"epoch": epoch, "phase": phase_index}
            row.update({key: history.history[key][i] for key in keys})
            rows.append(row)

    if not rows:
        return

    HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    with HISTORY_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote per-epoch metrics to {HISTORY_PATH}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--epochs", type=int, default=15, help="Phase 1 epochs.")
    parser.add_argument(
        "--fine-tune-epochs", type=int, default=10, help="Phase 2 epochs."
    )
    parser.add_argument(
        "--no-fine-tune", action="store_true", help="Skip phase 2 entirely."
    )
    parser.add_argument(
        "--fine-tune-layers",
        type=int,
        default=30,
        help="How many of the base's top layers to unfreeze in phase 2.",
    )
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument(
        "--class-weight",
        choices=("balanced", "none"),
        default="balanced",
        help=(
            "balanced (default) weights each class inversely to its image "
            "count; none trains unweighted. Keep both runs — the comparison "
            "is what tells you whether the Nigerian classes are held back by "
            "imbalance or simply by having too few images."
        ),
    )
    args = parser.parse_args()

    if not TRAIN_DIR.exists():
        print(
            f"No training data at {TRAIN_DIR}.\n"
            "Run ml/prepare_data.py first — see ml/README.md.",
            file=sys.stderr,
        )
        return 1

    try:
        import tensorflow as tf
    except ImportError:
        print(
            "TensorFlow is not installed.\n"
            "  pip install -r backend/requirements-ml.txt",
            file=sys.stderr,
        )
        return 1

    keras = tf.keras
    keras.utils.set_random_seed(SEED)

    expected_classes = load_class_keys()

    train_ds = keras.utils.image_dataset_from_directory(
        TRAIN_DIR,
        validation_split=VALIDATION_SPLIT,
        subset="training",
        seed=SEED,
        image_size=(IMAGE_SIZE, IMAGE_SIZE),
        batch_size=args.batch_size,
        label_mode="categorical",
    )
    val_ds = keras.utils.image_dataset_from_directory(
        TRAIN_DIR,
        validation_split=VALIDATION_SPLIT,
        subset="validation",
        seed=SEED,
        image_size=(IMAGE_SIZE, IMAGE_SIZE),
        batch_size=args.batch_size,
        label_mode="categorical",
    )

    class_names = list(train_ds.class_names)
    print(f"\nFound {len(class_names)} classes: {', '.join(class_names)}")

    missing = set(expected_classes) - set(class_names)
    if missing:
        print(
            f"\nWarning: no training images for {', '.join(sorted(missing))}. "
            "The model will never predict these, but the nutrition table still "
            "lists them.",
            file=sys.stderr,
        )

    autotune = tf.data.AUTOTUNE
    # Augment only the training split, and after caching so each epoch sees a
    # different random transform of the same underlying images.
    augmentation = build_augmentation(keras)
    train_ds = train_ds.cache().shuffle(1000, seed=SEED)
    train_ds = augment_dataset(train_ds, augmentation, tf).prefetch(autotune)
    val_ds = val_ds.cache().prefetch(autotune)

    class_weight = None
    if args.class_weight == "balanced":
        class_weight = compute_class_weights(class_names)
        print("\nClass weights (higher = fewer training images):")
        for index, name in enumerate(class_names):
            if index in class_weight:
                print(f"  {name:<16} {class_weight[index]:.2f}")

    model, base = build_model(keras, len(class_names))
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=1e-3),
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    callbacks = [
        keras.callbacks.ModelCheckpoint(
            MODEL_PATH, monitor="val_accuracy", save_best_only=True, verbose=1
        ),
        keras.callbacks.EarlyStopping(
            monitor="val_accuracy", patience=5, restore_best_weights=True, verbose=1
        ),
        keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss", factor=0.5, patience=3, min_lr=1e-6, verbose=1
        ),
    ]

    print("\n" + "=" * 60)
    print("Phase 1: training the classifier head (base frozen)")
    print("=" * 60)
    histories = [
        model.fit(
            train_ds,
            validation_data=val_ds,
            epochs=args.epochs,
            callbacks=callbacks,
            class_weight=class_weight,
            # The dataset is already shuffled; fit()'s default would warn.
            shuffle=False,
        )
    ]

    if not args.no_fine_tune:
        print("\n" + "=" * 60)
        print(f"Phase 2: fine-tuning the top {args.fine_tune_layers} base layers")
        print("=" * 60)

        base.trainable = True
        for layer in base.layers[: -args.fine_tune_layers]:
            layer.trainable = False
        # BatchNorm statistics should not move on a dataset this small.
        for layer in base.layers:
            if isinstance(layer, keras.layers.BatchNormalization):
                layer.trainable = False

        # A low rate is essential here. Fine-tuning at the phase 1 rate would
        # destroy the pretrained features before they can adapt.
        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=1e-5),
            loss="categorical_crossentropy",
            metrics=["accuracy"],
        )
        histories.append(
            model.fit(
                train_ds,
                validation_data=val_ds,
                epochs=args.fine_tune_epochs,
                callbacks=callbacks,
                class_weight=class_weight,
                shuffle=False,
            )
        )

    # Saved by index so the backend can invert it back to class names.
    class_indices = {name: index for index, name in enumerate(class_names)}
    CLASS_INDEX_PATH.write_text(json.dumps(class_indices, indent=2), encoding="utf-8")

    write_history(histories)

    val_loss, val_accuracy = model.evaluate(val_ds, verbose=0)
    print("\n" + "=" * 60)
    print(f"Validation accuracy: {val_accuracy:.4f}   loss: {val_loss:.4f}")
    print(f"Model:        {MODEL_PATH}")
    print(f"Class index:  {CLASS_INDEX_PATH}")
    print("=" * 60)
    print("\nNext: python ml/evaluate.py   (metrics on the held-out test set)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
