"""
Translation service using Google Cloud Translation API.
"""
from typing import Optional, Dict, List
from functools import lru_cache
import logging
import httpx

logger = logging.getLogger(__name__)

# Supported languages
SUPPORTED_LANGUAGES = {
    "en": "English",
    "es": "Español", 
    "zh": "中文",
    "fr": "Français",
    "hi": "हिन्दी",
    "ar": "العربية"
}

GOOGLE_TRANSLATE_API_URL = "https://translation.googleapis.com/language/translate/v2"


async def get_api_key() -> Optional[str]:
    """Get Google Translate API key from database"""
    try:
        from app.db.session import AsyncSessionLocal
        from app.models import SystemSecret
        from app.core.encryption import decrypt
        from sqlalchemy import select
        
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(SystemSecret).where(SystemSecret.key_name == "GOOGLE_TRANSLATE_API_KEY")
            )
            secret = result.scalar_one_or_none()
            
            if secret and secret.key_value:
                return decrypt(secret.key_value)
            return None
    except Exception as e:
        logger.error(f"Failed to get Google Translate API key: {e}")
        return None


@lru_cache(maxsize=1000)
async def translate_text(
    text: str,
    source_lang: str = "en",
    target_lang: str = "es"
) -> Optional[str]:
    """
    Translate text using Google Cloud Translation API.
    Results are cached for performance.
    
    Args:
        text: Text to translate
        source_lang: Source language code (default: en)
        target_lang: Target language code (default: es)
        
    Returns:
        Translated text or None if translation fails
    """
    if not text or not text.strip():
        return text
        
    if source_lang == target_lang:
        return text
    
    api_key = await get_api_key()
    if not api_key:
        logger.warning("Google Translate API key not configured")
        return None
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                GOOGLE_TRANSLATE_API_URL,
                params={"key": api_key},
                json={
                    "q": text,
                    "source": source_lang,
                    "target": target_lang,
                    "format": "text"
                }
            )
            response.raise_for_status()
            result = response.json()
            
            if "data" in result and "translations" in result["data"]:
                return result["data"]["translations"][0]["translatedText"]
            return None
    except Exception as e:
        logger.error(f"Translation failed ({source_lang} -> {target_lang}): {e}")
        return None


async def translate_multiple(
    texts: List[str],
    source_lang: str = "en",
    target_lang: str = "es"
) -> List[Optional[str]]:
    """
    Translate multiple texts using Google Cloud Translation.
    
    Args:
        texts: List of texts to translate
        source_lang: Source language code
        target_lang: Target language code
        
    Returns:
        List of translated texts (None for failed translations)
    """
    import asyncio
    tasks = [translate_text(text, source_lang, target_lang) for text in texts]
    return await asyncio.gather(*tasks)


def get_supported_languages() -> Dict[str, str]:
    """Get list of supported language codes and names."""
    return SUPPORTED_LANGUAGES.copy()


async def check_translation_service() -> bool:
    """Check if Google Translate API key is configured."""
    api_key = await get_api_key()
    return api_key is not None
