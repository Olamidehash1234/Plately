"""Validation and on-disk storage for uploaded meal photos."""

import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import settings

# Cap the stored image. The model only ever sees 224x224, so anything larger
# is for the user's own review — 1600px is plenty and keeps the disk small.
MAX_STORED_DIMENSION = 1600


class InvalidImageError(HTTPException):
    def __init__(self, detail: str) -> None:
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=detail
        )


async def read_upload(upload: UploadFile) -> bytes:
    """Read an upload, rejecting anything oversized or of the wrong type.

    The size check streams rather than trusting the Content-Length header, so a
    lying client cannot get a large file through.
    """
    if upload.content_type not in settings.allowed_image_types:
        raise InvalidImageError(
            f"Unsupported image type '{upload.content_type}'. "
            f"Use one of: {', '.join(settings.allowed_image_types)}."
        )

    chunks: list[bytes] = []
    total = 0
    while chunk := await upload.read(64 * 1024):
        total += len(chunk)
        if total > settings.max_upload_bytes:
            limit_mb = settings.max_upload_bytes / (1024 * 1024)
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"Image is larger than the {limit_mb:.0f}MB limit.",
            )
        chunks.append(chunk)

    if total == 0:
        raise InvalidImageError("The uploaded file is empty.")

    return b"".join(chunks)


def load_image(data: bytes) -> Image.Image:
    """Decode bytes into an RGB image with EXIF orientation applied.

    Content-Type is client-supplied and can lie, so the real check is whether
    Pillow can decode the bytes at all.
    """
    from io import BytesIO

    try:
        image = Image.open(BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise InvalidImageError(
            "That file could not be read as an image. It may be corrupt or "
            "not actually an image."
        ) from exc

    # Rotate per the EXIF orientation tag, then drop the metadata entirely —
    # phone photos carry GPS coordinates we have no reason to keep.
    image = ImageOps.exif_transpose(image)
    return image.convert("RGB")


def save_image(image: Image.Image, user_id: int) -> str:
    """Write the image under the media root, returning its relative path."""
    user_dir = settings.media_root / f"user_{user_id}"
    user_dir.mkdir(parents=True, exist_ok=True)

    stored = image.copy()
    stored.thumbnail((MAX_STORED_DIMENSION, MAX_STORED_DIMENSION), Image.LANCZOS)

    filename = f"{uuid.uuid4().hex}.jpg"
    stored.save(user_dir / filename, format="JPEG", quality=88, optimize=True)

    return f"user_{user_id}/{filename}"


def delete_image(relative_path: str) -> None:
    """Remove a stored image, ignoring one that has already gone."""
    target = (settings.media_root / relative_path).resolve()

    # Refuse to follow a path that escapes the media root.
    if not target.is_relative_to(settings.media_root.resolve()):
        return

    Path(target).unlink(missing_ok=True)


def image_url(relative_path: str) -> str:
    return f"/media/{relative_path}"
