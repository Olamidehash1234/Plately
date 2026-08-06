"""Throw out the obvious rubbish from a web harvest, before you review it.

Search engines match words, not pictures. Searching Commons for "amala"
returns the dish, an actress of that name, and a run of swallows; "eba garri"
returns plates of eba and a great deal of cassava being processed. Reviewing
360 images by hand to find that out is the tedious part.

This runs MobileNetV2 — the same network the project fine-tunes, but with its
original ImageNet classifier still attached — over the harvest and asks a
narrow question: does this look like food at all? ImageNet knows a thousand
everyday categories, including a hundred-odd birds, plenty of dogs and people,
and a good number of dishes and tableware. An image whose predictions are all
birds is not your dinner.

    python ml/screen_harvest.py                  # screen every class
    python ml/screen_harvest.py --class amala
    python ml/screen_harvest.py --dry-run        # report only, move nothing

Rejects are moved to `ml/web_harvest/<class>/_rejected/`, never deleted, so
you can look through them if a call seems wrong. What survives still needs
your eyes — this only removes what is obviously not food.
"""

import argparse
import shutil
import sys
from pathlib import Path

from common import ML_DIR, nigerian_classes

HARVEST_DIR = ML_DIR / "web_harvest"

# ImageNet class names that mean "this is food, a dish, or the crockery it is
# served on". Matched as substrings against the top predictions, so "soup
# bowl" catches the bowl and "plate" catches the plate.
FOOD_HINTS = {
    "plate", "bowl", "soup", "dish", "meat", "loaf", "bread", "rice", "pizza",
    "burrito", "hotdog", "cheeseburger", "guacamole", "mashed", "potato",
    "cabbage", "broccoli", "cauliflower", "zucchini", "squash", "cucumber",
    "artichoke", "pepper", "mushroom", "corn", "carbonara", "meatloaf",
    "spaghetti", "pretzel", "bagel", "trifle", "ice", "espresso", "cup",
    "eggnog", "chocolate", "dough", "pot", "pan", "skillet", "wok",
    "tray", "spatula", "ladle", "wooden spoon", "caldron", "mixing",
    "consomme", "hay", "banana", "orange", "lemon", "fig", "pineapple",
    "jackfruit", "custard", "burrito", "cheese", "bakery", "restaurant",
    "grocery", "confectionery", "menu", "spindle",
}

# How far down the ranking to look for any hint of food.
TOP_K = 8


def load_model():
    """Import TensorFlow lazily — it is slow, and --help should not pay for it."""
    from tensorflow.keras.applications import MobileNetV2  # noqa: PLC0415

    print("Loading MobileNetV2 with its ImageNet classifier…")
    return MobileNetV2(weights="imagenet")


def looks_like_food(predictions) -> tuple[bool, str]:
    """True if any top prediction resembles food or the things food sits in."""
    labels = [label.replace("_", " ").lower() for _, label, _ in predictions]
    for label in labels:
        if any(hint in label for hint in FOOD_HINTS):
            return True, label
    return False, labels[0] if labels else "unknown"


def screen(class_key: str, model, dry_run: bool) -> tuple[int, int]:
    import numpy as np  # noqa: PLC0415
    from tensorflow.keras.applications.mobilenet_v2 import (  # noqa: PLC0415
        decode_predictions,
        preprocess_input,
    )
    from tensorflow.keras.utils import img_to_array, load_img  # noqa: PLC0415

    folder = HARVEST_DIR / class_key
    if not folder.is_dir():
        print(f"  no harvest for {class_key}")
        return 0, 0

    images = sorted(
        p for p in folder.iterdir()
        if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}
    )
    if not images:
        return 0, 0

    rejected_dir = folder / "_rejected"
    kept = dropped = 0

    for path in images:
        try:
            image = load_img(path, target_size=(224, 224))
        except OSError:
            print(f"    {path.name}: unreadable")
            continue

        batch = preprocess_input(np.expand_dims(img_to_array(image), 0))
        predictions = decode_predictions(model.predict(batch, verbose=0), top=TOP_K)[0]

        food, label = looks_like_food(predictions)
        if food:
            kept += 1
            continue

        dropped += 1
        print(f"    reject {path.name}: looks like '{label}'")
        if not dry_run:
            rejected_dir.mkdir(exist_ok=True)
            shutil.move(str(path), str(rejected_dir / path.name))

    return kept, dropped


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--class",
        dest="class_key",
        choices=nigerian_classes(),
        help="Screen a single dish (default: all).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would be rejected without moving anything.",
    )
    args = parser.parse_args()

    if not HARVEST_DIR.is_dir():
        print(f"Nothing to screen: {HARVEST_DIR} does not exist.", file=sys.stderr)
        return 1

    model = load_model()
    classes = [args.class_key] if args.class_key else nigerian_classes()

    totals = {}
    for class_key in classes:
        print(f"\n{class_key}")
        totals[class_key] = screen(class_key, model, args.dry_run)

    print("\n" + "=" * 46)
    print(f"{'class':<16}{'kept':>7}{'rejected':>10}")
    for class_key, (kept, dropped) in totals.items():
        print(f"{class_key:<16}{kept:>7}{dropped:>10}")

    if args.dry_run:
        print("\nDry run — nothing was moved.")
    else:
        print(
            "\nRejects are in <class>/_rejected/, not deleted.\n"
            "What is left still needs your eyes: this only removes what is "
            "obviously not food, and cannot tell eba from pounded yam."
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
