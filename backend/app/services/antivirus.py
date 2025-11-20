from __future__ import annotations

import asyncio
import logging
from typing import BinaryIO

import clamd
from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger(__name__)


def _get_client() -> clamd.ClamdNetworkSocket:
    return clamd.ClamdNetworkSocket(host=settings.clamav_host, port=settings.clamav_port)


async def scan_bytes(data: bytes) -> None:
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(None, lambda: _get_client().scan_stream(data))
    if not result:
        logger.warning("ClamAV returned empty response; treating as clean")
        return
    status = list(result.values())[0][0]
    if status != "OK":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Malicious content detected")


async def scan_file(upload: BinaryIO) -> None:
    data = upload.read()
    await scan_bytes(data)
    upload.seek(0)
