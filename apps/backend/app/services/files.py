from __future__ import annotations

import secrets
from pathlib import Path

from fastapi import UploadFile

from app.core.config import get_settings

settings = get_settings()


async def save_upload_file(upload: UploadFile, subdirectory: str) -> str:
    uploads_dir = Path(settings.uploads_dir)
    target_dir = uploads_dir / subdirectory
    target_dir.mkdir(parents=True, exist_ok=True)

    extension = _guess_extension(upload.filename)
    filename = f"{secrets.token_hex(8)}{extension}"
    destination = target_dir / filename

    with destination.open("wb") as buffer:
        while chunk := await upload.read(1024 * 1024):
            buffer.write(chunk)

    return str(destination.relative_to(uploads_dir))


def _guess_extension(filename: str | None) -> str:
    if not filename or "." not in filename:
        return ""
    return "." + filename.split(".")[-1].lower()
