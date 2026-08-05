"""Loads the trained CNN and runs inference.

Two backends are supported, and the right one is chosen at load time:

  LiteRT   ml/artifacts/model.tflite with the `ai_edge_litert` interpreter.
           Preferred wherever it is available — about 50 MB installed against
           TensorFlow's ~600 MB, and a correspondingly smaller memory
           footprint. This is what deployment should use.
  Keras    ml/artifacts/model.keras with full TensorFlow. What training
           produces, and what a development machine will normally have.

Both are imported lazily and the model is loaded on first use, for two reasons:
importing either costs startup time, and the backend is designed to run
perfectly well before any model exists. Every failure mode here surfaces as a
clear message rather than a stack trace, because "no model yet" is an expected
state during development, not a bug.
"""

import json
import logging
import threading
from dataclasses import dataclass

import numpy as np
from PIL import Image

from app.config import settings
from app.nutrition import get_class

logger = logging.getLogger(__name__)


class ModelUnavailableError(RuntimeError):
    """Raised when inference is requested but the model cannot be served."""


@dataclass(frozen=True)
class Prediction:
    key: str
    label: str
    confidence: float


def _load_interpreter_class():
    """The LiteRT interpreter, under whichever name is installed.

    `ai_edge_litert` is the current package; `tflite_runtime` is its former
    name and still what older environments have. Full TensorFlow bundles the
    same interpreter, which is why it is worth trying last rather than not at
    all.
    """
    try:
        from ai_edge_litert.interpreter import Interpreter

        return Interpreter
    except ImportError:
        pass

    try:
        from tflite_runtime.interpreter import Interpreter

        return Interpreter
    except ImportError:
        pass

    try:
        from tensorflow.lite import Interpreter

        return Interpreter
    except ImportError:
        return None


def _tensorflow_available() -> bool:
    try:
        import tensorflow  # noqa: F401
    except ImportError:
        return False
    return True


class Predictor:
    """Thread-safe lazy loader around the trained model."""

    def __init__(self) -> None:
        self._predict_fn = None
        self._backend: str | None = None
        self._class_names: list[str] = []
        self._lock = threading.Lock()
        # Separate from the load lock: the LiteRT interpreter holds one set of
        # input/output tensors, so concurrent invokes would corrupt each other.
        self._infer_lock = threading.Lock()

    # --- availability -------------------------------------------------------
    def availability_error(self) -> str | None:
        """Return why inference is unavailable, or None if it should work.

        The message names the specific thing that is missing, because the most
        common cause is simply that training has not been run yet and the
        clearest possible answer saves a debugging session.
        """
        has_tflite_model = settings.tflite_model_path.exists()
        has_keras_model = settings.model_path.exists()

        if not has_tflite_model and not has_keras_model:
            return (
                f"No trained model found at {settings.model_path} or "
                f"{settings.tflite_model_path}. Train one with "
                "'python ml/train.py' — see ml/README.md."
            )

        if has_tflite_model and _load_interpreter_class() is not None:
            runtime_ok = True
        elif has_keras_model and _tensorflow_available():
            runtime_ok = True
        else:
            runtime_ok = False

        if not runtime_ok:
            if has_tflite_model:
                return (
                    "A TFLite model is present but no interpreter is installed. "
                    "Run 'pip install -r requirements-serve.txt'."
                )
            return (
                "A Keras model is present but TensorFlow is not installed. "
                "Run 'pip install -r requirements-ml.txt' to enable "
                "classification, or export a TFLite model with "
                "'python ml/export_tflite.py' and install "
                "requirements-serve.txt instead."
            )

        if not settings.class_index_path.exists():
            return (
                f"No class index found at {settings.class_index_path}. "
                "It is written alongside the model by ml/train.py."
            )

        return None

    @property
    def is_ready(self) -> bool:
        return self.availability_error() is None

    @property
    def backend(self) -> str | None:
        """Which backend is loaded, once something has been classified."""
        return self._backend

    # --- loading ------------------------------------------------------------
    def _load_class_names(self) -> list[str]:
        # class_indices maps class name -> output index. Invert it so we can go
        # from the model's argmax back to a class name.
        raw = json.loads(settings.class_index_path.read_text(encoding="utf-8"))
        by_index = {int(index): name for name, index in raw.items()}
        return [by_index[i] for i in sorted(by_index)]

    def _build_tflite(self, interpreter_class):
        logger.info("Loading TFLite model from %s", settings.tflite_model_path)
        interpreter = interpreter_class(model_path=str(settings.tflite_model_path))
        interpreter.allocate_tensors()
        input_detail = interpreter.get_input_details()[0]
        output_detail = interpreter.get_output_details()[0]

        def predict(batch: np.ndarray) -> np.ndarray:
            # The interpreter is not thread-safe: one request at a time.
            with self._infer_lock:
                interpreter.set_tensor(input_detail["index"], batch)
                interpreter.invoke()
                return interpreter.get_tensor(output_detail["index"])[0]

        return predict, int(output_detail["shape"][-1])

    def _build_keras(self):
        import tensorflow as tf

        logger.info("Loading Keras model from %s", settings.model_path)
        model = tf.keras.models.load_model(settings.model_path)

        def predict(batch: np.ndarray) -> np.ndarray:
            return model.predict(batch, verbose=0)[0]

        return predict, int(model.output_shape[-1])

    def _ensure_loaded(self) -> None:
        if self._predict_fn is not None:
            return

        with self._lock:
            # Re-check: another thread may have loaded it while we waited.
            if self._predict_fn is not None:
                return

            error = self.availability_error()
            if error:
                raise ModelUnavailableError(error)

            interpreter_class = _load_interpreter_class()
            if settings.tflite_model_path.exists() and interpreter_class is not None:
                predict_fn, output_units = self._build_tflite(interpreter_class)
                backend = "litert"
            else:
                predict_fn, output_units = self._build_keras()
                backend = "keras"

            class_names = self._load_class_names()
            if output_units != len(class_names):
                raise ModelUnavailableError(
                    f"Model outputs {output_units} classes but the class index "
                    f"lists {len(class_names)}. They are from different "
                    "training runs — retrain or restore the matching pair."
                )

            self._predict_fn = predict_fn
            self._class_names = class_names
            self._backend = backend
            logger.info(
                "Model ready via %s with %d classes", backend, len(class_names)
            )

    # --- inference ----------------------------------------------------------
    def preprocess(self, image: Image.Image) -> np.ndarray:
        """Resize to the model's input size and hand over raw pixels.

        Deliberately no scaling here. ml/train.py bakes the [-1, 1] rescaling
        into the model as a layer, so the model expects 0-255 values. Doing it
        in both places — or in neither — is the classic train/serve skew bug,
        and it fails silently as merely-poor accuracy rather than an error.

        Bilinear resize matches image_dataset_from_directory's default.
        """
        size = settings.image_size
        resized = image.convert("RGB").resize((size, size), Image.BILINEAR)
        array = np.asarray(resized, dtype=np.float32)
        return np.expand_dims(array, axis=0)

    def predict(self, image: Image.Image, top_k: int = 3) -> list[Prediction]:
        """Return the top-k predictions, most confident first."""
        self._ensure_loaded()

        batch = self.preprocess(image)
        probabilities = self._predict_fn(batch)

        top_k = min(top_k, len(self._class_names))
        best_indices = np.argsort(probabilities)[::-1][:top_k]

        predictions: list[Prediction] = []
        for index in best_indices:
            key = self._class_names[int(index)]
            food = get_class(key)
            predictions.append(
                Prediction(
                    key=key,
                    # Fall back to the raw key if the model knows a class the
                    # nutrition table has since dropped.
                    label=food.label if food else key.replace("_", " ").title(),
                    confidence=round(float(probabilities[int(index)]), 4),
                )
            )
        return predictions


# One process-wide instance so the model is loaded at most once.
predictor = Predictor()
