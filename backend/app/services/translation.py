"""
Translation service using Google Cloud Translation API.
"""
from typing import Optional, Dict, List
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
    """Get Google Maps API key (also used for Translation API)"""
    try:
        from app.db.session import SessionLocal
        from app.models import SystemSecret
        from app.core.encryption import decrypt
        from sqlalchemy import select
        
        async with SessionLocal() as db:
            result = await db.execute(
                select(SystemSecret).where(SystemSecret.key_name == "GOOGLE_MAPS_API_KEY")
            )
            secret = result.scalar_one_or_none()
            
            if secret:
                logger.info(f"Found secret, is_configured={secret.is_configured}, key_value len={len(secret.key_value) if secret.key_value else 0}")
                if secret.key_value:
                    decrypted = decrypt(secret.key_value)
                    logger.info(f"Decrypted key length: {len(decrypted) if decrypted else 0}")
                    return decrypted
            else:
                logger.warning("GOOGLE_MAPS_API_KEY not found in database")
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


async def ensure_translations(obj, db, target_lang: str):
    """
    Ensure translations exist in database for the given object.
    Auto-populates missing translations on-the-fly.
    
    Args:
        obj: Database object (ServiceDefinition, Department, etc.)
        db: Database session
        target_lang: Target language code
    """
    logger.info(f"ensure_translations called for {getattr(obj, 'service_name', 'unknown')} to language {target_lang}")
    
    if not hasattr(obj, 'translations') or not hasattr(obj, 'service_name'):
        logger.warning(f"Object missing translations or service_name attribute")
        return
    
    # Initialize translations if None
    if obj.translations is None:
        obj.translations = {}
        logger.info(f"Initialized empty translations dict")
    
    # Check if translation already exists
    if target_lang in obj.translations and obj.translations[target_lang]:
        # Return translated fields
        logger.info(f"Using existing translation from database")
        obj.service_name = obj.translations[target_lang].get('service_name', obj.service_name)
        if hasattr(obj, 'description'):
            obj.description = obj.translations[target_lang].get('description', obj.description)
        return
    
    # Translation missing - generate it
    logger.info(f"Translation missing, calling Google Translate API...")
    translated_name = await translate_text(obj.service_name, 'en', target_lang)
    logger.info(f"Translated name: {translated_name}")
    
    translated_desc = None
    if hasattr(obj, 'description') and obj.description:
        translated_desc = await translate_text(obj.description, 'en', target_lang)
        logger.info(f"Translated description: {translated_desc}")
    
    # Store in database
    if translated_name:
        obj.translations[target_lang] = {
            'service_name': translated_name,
            'description': translated_desc or obj.description
        }
        # Mark as modified for SQLAlchemy
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(obj, 'translations')
        await db.commit()
        logger.info(f"Saved translations to database")
        
        # Update current object fields
        obj.service_name = translated_name
        if translated_desc:
            obj.description = translated_desc
    else:
        logger.error(f"Translation failed - translated_name is None")
