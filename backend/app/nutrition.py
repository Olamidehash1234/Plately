"""The food taxonomy and its nutrition reference table.

`data/nutrition.json` is the single source of truth for which classes the system
knows about. The training pipeline reads it to decide which folders to build,
and the API reads it to turn a predicted class into macros. Keeping one file on
both sides is what stops the model and the API drifting apart.
"""

import json
from dataclasses import dataclass
from functools import lru_cache

from app.config import BASE_DIR

NUTRITION_PATH = BASE_DIR / "app" / "data" / "nutrition.json"


@dataclass(frozen=True)
class Macros:
    kcal: float
    protein_g: float
    carbs_g: float
    fat_g: float

    def scaled(self, grams: float) -> "Macros":
        """These are per-100g figures; scale them to an actual portion."""
        factor = grams / 100.0
        return Macros(
            kcal=round(self.kcal * factor, 1),
            protein_g=round(self.protein_g * factor, 1),
            carbs_g=round(self.carbs_g * factor, 1),
            fat_g=round(self.fat_g * factor, 1),
        )


@dataclass(frozen=True)
class FoodClass:
    key: str
    label: str
    cuisine: str
    per_100g: Macros
    default_portion_g: int
    source: str


@lru_cache
def load_classes() -> dict[str, FoodClass]:
    """Load the table, keyed by class key. Cached for the process lifetime."""
    raw = json.loads(NUTRITION_PATH.read_text(encoding="utf-8"))
    classes: dict[str, FoodClass] = {}
    for entry in raw["classes"]:
        macros = entry["per_100g"]
        classes[entry["key"]] = FoodClass(
            key=entry["key"],
            label=entry["label"],
            cuisine=entry["cuisine"],
            per_100g=Macros(
                kcal=macros["kcal"],
                protein_g=macros["protein_g"],
                carbs_g=macros["carbs_g"],
                fat_g=macros["fat_g"],
            ),
            default_portion_g=entry["default_portion_g"],
            source=entry["source"],
        )
    return classes


def get_class(key: str) -> FoodClass | None:
    return load_classes().get(key)


def class_keys() -> list[str]:
    """Class keys in a stable, sorted order.

    Sorted rather than file order because Keras' ImageDataGenerator assigns
    label indices by sorting directory names. Matching that here means the
    model's output index maps onto the same class on both sides.
    """
    return sorted(load_classes().keys())
