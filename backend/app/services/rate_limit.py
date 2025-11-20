from __future__ import annotations

import math
import time
from typing import Final

from fastapi import HTTPException, status
from redis import asyncio as aioredis

from app.core.config import settings

redis_url: Final[str] = settings.redis_rate_limit_url or settings.redis_url
redis_client = aioredis.from_url(redis_url, encoding="utf-8", decode_responses=True)


async def allow(key: str, limit: int, window_seconds: int = 60) -> None:
    if limit <= 0:
        return
    now = int(time.time())
    window = math.floor(now / window_seconds)
    redis_key = f"rl:{key}:{window}"
    current = await redis_client.incr(redis_key)
    if current == 1:
        await redis_client.expire(redis_key, window_seconds)
    if current > limit:
        retry_after = window_seconds - (now % window_seconds)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please slow down.",
            headers={"Retry-After": str(retry_after)},
        )
