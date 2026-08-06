"""Harvest openly-licensed photographs of the Nigerian dishes.

Searches Openverse (which aggregates Creative Commons images from Flickr,
Wikimedia and others) and Wikimedia Commons directly, downloads what it finds
into a staging folder, and records the licence and author of every file so the
dataset can be credited properly.

    python ml/fetch_web_images.py                       # all six dishes
    python ml/fetch_web_images.py --class jollof_rice   # just one
    python ml/fetch_web_images.py --per-class 80

Nothing goes into the training set automatically. Downloads land in
`ml/web_harvest/<class>/`, you delete whatever is wrong — search engines return
plenty of irrelevant pictures — and then ingest the survivors:

    python ml/collect_nigerian.py add jollof_rice ml/web_harvest/jollof_rice

Attribution for everything downloaded is written to
`ml/web_harvest/CREDITS.csv`, one row per image: source, title, creator,
licence, and the page it came from. Cite it in the report; several of these
licences require attribution, and CC BY-SA requires you to say so.

A caution worth taking seriously: web photographs are mostly studio and stock
shots, while your users will submit phone snaps of a plate on a table. A model
trained only on the former does noticeably worse on the latter. Use these to
pad out the classes, not to replace photographs of your own.
"""

import argparse
import csv
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

from common import ML_DIR, nigerian_classes

HARVEST_DIR = ML_DIR / "web_harvest"
CREDITS_PATH = HARVEST_DIR / "CREDITS.csv"

# Identifies the project to both APIs, as their terms ask.
USER_AGENT = (
    "PlatelyDataset/1.0 (final year project; "
    "https://github.com/Olamidehash1234/Plately)"
)

# Be a good citizen: both APIs are free and unauthenticated.
PAUSE_SECONDS = 1.5

MIN_EDGE = 224  # the training size; smaller images are upscaled guesswork

# Several phrasings per dish, because one search term finds one slice of what
# is out there — and Nigerian dishes are spelled inconsistently online.
QUERIES = {
    "jollof_rice": ["jollof rice", "nigerian jollof", "party jollof rice"],
    "egusi_soup": ["egusi soup", "egusi", "melon seed soup nigeria"],
    "pounded_yam": ["pounded yam", "iyan pounded yam", "pounded yam and soup"],
    "amala": ["amala ewedu", "amala nigerian food", "amala yam flour"],
    "eba": ["eba garri", "eba nigerian food", "garri eba soup"],
    "moi_moi": ["moi moi", "moin moin beans", "bean pudding nigeria"],
}


def fetch_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def search_openverse(query: str, limit: int) -> list[dict]:
    """CC-licensed images from Openverse, newest API shape."""
    url = "https://api.openverse.org/v1/images/?" + urllib.parse.urlencode(
        {"q": query, "page_size": min(limit, 100), "license_type": "all-cc"}
    )
    try:
        payload = fetch_json(url)
    except (urllib.error.URLError, TimeoutError) as error:
        print(f"    openverse failed for '{query}': {error}")
        return []

    found = []
    for item in payload.get("results", []):
        if not item.get("url"):
            continue
        found.append(
            {
                "url": item["url"],
                "source": "Openverse",
                "title": item.get("title") or "",
                "creator": item.get("creator") or "unknown",
                "license": f"{item.get('license', '')} {item.get('license_version', '')}".strip().upper(),
                "license_url": item.get("license_url") or "",
                "page": item.get("foreign_landing_url") or "",
            }
        )
    return found


def search_commons(query: str, limit: int) -> list[dict]:
    """Images from Wikimedia Commons, with licence metadata attached."""
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(
        {
            "action": "query",
            "format": "json",
            "generator": "search",
            "gsrsearch": f"{query} filetype:bitmap",
            "gsrnamespace": "6",
            "gsrlimit": str(min(limit, 50)),
            "prop": "imageinfo",
            "iiprop": "url|extmetadata",
            "iiurlwidth": "1024",
        }
    )
    try:
        payload = fetch_json(url)
    except (urllib.error.URLError, TimeoutError) as error:
        print(f"    commons failed for '{query}': {error}")
        return []

    pages = payload.get("query", {}).get("pages", {})
    found = []
    for page in pages.values():
        info = (page.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata", {})

        def field(name: str) -> str:
            return str(meta.get(name, {}).get("value", "")).strip()

        image_url = info.get("thumburl") or info.get("url")
        if not image_url:
            continue

        found.append(
            {
                "url": image_url,
                "source": "Wikimedia Commons",
                "title": page.get("title", ""),
                # Artist arrives as HTML; keep it readable rather than exact.
                "creator": _strip_tags(field("Artist")) or "unknown",
                "license": field("LicenseShortName") or "see page",
                "license_url": field("LicenseUrl"),
                "page": info.get("descriptionurl", ""),
            }
        )
    return found


def _strip_tags(html: str) -> str:
    out, depth = [], 0
    for char in html:
        if char == "<":
            depth += 1
        elif char == ">":
            depth = max(0, depth - 1)
        elif depth == 0:
            out.append(char)
    return " ".join("".join(out).split())


def download(candidate: dict, destination: Path) -> Path | None:
    """Fetch one image, keeping it only if it is a usable photograph."""
    try:
        request = urllib.request.Request(
            candidate["url"], headers={"User-Agent": USER_AGENT}
        )
        with urllib.request.urlopen(request, timeout=45) as response:
            data = response.read()
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        print(f"    download failed: {error}")
        return None

    temporary = destination.with_suffix(".part")
    temporary.write_bytes(data)

    try:
        with Image.open(temporary) as image:
            image.verify()
        with Image.open(temporary) as image:
            width, height = image.size
    except (OSError, ValueError):
        temporary.unlink(missing_ok=True)
        print("    skipped: not a readable image")
        return None

    if min(width, height) < MIN_EDGE:
        temporary.unlink(missing_ok=True)
        print(f"    skipped: {width}x{height} is under {MIN_EDGE}px")
        return None

    temporary.rename(destination)
    return destination


def harvest(class_key: str, per_class: int, credits: list[dict]) -> int:
    destination_dir = HARVEST_DIR / class_key
    destination_dir.mkdir(parents=True, exist_ok=True)

    seen_urls: set[str] = set()
    candidates: list[dict] = []

    for query in QUERIES[class_key]:
        for search in (search_openverse, search_commons):
            time.sleep(PAUSE_SECONDS)
            for item in search(query, per_class):
                if item["url"] in seen_urls:
                    continue
                seen_urls.add(item["url"])
                candidates.append(item)

    print(f"  {len(candidates)} candidates found")

    kept = 0
    for index, candidate in enumerate(candidates):
        if kept >= per_class:
            break
        suffix = Path(urllib.parse.urlparse(candidate["url"]).path).suffix.lower()
        if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
            suffix = ".jpg"

        target = HARVEST_DIR / class_key / f"{class_key}_web_{index:04d}{suffix}"
        if target.exists():
            kept += 1
            continue

        time.sleep(PAUSE_SECONDS)
        if download(candidate, target) is None:
            continue

        kept += 1
        credits.append(
            {
                "class": class_key,
                "file": target.name,
                "source": candidate["source"],
                "title": candidate["title"],
                "creator": candidate["creator"],
                "license": candidate["license"],
                "license_url": candidate["license_url"],
                "page": candidate["page"],
            }
        )

    print(f"  kept {kept} images in {destination_dir}")
    return kept


def write_credits(rows: list[dict]) -> None:
    """Append to the credits file, keeping one row per downloaded file."""
    existing: list[dict] = []
    if CREDITS_PATH.exists():
        with CREDITS_PATH.open(encoding="utf-8", newline="") as handle:
            existing = list(csv.DictReader(handle))

    have = {(row["class"], row["file"]) for row in existing}
    merged = existing + [r for r in rows if (r["class"], r["file"]) not in have]

    fields = ["class", "file", "source", "title", "creator", "license", "license_url", "page"]
    CREDITS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CREDITS_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(merged)

    print(f"\nAttribution for {len(merged)} images: {CREDITS_PATH}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--class",
        dest="class_key",
        choices=nigerian_classes(),
        help="Only harvest one dish (default: all six).",
    )
    parser.add_argument(
        "--per-class",
        type=int,
        default=60,
        help="Images to keep per dish (default 60).",
    )
    args = parser.parse_args()

    classes = [args.class_key] if args.class_key else nigerian_classes()
    credits: list[dict] = []
    totals: dict[str, int] = {}

    for class_key in classes:
        print(f"\n{class_key}")
        totals[class_key] = harvest(class_key, args.per_class, credits)

    write_credits(credits)

    print("\nDownloaded:")
    for class_key, count in totals.items():
        print(f"  {class_key:<14} {count:>4}")

    print(
        "\nThese are unreviewed search results. Open each folder, delete what is "
        "not the dish, then ingest the rest:\n"
    )
    for class_key in classes:
        print(f"  python ml/collect_nigerian.py add {class_key} ml/web_harvest/{class_key}")

    print(
        "\nCite ml/web_harvest/CREDITS.csv in the report. Some licences require "
        "attribution by name, and CC BY-SA requires you to state the licence."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
