"""Fetch the six Food-101 classes this project uses.

The full Food-101 release is 101 categories and about 5GB. Only six of those
categories appear in our class list, so this script streams the archive and
writes just those, leaving roughly 300MB on disk instead of 5GB.

    python ml/fetch_food101.py                       # download and extract
    python ml/fetch_food101.py --archive food-101.tar.gz   # use a local copy
    python ml/fetch_food101.py --check               # report what is present

The result is the layout prepare_data.py expects:

    ml/raw_food101/<class>/*.jpg

so the next step is:

    python ml/prepare_data.py --food101 ml/raw_food101 --nigerian ml/raw_nigerian

Re-running is safe: classes that already have enough images are skipped.
"""

import argparse
import sys
import tarfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import IO, Iterator

from common import FOOD101_CLASSES, ML_DIR

# The dataset's own home, as cited in Chapter 3. No account or API token
# needed, unlike the Kaggle mirror.
ARCHIVE_URL = "http://data.vision.ee.ethz.ch/cvl/food-101.tar.gz"

RAW_DIR = ML_DIR / "raw_food101"

# Food-101 ships 1000 images per class. prepare_data.py caps each class at 250
# by default to keep the international dishes from swamping the Nigerian ones,
# so pulling all 1000 is wasted bandwidth and disk.
DEFAULT_PER_CLASS = 300

WANTED = sorted(FOOD101_CLASSES)


class _ProgressReader:
    """Wraps the HTTP response and reports how much has been read.

    tarfile drives the read; the archive is gzipped, so the only honest
    progress signal is compressed bytes off the socket.
    """

    def __init__(self, stream: IO[bytes], total: int | None):
        self._stream = stream
        self._total = total
        self._read = 0
        self._last_report = 0

    def read(self, size: int = -1) -> bytes:
        chunk = self._stream.read(size)
        self._read += len(chunk)
        if self._read - self._last_report > 50 * 1024 * 1024:
            self._last_report = self._read
            self._report()
        return chunk

    def _report(self) -> None:
        mb = self._read / 1024 / 1024
        if self._total:
            share = self._read / self._total * 100
            print(f"    downloaded {mb:,.0f} MB ({share:.0f}%)", flush=True)
        else:
            print(f"    downloaded {mb:,.0f} MB", flush=True)

    def close(self) -> None:
        self._stream.close()


def counts() -> dict[str, int]:
    """Images currently extracted, per wanted class."""
    return {
        class_key: len(list((RAW_DIR / class_key).glob("*.jpg")))
        if (RAW_DIR / class_key).is_dir()
        else 0
        for class_key in WANTED
    }


def _members(archive: tarfile.TarFile, per_class: int) -> Iterator[tarfile.TarInfo]:
    """Yield the image members we still want, and stop once they are all in.

    Members arrive in class order, so once every wanted class is satisfied
    there is nothing further of interest in the stream and the remaining
    (multi-gigabyte) tail can be abandoned.
    """
    taken = counts()

    for member in archive:
        if not member.isfile():
            continue

        # food-101/images/<class>/<id>.jpg
        parts = Path(member.name).parts
        if len(parts) < 4 or parts[1] != "images":
            continue

        class_key = parts[2]
        if class_key not in taken or taken[class_key] >= per_class:
            continue

        # Already on disk from an earlier run — don't rewrite it, and don't
        # count it twice, or a resumed run would never make progress.
        if (RAW_DIR / class_key / parts[3]).exists():
            continue

        taken[class_key] += 1
        yield member

        if all(count >= per_class for count in taken.values()):
            print("\n  All wanted classes complete; skipping the rest of the archive.")
            return


def extract(stream: IO[bytes], per_class: int) -> None:
    written = 0
    with tarfile.open(fileobj=stream, mode="r|gz") as archive:
        for member in _members(archive, per_class):
            class_key = Path(member.name).parts[2]
            destination = RAW_DIR / class_key
            destination.mkdir(parents=True, exist_ok=True)

            source = archive.extractfile(member)
            if source is None:
                continue
            (destination / Path(member.name).name).write_bytes(source.read())

            written += 1
            if written % 250 == 0:
                print(f"    extracted {written} images", flush=True)

    print(f"\n  Extracted {written} images in total.")


def report(per_class: int) -> None:
    print(f"Food-101 classes in {RAW_DIR}:\n")
    for class_key, count in counts().items():
        state = "ok" if count >= per_class else "incomplete"
        print(f"  {class_key:<16} {count:>4} images   {state}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--archive",
        type=Path,
        help="Use an already-downloaded food-101.tar.gz instead of fetching it.",
    )
    parser.add_argument(
        "--per-class",
        type=int,
        default=DEFAULT_PER_CLASS,
        help=(
            f"Images to keep per class (default {DEFAULT_PER_CLASS}). "
            "prepare_data.py caps the dataset again at its own limit."
        ),
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Only report what has already been extracted.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-download even if every class already has enough images.",
    )
    args = parser.parse_args()

    if args.check:
        report(args.per_class)
        return 0

    have = counts()
    if not args.force and all(count >= args.per_class for count in have.values()):
        print("Every class already has enough images. Nothing to do.\n")
        report(args.per_class)
        return 0

    missing = [key for key, count in have.items() if count < args.per_class]
    print(f"Fetching {len(missing)} of {len(WANTED)} classes: {', '.join(missing)}")
    print(f"Keeping up to {args.per_class} images each.\n")

    if args.archive:
        if not args.archive.is_file():
            print(f"No such archive: {args.archive}", file=sys.stderr)
            return 1
        print(f"  Reading {args.archive}")
        with args.archive.open("rb") as stream:
            extract(stream, args.per_class)
    else:
        print(f"  Streaming {ARCHIVE_URL}")
        print("  This is a ~5GB download; only the wanted classes are written.")
        try:
            with urllib.request.urlopen(ARCHIVE_URL, timeout=60) as response:
                length = response.headers.get("Content-Length")
                reader = _ProgressReader(response, int(length) if length else None)
                extract(reader, args.per_class)
        except urllib.error.URLError as error:
            print(f"\nDownload failed: {error}", file=sys.stderr)
            print(
                "\nIf the host is unreachable, download food-101.tar.gz by hand "
                "and pass it with --archive.",
                file=sys.stderr,
            )
            return 1

    print()
    report(args.per_class)

    if any(count < args.per_class for count in counts().values()):
        print("\nSome classes are still short. Re-run to resume.")
        return 1

    print("\nNext: python ml/prepare_data.py --food101 ml/raw_food101 \\")
    print("          --nigerian ml/raw_nigerian")
    return 0


if __name__ == "__main__":
    sys.exit(main())
