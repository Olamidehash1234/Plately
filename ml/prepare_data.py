"""Assemble the training dataset.

Takes the Food-101 download and your own photographs of Nigerian dishes, and
produces the directory layout Keras expects:

    ml/dataset/train/<class>/*.jpg
    ml/dataset/test/<class>/*.jpg

Usage:

    python ml/prepare_data.py \
        --food101 ~/Downloads/food-101/images \
        --nigerian ml/raw_nigerian \
        --limit-per-class 250

`--nigerian` should contain one folder per Nigerian dish, named with the class
key, e.g. ml/raw_nigerian/jollof_rice/*.jpg
"""

import argparse
import random
import shutil
import sys
from pathlib import Path

from common import (
    FOOD101_CLASSES,
    SEED,
    TEST_DIR,
    TRAIN_DIR,
    load_class_keys,
    nigerian_classes,
)

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
TRAIN_FRACTION = 0.75  # Chapter 3 specifies a 75/25 split

# Below this, a class has too few examples to learn anything reliable.
MIN_IMAGES_WARN = 60


def collect_images(directory: Path) -> list[Path]:
    if not directory.is_dir():
        return []
    return sorted(
        p for p in directory.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES
    )


def split_and_copy(
    images: list[Path], class_key: str, limit: int | None, rng: random.Random
) -> tuple[int, int]:
    """Shuffle, optionally cap, then copy into train/ and test/."""
    images = list(images)
    rng.shuffle(images)

    if limit is not None:
        images = images[:limit]

    cut = int(len(images) * TRAIN_FRACTION)
    train_images, test_images = images[:cut], images[cut:]

    for subset, destination_root in ((train_images, TRAIN_DIR), (test_images, TEST_DIR)):
        destination = destination_root / class_key
        destination.mkdir(parents=True, exist_ok=True)
        for index, source in enumerate(subset):
            # Rename on copy so files from different sources cannot collide.
            target = destination / f"{class_key}_{index:05d}{source.suffix.lower()}"
            shutil.copy2(source, target)

    return len(train_images), len(test_images)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--food101",
        type=Path,
        required=True,
        help="Path to the food-101 'images' directory.",
    )
    parser.add_argument(
        "--nigerian",
        type=Path,
        required=True,
        help="Directory of your own photos, one subfolder per class key.",
    )
    parser.add_argument(
        "--limit-per-class",
        type=int,
        default=250,
        help=(
            "Cap images per class. Food-101 ships 1000 per class; without a cap "
            "the international classes would swamp the Nigerian ones."
        ),
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Delete any existing dataset directory first.",
    )
    args = parser.parse_args()

    if args.clean and TRAIN_DIR.parent.exists():
        shutil.rmtree(TRAIN_DIR.parent)

    rng = random.Random(SEED)
    class_keys = load_class_keys()

    print(f"Building dataset for {len(class_keys)} classes\n")

    counts: dict[str, tuple[int, int]] = {}
    problems: list[str] = []

    for class_key in class_keys:
        if class_key in FOOD101_CLASSES:
            source_dir = args.food101 / class_key
            origin = "Food-101"
        else:
            source_dir = args.nigerian / class_key
            origin = "your photos"

        images = collect_images(source_dir)

        if not images:
            problems.append(
                f"  {class_key}: no images found in {source_dir} (expected {origin})"
            )
            counts[class_key] = (0, 0)
            continue

        train_n, test_n = split_and_copy(images, class_key, args.limit_per_class, rng)
        counts[class_key] = (train_n, test_n)
        print(f"  {class_key:<16} {train_n:>4} train  {test_n:>4} test   ({origin})")

    total_train = sum(t for t, _ in counts.values())
    total_test = sum(t for _, t in counts.values())
    print(f"\nTotal: {total_train} training, {total_test} test images")

    if problems:
        print("\nMissing data:")
        for problem in problems:
            print(problem)
        print(
            "\nFor Nigerian dishes, create one folder per class and put your "
            "photos in it:"
        )
        for class_key in nigerian_classes():
            print(f"  {args.nigerian}/{class_key}/")
        return 1

    # Warn rather than fail — a thin class still trains, just unreliably.
    thin = [
        f"{key} ({train + test} images)"
        for key, (train, test) in counts.items()
        if train + test < MIN_IMAGES_WARN
    ]
    if thin:
        print(
            f"\nWarning: these classes have under {MIN_IMAGES_WARN} images and "
            "will likely perform poorly:"
        )
        for entry in thin:
            print(f"  {entry}")
        print("Aim for 150-300 images per class where you can.")

    biggest = max(t + s for t, s in counts.values())
    smallest = min(t + s for t, s in counts.values())
    if smallest and biggest / smallest > 3:
        print(
            f"\nWarning: class imbalance is {biggest / smallest:.1f}:1. The model "
            "will be biased toward the larger classes. Consider lowering "
            "--limit-per-class or collecting more of the smaller ones."
        )

    print(f"\nDataset ready at {TRAIN_DIR.parent}")
    print("Next: python ml/train.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
