"""Backend selection and the messages shown when inference is unavailable.

These are the paths that decide whether a deployment can serve predictions at
all, and the ones a developer meets first when nothing has been trained yet. No
real model is loaded here — the point is which branch is taken and what it says.
"""

import pytest

from app.config import settings
from app.ml import predictor as predictor_module
from app.ml.predictor import Predictor


@pytest.fixture
def model_paths(tmp_path, monkeypatch):
    """Point the settings at an empty directory and hand back the paths."""
    keras_path = tmp_path / "model.keras"
    tflite_path = tmp_path / "model.tflite"
    index_path = tmp_path / "class_indices.json"

    monkeypatch.setattr(settings, "model_path", keras_path)
    monkeypatch.setattr(settings, "tflite_model_path", tflite_path)
    monkeypatch.setattr(settings, "class_index_path", index_path)
    return keras_path, tflite_path, index_path


def test_no_model_at_all_explains_how_to_train(model_paths):
    error = Predictor().availability_error()
    assert error is not None
    assert "ml/train.py" in error


def test_tflite_model_without_an_interpreter_names_the_fix(model_paths, monkeypatch):
    _, tflite_path, index_path = model_paths
    tflite_path.write_bytes(b"not really a model")
    index_path.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(predictor_module, "_load_interpreter_class", lambda: None)

    error = Predictor().availability_error()
    assert error is not None
    assert "requirements-serve.txt" in error


def test_keras_model_without_tensorflow_names_both_options(model_paths, monkeypatch):
    keras_path, _, index_path = model_paths
    keras_path.write_bytes(b"not really a model")
    index_path.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(predictor_module, "_load_interpreter_class", lambda: None)
    monkeypatch.setattr(predictor_module, "_tensorflow_available", lambda: False)

    error = Predictor().availability_error()
    assert error is not None
    # Either installing TensorFlow or exporting to TFLite would fix it, and the
    # message should not push the reader towards the 600MB one by omission.
    assert "requirements-ml.txt" in error
    assert "export_tflite.py" in error


def test_a_model_with_no_class_index_is_reported(model_paths, monkeypatch):
    _, tflite_path, _ = model_paths
    tflite_path.write_bytes(b"not really a model")
    monkeypatch.setattr(predictor_module, "_load_interpreter_class", lambda: object)

    error = Predictor().availability_error()
    assert error is not None
    assert "class index" in error.lower()


def test_available_when_a_model_and_an_interpreter_are_present(
    model_paths, monkeypatch
):
    _, tflite_path, index_path = model_paths
    tflite_path.write_bytes(b"not really a model")
    index_path.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(predictor_module, "_load_interpreter_class", lambda: object)

    assert Predictor().availability_error() is None


def test_class_count_mismatch_is_refused(model_paths, monkeypatch):
    """A model and an index from different runs must not be silently combined.

    Mismatched pairs would otherwise map every prediction onto the wrong label,
    which is far harder to notice than a refusal.
    """
    _, tflite_path, index_path = model_paths
    tflite_path.write_bytes(b"not really a model")
    index_path.write_text('{"pizza": 0, "eba": 1}', encoding="utf-8")

    monkeypatch.setattr(predictor_module, "_load_interpreter_class", lambda: object)

    predictor = Predictor()
    # Pretend the loaded model has five outputs against the index's two.
    monkeypatch.setattr(
        predictor, "_build_tflite", lambda interpreter_class: (lambda batch: None, 5)
    )

    with pytest.raises(predictor_module.ModelUnavailableError) as excinfo:
        predictor._ensure_loaded()
    assert "5 classes" in str(excinfo.value)
    assert "lists 2" in str(excinfo.value)
