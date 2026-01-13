"""
Automatic translation middleware for FastAPI.
Automatically translates API responses based on Accept-Language header.
Uses LibreTranslate for translation with Redis caching.
"""
import json
from typing import Any, Dict
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response, StreamingResponse
import logging

logger = logging.getLogger(__name__)

# Fields to translate in API responses
TRANSLATABLE_FIELDS = {
    'service_name', 'description', 'name', 'township_name', 
    'hero_text', 'completion_message', 'status_notes'
}

class AutoTranslationMiddleware(BaseHTTPMiddleware):
    """
    Middleware that automatically translates API response fields
    based on the Accept-Language header.
    """
    
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Only process JSON responses for API endpoints
        if not request.url.path.startswith('/api/'):
            return response
            
        # Get preferred language from header
        accept_language = request.headers.get('Accept-Language', 'en')
        target_lang = accept_language.split(',')[0].split('-')[0].strip()
        
        # Skip if English or unsupported content type
        if target_lang == 'en' or not hasattr(response, 'body'):
            return response
            
        # Skip streaming responses
        if isinstance(response, StreamingResponse):
            return response
        
        try:
            # Read response body
            body = b''
            async for chunk in response.body_iterator:
                body += chunk
            
            # Parse JSON
            data = json.loads(body.decode())
            
            # Translate the data
            translated_data = await self._translate_data(data, target_lang)
            
            # Create new response with translated data
            new_body = json.dumps(translated_data).encode()
            
            return Response(
                content=new_body,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.media_type
            )
        except Exception as e:
            logger.warning(f"Translation failed: {e}")
            # Return original response on error
            return response
    
    async def _translate_data(self, data: Any, target_lang: str) -> Any:
        """Recursively translate data structures"""
        if isinstance(data, dict):
            return {
                key: await self._translate_field(key, value, target_lang)
                for key, value in data.items()
            }
        elif isinstance(data, list):
            return [await self._translate_data(item, target_lang) for item in data]
        else:
            return data
    
    async def _translate_field(self, key: str, value: Any, target_lang: str) -> Any:
        """Translate a field if it's in the translatable list"""
        if key in TRANSLATABLE_FIELDS and isinstance(value, str) and value:
            from app.services.translation import translate_text
            translated = await translate_text(value, 'en', target_lang)
            return translated if translated else value
        elif isinstance(value, (dict, list)):
            return await self._translate_data(value, target_lang)
        else:
            return value
