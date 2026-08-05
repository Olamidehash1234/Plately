"""Evaluate the trained model on the held-out test set.

Produces exactly the figures Chapter 4's testing section promises: overall
accuracy, per-class precision, recall and F1, a confusion matrix, and the
training/validation curves.

Usage:

    python ml/evaluate.py

Outputs (all under ml/artifacts/reports/):
    metrics.json               machine-readable summary
    classification_report.txt  per-class precision/recall/F1 table
    confusion_matrix.png       which classes get mistaken for which
    training_curves.png        accuracy and loss per epoch
"""

import csv
import json
import sys

from common import (
    BATCH_SIZE,
    CLASS_INDEX_PATH,
    HISTORY_PATH,
    IMAGE_SIZE,
    MODEL_PATH,
    REPORTS_DIR,
    TEST_DIR,
    load_class_labels,
)


def plot_confusion_matrix(matrix, display_labels, output_path) -> None:
    import matplotlib

    matplotlib.use("Agg")  # no display on a headless machine or in Colab
    import matplotlib.pyplot as plt
    import numpy as np

    # Row-normalise: with unequal class sizes, raw counts make a common class
    # look better than it is.
    with np.errstate(all="ignore"):
        normalised = matrix.astype(float) / matrix.sum(axis=1, keepdims=True)
    normalised = np.nan_to_num(normalised)

    size = max(8, len(display_labels) * 0.8)
    fig, ax = plt.subplots(figsize=(size, size))
    image = ax.imshow(normalised, cmap="Greens", vmin=0, vmax=1)

    ax.set_xticks(range(len(display_labels)))
    ax.set_yticks(range(len(display_labels)))
    ax.set_xticklabels(display_labels, rotation=45, ha="right")
    ax.set_yticklabels(display_labels)
    ax.set_xlabel("Predicted")
    ax.set_ylabel("Actual")
    ax.set_title("Confusion matrix (row-normalised)")

    threshold = 0.5
    for i in range(len(display_labels)):
        for j in range(len(display_labels)):
            ax.text(
                j,
                i,
                f"{matrix[i, j]}",
                ha="center",
                va="center",
                fontsize=8,
                color="white" if normalised[i, j] > threshold else "black",
            )

    fig.colorbar(image, ax=ax, fraction=0.046, pad=0.04)
    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)


def plot_training_curves(output_path) -> bool:
    if not HISTORY_PATH.exists():
        return False

    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    with HISTORY_PATH.open(encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))

    if not rows:
        return False

    def column(name: str) -> list[float]:
        return [float(row[name]) for row in rows if row.get(name)]

    epochs = [int(row["epoch"]) for row in rows]
    fig, (ax_acc, ax_loss) = plt.subplots(1, 2, figsize=(13, 5))

    ax_acc.plot(epochs, column("accuracy"), label="train")
    ax_acc.plot(epochs, column("val_accuracy"), label="validation")
    ax_acc.set_xlabel("Epoch")
    ax_acc.set_ylabel("Accuracy")
    ax_acc.set_title("Accuracy per epoch")
    ax_acc.legend()
    ax_acc.grid(alpha=0.3)

    ax_loss.plot(epochs, column("loss"), label="train")
    ax_loss.plot(epochs, column("val_loss"), label="validation")
    ax_loss.set_xlabel("Epoch")
    ax_loss.set_ylabel("Loss")
    ax_loss.set_title("Loss per epoch")
    ax_loss.legend()
    ax_loss.grid(alpha=0.3)

    # Mark where fine-tuning began, if there was a phase 2.
    phase_two = [int(row["epoch"]) for row in rows if row.get("phase") == "2"]
    if phase_two:
        for axis in (ax_acc, ax_loss):
            axis.axvline(
                phase_two[0] - 0.5, color="grey", linestyle="--", linewidth=1
            )
            axis.annotate(
                "fine-tuning",
                xy=(phase_two[0] - 0.5, axis.get_ylim()[1]),
                xytext=(4, -12),
                textcoords="offset points",
                fontsize=8,
                color="grey",
            )

    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)
    return True


def main() -> int:
    if not MODEL_PATH.exists():
        print(
            f"No model at {MODEL_PATH}. Run ml/train.py first.", file=sys.stderr
        )
        return 1
    if not TEST_DIR.exists():
        print(
            f"No test data at {TEST_DIR}. Run ml/prepare_data.py first.",
            file=sys.stderr,
        )
        return 1

    try:
        import numpy as np
        import tensorflow as tf
        from sklearn.metrics import (
            classification_report,
            confusion_matrix,
            precision_recall_fscore_support,
        )
    except ImportError as exc:
        print(
            f"Missing dependency ({exc.name}).\n"
            "  pip install -r backend/requirements-ml.txt",
            file=sys.stderr,
        )
        return 1

    keras = tf.keras
    model = keras.models.load_model(MODEL_PATH)

    test_ds = keras.utils.image_dataset_from_directory(
        TEST_DIR,
        image_size=(IMAGE_SIZE, IMAGE_SIZE),
        batch_size=BATCH_SIZE,
        label_mode="categorical",
        shuffle=False,  # must not shuffle: predictions are matched by position
    )
    class_names = list(test_ds.class_names)

    # Sanity check against what the model was actually trained on.
    if CLASS_INDEX_PATH.exists():
        trained = json.loads(CLASS_INDEX_PATH.read_text(encoding="utf-8"))
        trained_order = [
            name for name, _ in sorted(trained.items(), key=lambda kv: kv[1])
        ]
        if trained_order != class_names:
            print(
                "Warning: the test directories do not match the trained class "
                f"order.\n  trained: {trained_order}\n  test:    {class_names}\n"
                "Metrics below will be meaningless until these agree.",
                file=sys.stderr,
            )

    probabilities = model.predict(test_ds, verbose=1)
    y_pred = np.argmax(probabilities, axis=1)
    y_true = np.argmax(np.concatenate([y for _, y in test_ds], axis=0), axis=1)

    labels_by_key = load_class_labels()
    display_labels = [labels_by_key.get(name, name) for name in class_names]

    accuracy = float((y_pred == y_true).mean())
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true, y_pred, labels=range(len(class_names)), zero_division=0
    )
    macro_p, macro_r, macro_f1, _ = precision_recall_fscore_support(
        y_true, y_pred, average="macro", zero_division=0
    )

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    report_text = classification_report(
        y_true,
        y_pred,
        labels=range(len(class_names)),
        target_names=display_labels,
        zero_division=0,
        digits=4,
    )
    (REPORTS_DIR / "classification_report.txt").write_text(
        report_text, encoding="utf-8"
    )

    matrix = confusion_matrix(y_true, y_pred, labels=range(len(class_names)))
    plot_confusion_matrix(matrix, display_labels, REPORTS_DIR / "confusion_matrix.png")
    curves_written = plot_training_curves(REPORTS_DIR / "training_curves.png")

    metrics = {
        "test_accuracy": round(accuracy, 4),
        "macro_precision": round(float(macro_p), 4),
        "macro_recall": round(float(macro_r), 4),
        "macro_f1": round(float(macro_f1), 4),
        "test_images": int(len(y_true)),
        "per_class": {
            class_names[i]: {
                "label": display_labels[i],
                "precision": round(float(precision[i]), 4),
                "recall": round(float(recall[i]), 4),
                "f1": round(float(f1[i]), 4),
                "support": int(support[i]),
            }
            for i in range(len(class_names))
        },
    }
    (REPORTS_DIR / "metrics.json").write_text(
        json.dumps(metrics, indent=2), encoding="utf-8"
    )

    print("\n" + "=" * 60)
    print(f"Test accuracy:   {accuracy:.4f}  over {len(y_true)} images")
    print(f"Macro precision: {macro_p:.4f}")
    print(f"Macro recall:    {macro_r:.4f}")
    print(f"Macro F1:        {macro_f1:.4f}")
    print("=" * 60)
    print(report_text)

    # The most-confused pair is usually the single most useful line in the
    # write-up — it is the visual-similarity problem from Chapter 1, measured.
    off_diagonal = matrix.copy()
    np.fill_diagonal(off_diagonal, 0)
    if off_diagonal.any():
        i, j = np.unravel_index(off_diagonal.argmax(), off_diagonal.shape)
        print(
            f"Most common confusion: {display_labels[i]} predicted as "
            f"{display_labels[j]} ({off_diagonal[i, j]} times)"
        )

    print(f"\nReports written to {REPORTS_DIR}")
    if not curves_written:
        print("  (no training_curves.png — training_history.csv was missing)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
