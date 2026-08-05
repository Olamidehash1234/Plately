"""Shared constants for the training pipeline.

The class list is read from the backend's nutrition table rather than
duplicated here, so there is exactly one place that decides what the system
can recognise.
"""

import json
from pathlib import Path

ML_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = ML_DIR.parent

DATASET_DIR = ML_DIR / "dataset"
TRAIN_DIR = DATASET_DIR / "train"
TEST_DIR = DATASET_DIR / "test"

ARTIFACTS_DIR = ML_DIR / "artifacts"
MODEL_PATH = ARTIFACTS_DIR / "model.keras"
CLASS_INDEX_PATH = ARTIFACTS_DIR / "class_indices.json"
HISTORY_PATH = ARTIFACTS_DIR / "training_history.csv"
REPORTS_DIR = ARTIFACTS_DIR / "reports"

NUTRITION_PATH = PROJECT_ROOT / "backend" / "app" / "data" / "nutrition.json"

IMAGE_SIZE = 224
BATCH_SIZE = 32
SEED = 42

# Which of our class keys come from the Food-101 download. The keys were
# chosen to match Food-101's own directory names exactly, so no mapping table
# is needed. The rest are the Nigerian dishes you photograph yourself.
FOOD101_CLASSES = {
    "caesar_salad",
    "french_fries",
    "fried_rice",
    "grilled_salmon",
    "hamburger",
    "pizza",
}


def load_class_keys() -> list[str]:
    """All class keys, sorted.

    Sorted order matters: Keras assigns label indices by sorting the class
    directory names, so this is the order the model's output vector uses.
    """
    raw = json.loads(NUTRITION_PATH.read_text(encoding="utf-8"))
    return sorted(entry["key"] for entry in raw["classes"])


def load_class_labels() -> dict[str, str]:
    """Class key -> human-readable label, for chart axes."""
    raw = json.loads(NUTRITION_PATH.read_text(encoding="utf-8"))
    return {entry["key"]: entry["label"] for entry in raw["classes"]}


def nigerian_classes() -> list[str]:
    return [key for key in load_class_keys() if key not in FOOD101_CLASSES]
