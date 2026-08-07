"""Look through a web harvest and throw out the wrong pictures.

`screen_harvest.py` removes what is obviously not food. It cannot tell eba
from pounded yam, and it happily keeps a photograph of a market stall because
there is a bowl in shot. That last pass is yours, and this is the tool for it.

    python ml/review_harvest.py dedupe             # same photo, two sources
    python ml/review_harvest.py sheet              # build the contact sheets
    python ml/review_harvest.py sheet --class eba
    python ml/review_harvest.py drop --class eba 3 7 12 40
    python ml/review_harvest.py restore --class eba 7

Run `dedupe` first. Openverse aggregates Flickr and Wikimedia, so the same
photograph can arrive twice under two URLs; left alone, a copy in the training
split and a copy in the test split turn into accuracy the model has not earned.

`sheet` writes `docs/harvest-review/<class>.png`: every surviving image in the
class, in a grid, each tile captioned with an index. Open it, note the indices
of the ones that are wrong, and pass them to `drop`.

Indices are positions in the sorted file listing, so they shift as soon as you
drop something. Work one class at a time: read the sheet, drop everything you
spotted in a single command, then rebuild the sheet before looking again.

Dropped images move to `<class>/_rejected/`, the same place the screener puts
its rejects. Nothing is deleted, so a mistake costs you a `restore`.
"""

import argparse
import shutil
import sys
from pathlib import Path

from common import ML_DIR, PROJECT_ROOT, nigerian_classes

HARVEST_DIR = ML_DIR / "web_harvest"
REVIEW_DIR = PROJECT_ROOT / "docs" / "harvest-review"

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}

# Contact sheet layout. Eight tiles across at 220px keeps a sheet of sixty
# images legible at full width on a laptop without being enormous.
COLUMNS = 8
TILE = 220
CAPTION_HEIGHT = 18
PADDING = 6


def images_in(class_key: str) -> list[Path]:
    """The class's surviving images, in the order the indices refer to."""
    folder = HARVEST_DIR / class_key
    if not folder.is_dir():
        return []
    return sorted(
        p for p in folder.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES
    )


def build_sheet(class_key: str) -> Path | None:
    from PIL import Image, ImageDraw  # noqa: PLC0415

    images = images_in(class_key)
    if not images:
        print(f"  {class_key}: nothing left to review")
        return None

    rows = -(-len(images) // COLUMNS)  # ceiling division
    cell_h = TILE + CAPTION_HEIGHT + PADDING
    sheet = Image.new(
        "RGB",
        (COLUMNS * (TILE + PADDING) + PADDING, rows * cell_h + PADDING),
        "white",
    )
    draw = ImageDraw.Draw(sheet)

    for index, path in enumerate(images):
        column, row = index % COLUMNS, index // COLUMNS
        x = PADDING + column * (TILE + PADDING)
        y = PADDING + row * cell_h

        try:
            with Image.open(path) as source:
                thumb = source.convert("RGB")
                thumb.thumbnail((TILE, TILE))
        except OSError:
            draw.text((x, y + CAPTION_HEIGHT), f"{index} unreadable", fill="red")
            continue

        draw.text((x, y), f"{index}  {path.name}", fill="black")
        sheet.paste(thumb, (x, y + CAPTION_HEIGHT))

    REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    out = REVIEW_DIR / f"{class_key}.png"
    sheet.save(out)
    print(f"  {class_key}: {len(images)} images -> {out}")
    return out


def move(paths: list[Path], destination: Path) -> int:
    destination.mkdir(exist_ok=True)
    moved = 0
    for path in paths:
        target = destination / path.name
        if target.exists():
            print(f"    {path.name}: already there, skipped")
            continue
        shutil.move(str(path), str(target))
        moved += 1
    return moved


def drop(class_key: str, indices: list[int]) -> int:
    images = images_in(class_key)
    if not images:
        print(f"No images for {class_key}.", file=sys.stderr)
        return 1

    out_of_range = [i for i in indices if i < 0 or i >= len(images)]
    if out_of_range:
        print(
            f"{class_key} has indices 0-{len(images) - 1}; "
            f"no such image: {', '.join(map(str, out_of_range))}",
            file=sys.stderr,
        )
        return 1

    chosen = [images[i] for i in sorted(set(indices))]
    for index, path in zip(sorted(set(indices)), chosen, strict=True):
        print(f"    drop {index}: {path.name}")

    moved = move(chosen, HARVEST_DIR / class_key / "_rejected")
    remaining = len(images) - moved
    print(f"\n{class_key}: dropped {moved}, {remaining} left.")
    print("Indices have shifted — rebuild the sheet before reviewing again:")
    print(f"    python ml/review_harvest.py sheet --class {class_key}")
    return 0


def dedupe(class_key: str) -> tuple[int, int]:
    """Reject any image that is the same photograph as an earlier one.

    Uses the harvester's own fingerprint so both agree on what "the same
    photograph" means. The first copy in sorted order is the one kept.
    """
    from fetch_web_images import average_hash, is_duplicate  # noqa: PLC0415

    images = images_in(class_key)
    kept_hashes: list[int] = []
    duplicates: list[Path] = []

    for path in images:
        fingerprint = average_hash(path)
        if fingerprint is None:
            continue
        if is_duplicate(fingerprint, kept_hashes):
            duplicates.append(path)
            print(f"    duplicate: {path.name}")
            continue
        kept_hashes.append(fingerprint)

    if duplicates:
        move(duplicates, HARVEST_DIR / class_key / "_rejected")

    print(f"  {class_key}: {len(images)} images, {len(duplicates)} duplicates removed")
    return len(images) - len(duplicates), len(duplicates)


def restore(class_key: str, names: list[str]) -> int:
    rejected = HARVEST_DIR / class_key / "_rejected"
    if not rejected.is_dir():
        print(f"Nothing rejected for {class_key}.", file=sys.stderr)
        return 1

    paths = []
    for name in names:
        path = rejected / name
        if not path.is_file():
            print(f"    {name}: not in _rejected", file=sys.stderr)
            continue
        paths.append(path)

    if not paths:
        return 1

    moved = move(paths, HARVEST_DIR / class_key)
    print(f"\n{class_key}: restored {moved}.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    dedupe_parser = subparsers.add_parser(
        "dedupe", help="Reject repeats of the same photograph."
    )
    dedupe_parser.add_argument("--class", dest="class_key", choices=nigerian_classes())

    sheet_parser = subparsers.add_parser("sheet", help="Build the contact sheets.")
    sheet_parser.add_argument("--class", dest="class_key", choices=nigerian_classes())

    drop_parser = subparsers.add_parser("drop", help="Reject images by index.")
    drop_parser.add_argument(
        "--class", dest="class_key", choices=nigerian_classes(), required=True
    )
    drop_parser.add_argument("indices", nargs="+", type=int)

    restore_parser = subparsers.add_parser(
        "restore", help="Put rejected images back, by filename."
    )
    restore_parser.add_argument(
        "--class", dest="class_key", choices=nigerian_classes(), required=True
    )
    restore_parser.add_argument("names", nargs="+")

    args = parser.parse_args()

    if not HARVEST_DIR.is_dir():
        print(f"No harvest at {HARVEST_DIR}.", file=sys.stderr)
        return 1

    if args.command == "dedupe":
        classes = [args.class_key] if args.class_key else nigerian_classes()
        print("Looking for repeated photographs…")
        total = 0
        for class_key in classes:
            total += dedupe(class_key)[1]
        print(f"\n{total} duplicates moved to <class>/_rejected/.")
        print("Rebuild the sheets before reviewing: python ml/review_harvest.py sheet")
        return 0

    if args.command == "sheet":
        classes = [args.class_key] if args.class_key else nigerian_classes()
        print("Building contact sheets…")
        for class_key in classes:
            build_sheet(class_key)
        print(f"\nOpen them from {REVIEW_DIR}")
        return 0

    if args.command == "drop":
        return drop(args.class_key, args.indices)

    return restore(args.class_key, args.names)


if __name__ == "__main__":
    sys.exit(main())
