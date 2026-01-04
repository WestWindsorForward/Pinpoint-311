"""
Vertex AI Service for 311 Request Analysis using Gemini 2.0 Flash

This service analyzes service requests using Google's Gemini model to provide:
- Priority scoring (1-10)
- Qualitative analysis
- Quantitative metrics
- Safety flags
"""

import json
import base64
import re
from datetime import datetime
from typing import Optional, Dict, Any, List
from dataclasses import dataclass


@dataclass
class AnalysisResult:
    """Structured result from AI analysis"""
    priority_score: float
    priority_justification: str
    qualitative_analysis: str
    quantitative_metrics: Dict[str, Any]
    safety_flags: List[str]
    recommended_response_time: str
    analyzed_at: datetime


def strip_pii(text: str) -> str:
    """
    Remove personally identifiable information from text.
    Strips: email addresses, phone numbers, names patterns, etc.
    """
    if not text:
        return text
    
    # Remove email addresses
    text = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[EMAIL]', text)
    
    # Remove phone numbers (various formats)
    text = re.sub(r'\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b', '[PHONE]', text)
    text = re.sub(r'\(\d{3}\)\s*\d{3}[-.\s]?\d{4}', '[PHONE]', text)
    text = re.sub(r'\+1\s*\d{10}', '[PHONE]', text)
    
    # Remove potential SSN patterns
    text = re.sub(r'\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b', '[REDACTED]', text)
    
    # Remove "my name is X" patterns
    text = re.sub(r'(?i)(my name is|i am|this is)\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)?', r'\1 [NAME]', text)
    
    # Remove "call me at" patterns
    text = re.sub(r'(?i)(call|contact|reach)\s+(me|us)\s+(at|on)\s+[\d\-().+\s]+', r'\1 \2 at [PHONE]', text)
    
    return text


def build_analysis_prompt(
    request_data: Dict[str, Any],
    historical_context: Optional[Dict[str, Any]] = None,
    spatial_context: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Build a comprehensive prompt for Gemini analysis.
    All PII should already be stripped from request_data.
    """
    
    prompt = """You are an AI assistant for a municipal 311 service. Analyze the following service request and provide a structured assessment.

## Service Request Information
- **Request Type**: {service_type}
- **Description**: {description}
- **Address**: {address}
- **Submitted**: {submitted_date}
""".format(
        service_type=request_data.get('service_name', 'Unknown'),
        description=strip_pii(request_data.get('description', 'No description')),
        address=request_data.get('address', 'No address provided'),
        submitted_date=request_data.get('submitted_date', 'Unknown')
    )
    
    # Add matched asset context if available
    if request_data.get('matched_asset'):
        asset = request_data['matched_asset']
        prompt += f"""
## Matched Infrastructure Asset
- **Asset Type**: {asset.get('asset_type', 'Unknown')}
- **Layer**: {asset.get('layer_name', 'Unknown')}
- **Distance**: {asset.get('distance_meters', 'N/A')}m from reported location
"""

    # Add historical context
    if historical_context:
        prompt += f"""
## Historical Context
- **Previous reports at this location**: {historical_context.get('recurrence_count', 0)}
- **Similar active reports nearby**: {historical_context.get('nearby_similar', 0)}
- **Past resolution success rate at location**: {historical_context.get('resolution_rate', 'N/A')}%
"""

    # Add spatial context
    if spatial_context:
        prompt += f"""
## Spatial & Environmental Context
- **Area type**: {spatial_context.get('area_type', 'Unknown')}
- **Nearby critical infrastructure**: {', '.join(spatial_context.get('nearby_infrastructure', [])) or 'None identified'}
- **Traffic level**: {spatial_context.get('traffic_level', 'Unknown')}
- **Vulnerable population indicators**: {spatial_context.get('vulnerable_pop', 'None')}
"""

    prompt += """
## Analysis Required

Provide your analysis in the following JSON format ONLY (no other text):

```json
{
  "priority_score": <float 1.0-10.0>,
  "priority_justification": "<brief explanation for the score>",
  "qualitative_analysis": "<2-3 sentence assessment of the issue, its likely cause, and impact>",
  "quantitative_metrics": {
    "estimated_severity": "<low|medium|high|critical>",
    "estimated_affected_area": "<localized|block|neighborhood|widespread>",
    "is_likely_duplicate": <true|false>,
    "recurrence_risk": "<low|medium|high>"
  },
  "safety_flags": ["<flag1>", "<flag2>"],
  "recommended_response_time": "<immediate|24h|48h|1week|scheduled>"
}
```

Safety flags should only include relevant items from: ["pedestrian_hazard", "vehicle_hazard", "school_zone", "hospital_nearby", "high_traffic", "low_visibility", "flooding_risk", "utility_damage", "structural_concern", "environmental_hazard"]

Respond with ONLY the JSON, no additional text.
"""

    return prompt


async def analyze_with_gemini(
    project_id: str,
    location: str,
    prompt: str,
    image_data: Optional[List[str]] = None,
    service_account_json: Optional[str] = None
) -> Dict[str, Any]:
    """
    Call Gemini 2.0 Flash via Vertex AI API.
    
    Args:
        project_id: Google Cloud project ID
        location: Vertex AI location (e.g., us-central1)
        prompt: The analysis prompt
        image_data: Optional list of base64-encoded images
        service_account_json: Optional service account JSON key
    
    Returns:
        Parsed JSON response from Gemini
    """
    try:
        import google.auth
        from google.auth.transport.requests import Request
        from google.oauth2 import service_account
        import aiohttp
        
        # Set up authentication
        if service_account_json:
            # Use provided service account
            sa_info = json.loads(service_account_json)
            credentials = service_account.Credentials.from_service_account_info(
                sa_info,
                scopes=['https://www.googleapis.com/auth/cloud-platform']
            )
        else:
            # Use default credentials (from environment)
            credentials, _ = google.auth.default(
                scopes=['https://www.googleapis.com/auth/cloud-platform']
            )
        
        # Refresh the credentials
        credentials.refresh(Request())
        
        # Build the API endpoint
        endpoint = f"https://{location}-aiplatform.googleapis.com/v1/projects/{project_id}/locations/{location}/publishers/google/models/gemini-2.0-flash:generateContent"
        
        # Build the request payload
        contents = []
        parts = []
        
        # Add images if provided (for multimodal analysis)
        if image_data:
            for i, img_b64 in enumerate(image_data[:3]):  # Max 3 images
                # Handle data URLs
                if img_b64.startswith('data:'):
                    # Extract base64 part from data URL
                    match = re.match(r'data:image/(\w+);base64,(.+)', img_b64)
                    if match:
                        mime_type = f"image/{match.group(1)}"
                        b64_data = match.group(2)
                    else:
                        continue
                else:
                    mime_type = "image/jpeg"
                    b64_data = img_b64
                
                parts.append({
                    "inline_data": {
                        "mime_type": mime_type,
                        "data": b64_data
                    }
                })
        
        # Add text prompt
        parts.append({"text": prompt})
        
        contents.append({"role": "user", "parts": parts})
        
        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": 0.2,  # Low temperature for consistent analysis
                "topP": 0.8,
                "maxOutputTokens": 1024,
            },
            "safetySettings": [
                {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
            ]
        }
        
        # Make the API call
        async with aiohttp.ClientSession() as session:
            async with session.post(
                endpoint,
                headers={
                    "Authorization": f"Bearer {credentials.token}",
                    "Content-Type": "application/json"
                },
                json=payload
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"Vertex AI API error ({response.status}): {error_text}")
                
                result = await response.json()
        
        # Extract the text response
        if 'candidates' in result and result['candidates']:
            text_response = result['candidates'][0].get('content', {}).get('parts', [{}])[0].get('text', '')
            
            # Parse JSON from response (handle markdown code blocks)
            json_match = re.search(r'```json\s*(.*?)\s*```', text_response, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                json_str = text_response.strip()
            
            return json.loads(json_str)
        else:
            raise Exception("No response candidates from Vertex AI")
            
    except json.JSONDecodeError as e:
        # Return a default analysis if JSON parsing fails
        return {
            "priority_score": 5.0,
            "priority_justification": "Unable to parse AI response",
            "qualitative_analysis": "AI analysis could not be completed. Manual review recommended.",
            "quantitative_metrics": {
                "estimated_severity": "medium",
                "estimated_affected_area": "localized",
                "is_likely_duplicate": False,
                "recurrence_risk": "unknown"
            },
            "safety_flags": [],
            "recommended_response_time": "48h",
            "_error": str(e)
        }
    except Exception as e:
        # Return error information for debugging
        return {
            "priority_score": 5.0,
            "priority_justification": f"AI analysis failed: {str(e)[:100]}",
            "qualitative_analysis": "AI analysis could not be completed due to a service error. Manual review recommended.",
            "quantitative_metrics": {
                "estimated_severity": "unknown",
                "estimated_affected_area": "unknown",
                "is_likely_duplicate": False,
                "recurrence_risk": "unknown"
            },
            "safety_flags": [],
            "recommended_response_time": "48h",
            "_error": str(e)
        }


async def get_historical_context(db, address: str, service_code: str) -> Dict[str, Any]:
    """
    Query historical data for context.
    Returns recurrence count, nearby similar reports, resolution rate.
    """
    from sqlalchemy import select, func, text
    from app.models import ServiceRequest
    
    context = {
        "recurrence_count": 0,
        "nearby_similar": 0,
        "resolution_rate": None
    }
    
    if not address:
        return context
    
    try:
        # Count previous reports at same address
        result = await db.execute(
            select(func.count(ServiceRequest.id)).where(
                ServiceRequest.address == address,
                ServiceRequest.deleted_at.is_(None)
            )
        )
        context["recurrence_count"] = result.scalar() or 0
        
        # Count similar active reports
        result = await db.execute(
            select(func.count(ServiceRequest.id)).where(
                ServiceRequest.service_code == service_code,
                ServiceRequest.status.in_(["open", "in_progress"]),
                ServiceRequest.deleted_at.is_(None)
            )
        )
        context["nearby_similar"] = result.scalar() or 0
        
    except Exception as e:
        print(f"Error getting historical context: {e}")
    
    return context
