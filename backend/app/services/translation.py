"""
Translation service using Google Cloud Translation API.
Uses in-memory cache to minimize API calls.
"""
from typing import Optional, Dict, List
import logging
import httpx

logger = logging.getLogger(__name__)

# In-memory translation cache: {("text", "target_lang"): "translated_text"}
_translation_cache: Dict[tuple, str] = {}

GOOGLE_TRANSLATE_API_URL = "https://translation.googleapis.com/language/translate/v2"


async def get_api_key() -> Optional[str]:
    """Get Google Maps API key (also used for Translation API)"""
    try:
        from app.db.session import SessionLocal
        from app.models import SystemSecret
        from app.core.encryption import decrypt_safe
        from sqlalchemy import select
        
        async with SessionLocal() as db:
            result = await db.execute(
                select(SystemSecret).where(SystemSecret.key_name == "GOOGLE_MAPS_API_KEY")
            )
            secret = result.scalar_one_or_none()
            
            if secret and secret.key_value:
                decrypted = decrypt_safe(secret.key_value)
                return decrypted if decrypted else None
            return None
    except Exception as e:
        logger.error(f"Failed to get Google API key: {e}")
        return None


async def translate_text(
    text: str,
    source_lang: str = "en",
    target_lang: str = "es"
) -> Optional[str]:
    """
    Translate text using Google Cloud Translation API.
    Uses in-memory cache to minimize API usage.
    """
    if not text or not text.strip():
        return text
        
    if source_lang == target_lang:
        return text
    
    # Check cache first
    cache_key = (text, target_lang)
    if cache_key in _translation_cache:
        return _translation_cache[cache_key]
    
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
                translated = result["data"]["translations"][0]["translatedText"]
                # Cache the result
                _translation_cache[cache_key] = translated
                logger.info(f"Translated and cached: '{text[:30]}...' -> '{translated[:30]}...'")
                return translated
            return None
    except Exception as e:
        logger.error(f"Translation failed ({source_lang} -> {target_lang}): {e}")
        return None


async def translate_service_response(service_dict: dict, target_lang: str) -> dict:
    """
    Translate service response dict without modifying database.
    Returns a new dict with translated fields.
    """
    if target_lang == 'en':
        return service_dict
    
    result = dict(service_dict)
    
    # Translate service name
    if result.get('service_name'):
        translated = await translate_text(result['service_name'], 'en', target_lang)
        if translated:
            result['service_name'] = translated
    
    # Translate description
    if result.get('description'):
        translated = await translate_text(result['description'], 'en', target_lang)
        if translated:
            result['description'] = translated
    
    return result


def get_supported_languages() -> Dict[str, str]:
    """Get list of supported language codes and names."""
    return {
        "en": "English",
        "es": "Español", 
        "zh": "中文",
        "fr": "Français",
        "hi": "हिन्दी",
        "ar": "العربية"
    }


async def check_translation_service() -> bool:
    """Check if Google Translate API key is configured."""
    api_key = await get_api_key()
    return api_key is not None
