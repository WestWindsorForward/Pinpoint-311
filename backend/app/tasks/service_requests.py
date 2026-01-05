from app.core.celery_app import celery_app
from app.db.session import SessionLocal
from app.models import ServiceRequest, SystemSecret
from app.services.notifications import notification_service
from app.services.geocoding import get_geocoding_service
from sqlalchemy import select
import asyncio


def run_async(coro):
    """Helper to run async functions in sync context"""
    from app.db.session import engine
    
    async def _runner():
        try:
            return await coro
        finally:
            # Important: dispose the engine pool when the loop is about to close
            # to avoid loop-contaminated state in subsequent tasks
            await engine.dispose()
            
    return asyncio.run(_runner())


async def get_secret(db, key_name: str) -> str:
    """Get a secret value from database"""
    result = await db.execute(
        select(SystemSecret).where(SystemSecret.key_name == key_name)
    )
    secret = result.scalar_one_or_none()
    return secret.key_value if secret and secret.is_configured else ""


async def configure_notifications(db):
    """Configure notification service from database secrets"""
    # Configure SMS provider
    sms_provider = await get_secret(db, "SMS_PROVIDER")
    
    if sms_provider == "twilio":
        notification_service.configure_sms("twilio", {
            "account_sid": await get_secret(db, "TWILIO_ACCOUNT_SID"),
            "auth_token": await get_secret(db, "TWILIO_AUTH_TOKEN"),
            "from_number": await get_secret(db, "TWILIO_PHONE_NUMBER")
        })
    elif sms_provider == "http":
        notification_service.configure_sms("http", {
            "api_url": await get_secret(db, "SMS_HTTP_API_URL"),
            "api_key": await get_secret(db, "SMS_HTTP_API_KEY"),
            "from_number": await get_secret(db, "SMS_FROM_NUMBER")
        })
    
    # Configure Email provider
    email_enabled = await get_secret(db, "EMAIL_ENABLED")
    if email_enabled.lower() == "true":
        smtp_port_str = await get_secret(db, "SMTP_PORT")
        use_tls_str = await get_secret(db, "SMTP_USE_TLS")
        
        notification_service.configure_email({
            "smtp_host": await get_secret(db, "SMTP_HOST"),
            "smtp_port": int(smtp_port_str) if smtp_port_str else 587,
            "smtp_user": await get_secret(db, "SMTP_USER"),
            "smtp_password": await get_secret(db, "SMTP_PASSWORD"),
            "from_email": await get_secret(db, "SMTP_FROM_EMAIL"),
            "from_name": await get_secret(db, "SMTP_FROM_NAME") or "Township 311",
            "use_tls": use_tls_str.lower() != "false" if use_tls_str else True
        })


@celery_app.task(bind=True, max_retries=3)
def analyze_request(self, request_id: int):
    """Analyze service request with Vertex AI (if enabled)"""
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[AI Analysis] Starting analysis for request {request_id}")
    print(f"[AI Analysis] Starting analysis for request {request_id}")
    
    async def _analyze():
        from app.models import SystemSettings
        from app.services.vertex_ai_service import (
            get_historical_context,
            get_spatial_context,
            build_analysis_prompt,
            analyze_with_gemini,
            strip_pii
        )
        from datetime import datetime
        
        async with SessionLocal() as db:
            # Check if AI analysis is enabled
            settings_result = await db.execute(select(SystemSettings).limit(1))
            settings = settings_result.scalar_one_or_none()
            if not settings or not settings.modules.get('ai_analysis', False):
                msg = f"[AI Analysis] Skipped - AI analysis not enabled. modules={settings.modules if settings else 'No settings'}"
                logger.info(msg)
                print(msg)
                return {"status": "skipped", "reason": "AI analysis not enabled"}
            
            logger.info(f"[AI Analysis] AI module is enabled, proceeding...")
            print(f"[AI Analysis] AI module is enabled, proceeding...")
            
            # Get Vertex AI credentials
            project_id = await get_secret(db, "VERTEX_AI_PROJECT")
            if not project_id:
                msg = "[AI Analysis] Skipped - VERTEX_AI_PROJECT not configured"
                logger.warning(msg)
                print(msg)
                return {"status": "skipped", "reason": "VERTEX_AI_PROJECT not configured"}
            
            logger.info(f"[AI Analysis] Project ID found: {project_id}")
            print(f"[AI Analysis] Project ID found: {project_id}")
            
            location = "global"  # Gemini 3 Flash is available on global endpoints
            service_account_json = await get_secret(db, "VERTEX_AI_SERVICE_ACCOUNT_KEY")
            
            # Get the request
            result = await db.execute(
                select(ServiceRequest).where(ServiceRequest.id == request_id)
            )
            request = result.scalar_one_or_none()
            if not request:
                return {"error": "Request not found"}
            
            # Build request data with PII stripped
            request_data = {
                "service_name": request.service_name,
                "service_code": request.service_code,
                "description": strip_pii(request.description or ""),
                "address": request.address,  # Keep address for context
                "submitted_date": request.requested_datetime.isoformat() if request.requested_datetime else None,
                "matched_asset": request.matched_asset,
                "custom_fields": request.custom_fields,
            }
            
            from app.services.weather_service import get_weather_for_location
            
            # Record time of analysis
            from zoneinfo import ZoneInfo
            analysis_time = datetime.now(ZoneInfo("US/Eastern"))
            request_data["analysis_time"] = analysis_time.strftime("%Y-%m-%d %H:%M:%S %Z")

            # Get historical & spatial context
            historical_context = await get_historical_context(
                db, request.address, request.service_code, request.lat, request.long, exclude_id=request.id
            )
            spatial_context = await get_spatial_context(
                db, request.lat, request.long, request.service_code
            )
            
            # Fetch real-time weather for triage location
            request_data["current_weather"] = await get_weather_for_location(request.lat, request.long)

            # Build the analysis prompt
            prompt = build_analysis_prompt(
                request_data,
                historical_context=historical_context,
                spatial_context=spatial_context
            )
            
            # Get images for multimodal analysis
            image_data = request.media_urls[:3] if request.media_urls else None
            
            # Call Vertex AI
            logger.info(f"[AI Analysis] Calling Vertex AI for request {request_id}...")
            print(f"[AI Analysis] Calling Vertex AI for request {request_id}...")
            
            analysis_result = await analyze_with_gemini(
                project_id=project_id,
                location=location,
                prompt=prompt,
                image_data=image_data,
                service_account_json=service_account_json if service_account_json else None
            )
            
            logger.info(f"[AI Analysis] Got result: {analysis_result}")
            print(f"[AI Analysis] Got result: {analysis_result}")
            
            # Check for errors in result
            if "_error" in analysis_result:
                logger.error(f"[AI Analysis] Error from Vertex AI: {analysis_result['_error']}")
                print(f"[AI Analysis] Error from Vertex AI: {analysis_result['_error']}")
            
            # Store the analysis
            request.ai_analysis = analysis_result
            request.priority = min(10, max(1, int(analysis_result.get("priority_score", 5))))
            request.flagged = len(analysis_result.get("safety_flags", [])) > 0
            if request.flagged:
                request.flag_reason = ", ".join(analysis_result.get("safety_flags", [])[:3])
            
            # Store in vertex_ai columns for easier querying
            request.vertex_ai_summary = analysis_result.get("qualitative_analysis", "")
            request.vertex_ai_priority_score = analysis_result.get("priority_score", 5.0)
            request.vertex_ai_analyzed_at = datetime.utcnow()
            
            await db.commit()
            logger.info(f"[AI Analysis] Saved analysis for request {request_id}")
            print(f"[AI Analysis] Saved analysis for request {request_id}")
            return {"status": "success", "analysis": analysis_result}
    
    try:
        result = run_async(_analyze())
        print(f"[AI Analysis] Task completed: {result}")
        return result
    except Exception as exc:
        print(f"[AI Analysis] Task failed with error: {exc}")
        import traceback
        traceback.print_exc()
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(bind=True)
def geocode_address(self, request_id: int):
    """Geocode address to lat/long using configured service"""
    async def _geocode():
        async with SessionLocal() as db:
            result = await db.execute(
                select(ServiceRequest).where(ServiceRequest.id == request_id)
            )
            request = result.scalar_one_or_none()
            if not request or not request.address:
                return {"error": "Request or address not found"}
            
            # Get Google Maps API key
            api_key = await get_secret(db, "GOOGLE_MAPS_API_KEY")
            service = get_geocoding_service(api_key if api_key else None)
            
            # Geocode the address
            geo_result = await service.geocode(request.address)
            
            if geo_result:
                request.lat = geo_result.lat
                request.long = geo_result.lng
                await db.commit()
                return {
                    "status": "success",
                    "lat": geo_result.lat,
                    "lng": geo_result.lng,
                    "formatted_address": geo_result.formatted_address
                }
            else:
                return {"status": "geocoding_failed", "address": request.address}
    
    try:
        return run_async(_geocode())
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)


@celery_app.task
def send_notification(request_id: int, notification_type: str):
    """Send notification (email/SMS) for request updates"""
    async def _notify():
        async with SessionLocal() as db:
            # Configure notification providers
            await configure_notifications(db)
            
            # Get the request
            result = await db.execute(
                select(ServiceRequest).where(ServiceRequest.id == request_id)
            )
            request = result.scalar_one_or_none()
            if not request:
                return {"error": "Request not found"}
            
            if notification_type == "confirmation":
                # Send confirmation for new request
                notification_service.send_request_confirmation(
                    request_id=str(request.service_request_id),
                    email=request.email,
                    phone=request.phone
                )
            elif notification_type == "status_update":
                # Send status update
                await notification_service.send_status_update(
                    request_id=str(request.service_request_id),
                    new_status=request.status,
                    email=request.email,
                    phone=request.phone
                )
            
            return {"status": "sent", "type": notification_type}
    
    try:
        return run_async(_notify())
    except Exception as e:
        return {"status": "error", "error": str(e)}


@celery_app.task
def send_department_notification(request_id: int, department_email: str):
    """Notify department of new request"""
    async def _notify():
        async with SessionLocal() as db:
            await configure_notifications(db)
            
            result = await db.execute(
                select(ServiceRequest).where(ServiceRequest.id == request_id)
            )
            request = result.scalar_one_or_none()
            if not request:
                return {"error": "Request not found"}
            
            subject = f"New Service Request: #{request.service_request_id} - {request.service_name}"
            body_html = f"""
            <html>
            <body style="font-family: Arial, sans-serif;">
                <h2>New Service Request Received</h2>
                <p><strong>Request ID:</strong> {request.service_request_id}</p>
                <p><strong>Category:</strong> {request.service_name}</p>
                <p><strong>Description:</strong></p>
                <p>{request.description}</p>
                <p><strong>Address:</strong> {request.address or 'Not provided'}</p>
                <p><strong>Submitted:</strong> {request.requested_datetime}</p>
                <hr>
                <p>Please log in to the staff dashboard to manage this request.</p>
            </body>
            </html>
            """
            
            notification_service.send_email(
                to=department_email,
                subject=subject,
                body_html=body_html
            )
            
            return {"status": "sent", "to": department_email}
    
    try:
        return run_async(_notify())
    except Exception as e:
        return {"status": "error", "error": str(e)}
