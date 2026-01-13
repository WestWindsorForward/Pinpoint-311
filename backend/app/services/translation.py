"""
Translation service using LibreTranslate for auto-suggesting translations.
"""
import httpx
from typing import Dict, List, Optional
from functools import lru_cache
import logging

logger = logging.getLogger(__name__)

LIBRETRANSLATE_URL = "http://libretranslate:5000"

# Supported languages
SUPPORTED_LANGUAGES = {
    "en": "English",
    "es": "Español",
    "zh": "中文",
    "fr": "Français",
    "hi": "हिन्दी",
    "ar": "العربية"
}


@lru_cache(maxsize=1000)
async def translate_text(
    text: str,
    source_lang: str = "en",
    target_lang: str = "es"
) -> Optional[str]:
    """
    Translate text using LibreTranslate API.
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
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{LIBRETRANSLATE_URL}/translate",
                json={
                    "q": text,
                    "source": source_lang,
                    "target": target_lang,
                    "format": "text"
                }
            )
            response.raise_for_status()
            result = response.json()
            return result.get("translatedText", text)
    except Exception as e:
        logger.error(f"Translation failed ({source_lang} -> {target_lang}): {e}")
        return None


async def translate_multiple(
    texts: List[str],
    source_lang: str = "en",
    target_lang: str = "es"
) -> List[Optional[str]]:
    """
    Translate multiple texts in parallel.
    
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


async def auto_translate_object(
    data: Dict[str, str],
    source_lang: str = "en",
    target_languages: List[str] = None
) -> Dict[str, Dict[str, str]]:
    """
    Auto-translate a dictionary of strings to multiple languages.
    Useful for translating service category names, descriptions, etc.
    
    Args:
        data: Dictionary with string keys and values (e.g., {"name": "Pothole", "description": "..."})
        source_lang: Source language code
        target_languages: List of target language codes (default: all supported except source)
        
    Returns:
        Dictionary with translations: 
        {
            "en": {"name": "Pothole", "description": "..."},
            "es": {"name": "Bache", "description": "..."},
            ...
        }
    """
    if target_languages is None:
        target_languages = [lang for lang in SUPPORTED_LANGUAGES.keys() if lang != source_lang]
    
    # Start with source language
    result = {source_lang: data}
    
    # Translate to each target language
    for target_lang in target_languages:
        translations = {}
        for key, value in data.items():
            if isinstance(value, str):
                translated = await translate_text(value, source_lang, target_lang)
                translations[key] = translated if translated else value
            else:
                translations[key] = value
        result[target_lang] = translations
    
    return result


def get_supported_languages() -> Dict[str, str]:
    """Get list of supported language codes and names."""
    return SUPPORTED_LANGUAGES.copy()


async def check_translation_service() -> bool:
    """Check if LibreTranslate service is available."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{LIBRETRANSLATE_URL}/languages")
            return response.status_code == 200
    except Exception as e:
        logger.warning(f"LibreTranslate service check failed: {e}")
        return False


def get_translation(
    translations: Optional[Dict],
    field: str,
    language: str = "en",
    fallback: str = ""
) -> str:
    """
    Helper to extract translated field from translations dict.
    
    Args:
        translations: Translations dictionary
        field: Field name (e.g., "name", "description")
        language: Desired language code
        fallback: Fallback value if translation not found
        
    Returns:
        Translated text or fallback
    """
    if not translations:
        return fallback
    
    # Try requested language
    if language in translations and field in translations[language]:
        return translations[language][field]
    
    # Fallback to English
    if "en" in translations and field in translations["en"]:
        return translations["en"][field]
    
    return fallback
