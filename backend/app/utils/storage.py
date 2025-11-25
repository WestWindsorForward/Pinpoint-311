from __future__ import annotations

import os
from pathlib import Path
from typing import BinaryIO

from fastapi import Request

from app.core.config import settings


def save_file(filename: str, data: bytes) -> str:
    storage_dir = Path(settings.storage_dir)
    storage_dir.mkdir(parents=True, exist_ok=True)
    path = storage_dir / filename
    path.write_bytes(data)
    return str(path)


def save_upload(upload: BinaryIO, filename: str) -> str:
    storage_dir = Path(settings.storage_dir)
    storage_dir.mkdir(parents=True, exist_ok=True)
    path = storage_dir / filename
    with open(path, "wb") as dest:
        dest.write(upload.read())
    return str(path)


def delete_file(path: str) -> None:
    if os.path.exists(path):
        os.remove(path)


def public_storage_url(request: Request, file_path: str) -> str:
    absolute = Path(file_path).resolve()
    storage_root = Path(settings.storage_dir).resolve()
    try:
        relative = absolute.relative_to(storage_root)
    except ValueError:
        relative = Path(file_path).name
    return str(request.url_for("storage", path=relative.as_posix()))
