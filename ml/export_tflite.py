"""Convert the trained Keras model to TFLite for deployment.

The backend can serve either format, but TFLite is what you want on a server:
the LiteRT interpreter is roughly 50 MB installed against TensorFlow's 600 MB,
and it loads the model in a fraction of the memory. On a small instance that is
the difference between running and being killed by the OOM reaper.

Usage:

    python ml/export_tflite.py                # float32, exact same numbers
    python ml/export_tflite.py --quantize     # ~4x smaller, slightly different

Quantisation shrinks the weights from 32-bit floats to 8-bit integers. For a
classifier of this size the accuracy cost is usually a fraction of a percent,
but it is a real cost, so this script re-runs the test set through the
converted model and prints the agreement rate. Check that before shipping a
quantised model.

Outputs:
    ml/artifacts/model.tflite
"""

import argparse
import sys

from common import ARTIFACTS_DIR, IMAGE_SIZE, MODEL_PATH, TEST_DIR

TFLITE_PATH = ARTIFACTS_DIR / "model.tflite"


def agreement_rate(keras_model, tflite_path, test_dir, tf, keras) -> float | None:
    """Fraction of test images where both models pick the same class.

    Not accuracy — this compares the converted model against the original, so
    it isolates what conversion cost rather than what the model gets right.
    """
    if not test_dir.exists():
        print(f"No test set at {test_dir}; skipping the agreement check.")
        return None

    dataset = keras.utils.image_dataset_from_directory(
        test_dir,
        image_size=(IMAGE_SIZE, IMAGE_SIZE),
        batch_size=1,
        label_mode="categorical",
        shuffle=False,
    )

    from ai_edge_litert.interpreter import Interpreter

    interpreter = Interpreter(model_path=str(tflite_path))
    interpreter.allocate_tensors()
    input_detail = interpreter.get_input_details()[0]
    output_detail = interpreter.get_output_details()[0]

    import numpy as np

    same = 0
    total = 0
    for batch, _ in dataset:
        original = int(np.argmax(keras_model.predict(batch, verbose=0)[0]))

        interpreter.set_tensor(input_detail["index"], batch.numpy())
        interpreter.invoke()
        converted = int(np.argmax(interpreter.get_tensor(output_detail["index"])[0]))

        same += original == converted
        total += 1

    return same / total if total else None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--quantize",
        action="store_true",
        help="Apply default (dynamic range) quantisation. Smaller, slightly lossy.",
    )
    parser.add_argument(
        "--skip-check",
        action="store_true",
        help="Skip comparing the converted model against the original.",
    )
    args = parser.parse_args()

    if not MODEL_PATH.exists():
        print(
            f"No trained model at {MODEL_PATH}.\n"
            "Run ml/train.py first — see ml/README.md.",
            file=sys.stderr,
        )
        return 1

    try:
        import tensorflow as tf
    except ImportError:
        print(
            "TensorFlow is needed to convert the model (not to serve it).\n"
            "  pip install -r backend/requirements-ml.txt",
            file=sys.stderr,
        )
        return 1

    keras = tf.keras
    model = keras.models.load_model(MODEL_PATH)

    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    if args.quantize:
        converter.optimizations = [tf.lite.Optimize.DEFAULT]

    tflite_model = converter.convert()
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    TFLITE_PATH.write_bytes(tflite_model)

    before = MODEL_PATH.stat().st_size / 1_000_000
    after = TFLITE_PATH.stat().st_size / 1_000_000
    print(f"\n{MODEL_PATH.name}: {before:.1f} MB  ->  {TFLITE_PATH.name}: {after:.1f} MB")

    if not args.skip_check:
        try:
            rate = agreement_rate(model, TFLITE_PATH, TEST_DIR, tf, keras)
        except ImportError:
            print(
                "\nInstall the interpreter to verify the conversion:\n"
                "  pip install -r backend/requirements-serve.txt"
            )
        else:
            if rate is not None:
                print(f"Converted model agrees with the original on {rate:.2%} of the test set.")
                if rate < 0.98:
                    print(
                        "\nThat is a meaningful drop. Re-export without "
                        "--quantize, or accept the loss knowingly.",
                        file=sys.stderr,
                    )

    print(f"\nThe backend prefers {TFLITE_PATH.name} automatically when it is present.")
    print("Deploy with:  pip install -r backend/requirements-serve.txt")
    return 0


if __name__ == "__main__":
    sys.exit(main())
