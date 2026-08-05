"""Ingest and curate your own photographs of the six Nigerian dishes.

No public dataset covers jollof rice, egusi soup, pounded yam, amala, eba or
moi moi, so these images are the one input to this project that cannot be
regenerated. This script takes a phone dump and turns it into the clean,
de-duplicated folders that prepare_data.py reads.

    python ml/collect_nigerian.py init                       # create the folders
    python ml/collect_nigerian.py add jollof_rice ~/photos/   # ingest
    python ml/collect_nigerian.py status                      # how far along you are
    python ml/collect_nigerian.py check                       # re-scan what is stored

Ingesting a photo means: verifying it opens, applying the camera's rotation,
dropping the remaining EXIF (which carries GPS), converting to RGB JPEG,
shrinking anything enormous, and refusing exact or near duplicates. Duplicates
matter more than they sound: the same plate appearing in both the training and
the test split makes the accuracy in Chapter 4 look better than it is.
"""

import argparse
import hashlib
import sys
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps, ImageStat

from common import IMAGE_SIZE, ML_DIR, load_class_labels, nigerian_classes

RAW_DIR = ML_DIR / "raw_nigerian"

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".bmp"}

# Training crops to 224x224, so anything smaller is upscaled guesswork.
MIN_EDGE = IMAGE_SIZE

# Nothing is gained by storing more than this; it just slows every epoch.
MAX_EDGE = 1024
JPEG_QUALITY = 90

# Two images whose 64-bit average hashes differ by this little are the same
# shot for training purposes — a re-encode, a crop, or a burst frame.
NEAR_DUPLICATE_BITS = 4

# Below this, an image is soft enough to be worth a second look — camera shake
# or a missed focus. It is a rough signal, so such images are flagged, not
# discarded. See sharpness() for what the number means.
SHARPNESS_SAMPLE_EDGE = 512
SHARPNESS_THRESHOLD = 1.35

TARGET_PER_CLASS = 150

# The three swallows look alike and are the classes the model is most likely
# to confuse, so they need the most examples and the most variation.
CONFUSABLE = {"amala", "eba", "pounded_yam"}

SHOT_LIST = """\
Photograph this dish {target}+ times, varying deliberately:

  lighting     daylight, indoor bulb, evening
  angle        directly overhead, 45 degrees, eye level
  dishware     different plates, bowls, colours
  plating      full portion, half eaten, served with sides
  background   table, counter, tray

The model learns whatever stays constant across your photos. If every shot is
the same plate on the same table, it learns the plate.

Ingest them with:

    python ml/collect_nigerian.py add {class_key} <folder or files>
"""


def average_hash(image: Image.Image) -> int:
    """64-bit perceptual hash: 8x8 greyscale, thresholded at the mean."""
    small = image.convert("L").resize((8, 8), Image.Resampling.LANCZOS)
    pixels = list(small.tobytes())
    mean = sum(pixels) / len(pixels)

    bits = 0
    for index, value in enumerate(pixels):
        if value > mean:
            bits |= 1 << index
    return bits


def sharpness(image: Image.Image) -> float:
    """How much edge detail an image loses when deliberately blurred.

    A sharp photo has far more edge energy than a blurred copy of itself; an
    already-soft one barely changes, so the ratio lands near 1. Raw edge
    energy cannot be used directly — it rises as an image shrinks and as the
    scene gets busier, so it is not comparable between photos. In practice a
    well-focused meal photo scores about 1.6-2.1.
    """
    grey = image.convert("L")
    grey.thumbnail(
        (SHARPNESS_SAMPLE_EDGE, SHARPNESS_SAMPLE_EDGE), Image.Resampling.LANCZOS
    )

    def edge_energy(sample: Image.Image) -> float:
        return ImageStat.Stat(sample.filter(ImageFilter.FIND_EDGES)).stddev[0]

    softened = edge_energy(grey.filter(ImageFilter.GaussianBlur(2)))
    return edge_energy(grey) / softened if softened else 0.0


def class_dir(class_key: str) -> Path:
    return RAW_DIR / class_key


def stored_images(class_key: str) -> list[Path]:
    directory = class_dir(class_key)
    if not directory.is_dir():
        return []
    return sorted(p for p in directory.iterdir() if p.suffix.lower() == ".jpg")


def gather_sources(paths: list[Path]) -> list[Path]:
    """Expand directories, keep only plausible image files."""
    found: list[Path] = []
    for path in paths:
        if path.is_dir():
            found.extend(
                p
                for p in sorted(path.rglob("*"))
                if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES
            )
        elif path.is_file():
            found.append(path)
        else:
            print(f"  skipped, no such path: {path}")
    return found


def existing_hashes(class_key: str) -> dict[int, Path]:
    hashes: dict[int, Path] = {}
    for path in stored_images(class_key):
        try:
            with Image.open(path) as image:
                hashes[average_hash(image)] = path
        except OSError:
            print(f"  warning: {path.name} is stored but will not open")
    return hashes


def is_near_duplicate(candidate: int, seen: dict[int, Path]) -> Path | None:
    for known, path in seen.items():
        if bin(candidate ^ known).count("1") <= NEAR_DUPLICATE_BITS:
            return path
    return None


def normalise(image: Image.Image) -> Image.Image:
    """Apply the camera's rotation, drop EXIF, cap the size, force RGB."""
    image = ImageOps.exif_transpose(image)
    image = image.convert("RGB")
    if max(image.size) > MAX_EDGE:
        image.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)

    # A fresh image object carries no EXIF, so location data cannot leak into
    # a dataset that may be shared or submitted.
    clean = Image.new("RGB", image.size)
    clean.paste(image)
    return clean


def add(class_key: str, sources: list[Path], reject_blurry: bool) -> int:
    if class_key not in nigerian_classes():
        print(f"Unknown class '{class_key}'. Expected one of:", file=sys.stderr)
        for key in nigerian_classes():
            print(f"  {key}", file=sys.stderr)
        return 1

    files = gather_sources(sources)
    if not files:
        print("No image files found in what you passed.")
        return 1

    destination = class_dir(class_key)
    destination.mkdir(parents=True, exist_ok=True)

    seen = existing_hashes(class_key)
    print(f"Adding to {class_key} ({len(seen)} images already stored)\n")

    added = duplicates = rejected = blurry = 0

    for source in files:
        try:
            with Image.open(source) as opened:
                image = normalise(opened)
        except (OSError, ValueError) as error:
            print(f"  rejected {source.name}: cannot read it ({error})")
            rejected += 1
            continue

        if min(image.size) < MIN_EDGE:
            print(
                f"  rejected {source.name}: {image.width}x{image.height} is "
                f"smaller than the {MIN_EDGE}px training size"
            )
            rejected += 1
            continue

        fingerprint = average_hash(image)
        match = is_near_duplicate(fingerprint, seen)
        if match is not None:
            print(f"  duplicate {source.name}: same shot as {match.name}")
            duplicates += 1
            continue

        focus = sharpness(image)
        if focus < SHARPNESS_THRESHOLD:
            if reject_blurry:
                print(f"  rejected {source.name}: looks soft ({focus:.2f})")
                rejected += 1
                continue
            print(f"  warning: {source.name} looks soft ({focus:.2f})")
            blurry += 1

        # Name from the content, so re-ingesting the same file is harmless.
        digest = hashlib.sha256(source.read_bytes()).hexdigest()[:10]
        target = destination / f"{class_key}_{digest}.jpg"
        image.save(target, "JPEG", quality=JPEG_QUALITY)

        seen[fingerprint] = target
        added += 1

    print(
        f"\nAdded {added}, skipped {duplicates} duplicates, rejected {rejected}."
        + (f" {blurry} kept but flagged as soft." if blurry else "")
    )
    total = len(stored_images(class_key))
    print(f"{class_key} now has {total} images (target {TARGET_PER_CLASS}).")
    return 0


def scan(class_key: str) -> dict[str, object]:
    """Count, and re-check, everything stored for one class."""
    paths = stored_images(class_key)
    hashes: dict[int, Path] = {}
    duplicates: list[tuple[Path, Path]] = []
    soft: list[Path] = []
    broken: list[Path] = []

    for path in paths:
        try:
            with Image.open(path) as image:
                image.load()
                fingerprint = average_hash(image)
                if sharpness(image) < SHARPNESS_THRESHOLD:
                    soft.append(path)
        except OSError:
            broken.append(path)
            continue

        match = is_near_duplicate(fingerprint, hashes)
        if match is not None:
            duplicates.append((path, match))
        else:
            hashes[fingerprint] = path

    return {
        "count": len(paths),
        "duplicates": duplicates,
        "soft": soft,
        "broken": broken,
    }


def status(target: int, deep: bool) -> int:
    labels = load_class_labels()
    classes = nigerian_classes()

    if not RAW_DIR.exists():
        print(f"No {RAW_DIR} yet. Run: python ml/collect_nigerian.py init")
        return 1

    print(f"Nigerian dishes in {RAW_DIR}  (target {target} each)\n")

    counts: dict[str, int] = {}
    findings: dict[str, dict[str, object]] = {}

    for class_key in classes:
        if deep:
            result = scan(class_key)
            findings[class_key] = result
            count = int(result["count"])
        else:
            count = len(stored_images(class_key))
        counts[class_key] = count

        filled = min(20, round(count / target * 20)) if target else 20
        bar = "#" * filled + "." * (20 - filled)
        flag = "  <- confusable, needs extra" if class_key in CONFUSABLE else ""
        print(f"  {labels.get(class_key, class_key):<14} {bar} {count:>4}{flag}")

    total = sum(counts.values())
    print(f"\n  {total} images across {len(classes)} classes")

    if deep:
        for class_key, result in findings.items():
            for path, match in result["duplicates"]:  # type: ignore[union-attr]
                print(f"  duplicate: {path.name} matches {match.name}")
            for path in result["broken"]:  # type: ignore[union-attr]
                print(f"  unreadable: {path}")
            soft = result["soft"]  # type: ignore[assignment]
            if soft:
                plural = "image" if len(soft) == 1 else "images"
                print(f"  {class_key}: {len(soft)} soft-focus {plural}")

    short = [key for key, count in counts.items() if count < target]
    if short:
        short.sort(key=lambda key: counts[key])
        print("\nStill short:")
        for class_key in short:
            need = target - counts[class_key]
            print(f"  {class_key:<14} {need:>4} more")
        print(f"\nShoot {short[0]} next — it is the furthest behind.")
    else:
        print("\nEvery class has reached the target.")
        print("Next: python ml/prepare_data.py --food101 ml/raw_food101 \\")
        print("          --nigerian ml/raw_nigerian")

    biggest, smallest = max(counts.values()), min(counts.values())
    if smallest and biggest / smallest > 2:
        print(
            f"\nImbalance is {biggest / smallest:.1f}:1. prepare_data.py caps the "
            "large classes, but the model still learns the small ones worse."
        )

    return 0


def init(target: int) -> int:
    print(f"Creating {RAW_DIR}\n")
    for class_key in nigerian_classes():
        directory = class_dir(class_key)
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "SHOT_LIST.txt").write_text(
            SHOT_LIST.format(class_key=class_key, target=target), encoding="utf-8"
        )
        print(f"  {directory}")

    print(
        "\nEach folder has a SHOT_LIST.txt describing what to vary.\n"
        "Photograph the dishes, then ingest them:\n\n"
        "    python ml/collect_nigerian.py add jollof_rice ~/phone-photos/\n"
    )
    print("These photos are the one input you cannot regenerate — back them up.")
    return 0


def prune(target: int) -> int:
    """Delete stored images that are unreadable or duplicated."""
    removed = 0
    for class_key in nigerian_classes():
        result = scan(class_key)
        for path, match in result["duplicates"]:  # type: ignore[union-attr]
            print(f"  removing duplicate {path.name} (same as {match.name})")
            path.unlink()
            removed += 1
        for path in result["broken"]:  # type: ignore[union-attr]
            print(f"  removing unreadable {path.name}")
            path.unlink()
            removed += 1

    print(f"\nRemoved {removed} files.")
    return status(target, deep=False)


def main() -> int:
    # --target is shared, and accepted after the subcommand where it is
    # natural to type it: "status --target 200".
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument(
        "--target",
        type=int,
        default=TARGET_PER_CLASS,
        help=f"Images wanted per class (default {TARGET_PER_CLASS}).",
    )

    parser = argparse.ArgumentParser(description=__doc__, parents=[common])
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser(
        "init",
        parents=[common],
        help="Create the class folders and shot lists.",
    )

    add_parser = sub.add_parser("add", parents=[common], help="Ingest photos into one class.")
    add_parser.add_argument("class_key", help="e.g. jollof_rice")
    add_parser.add_argument("paths", nargs="+", type=Path, help="Files or folders.")
    add_parser.add_argument(
        "--reject-blurry",
        action="store_true",
        help="Discard soft-focus images instead of only flagging them.",
    )

    sub.add_parser("status", parents=[common], help="Counts and what to shoot next.")
    sub.add_parser(
        "check",
        parents=[common],
        help="Status, plus a full re-scan for problems.",
    )
    sub.add_parser(
        "prune",
        parents=[common],
        help="Delete stored duplicates and unreadable files.",
    )

    args = parser.parse_args()

    if args.command == "init":
        return init(args.target)
    if args.command == "add":
        return add(args.class_key, args.paths, args.reject_blurry)
    if args.command == "status":
        return status(args.target, deep=False)
    if args.command == "check":
        return status(args.target, deep=True)
    if args.command == "prune":
        return prune(args.target)
    return 1


if __name__ == "__main__":
    sys.exit(main())

