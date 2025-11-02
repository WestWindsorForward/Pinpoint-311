from __future__ import annotations

import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


async def send_email_notification(to_email: str, subject: str, html_body: str, text_body: str | None = None) -> bool:
    if settings.mailgun_api_key and settings.mailgun_domain and settings.mailgun_from_email:
        return await _send_mailgun(to_email, subject, html_body, text_body)

    if settings.smtp_host and settings.smtp_from_email and settings.smtp_username and settings.smtp_password:
        return await _send_smtp(to_email, subject, html_body, text_body)

    logger.info("Email notification skipped; no email provider configured")
    return False


async def _send_mailgun(to_email: str, subject: str, html_body: str, text_body: str | None) -> bool:
    url = f"https://api.mailgun.net/v3/{settings.mailgun_domain}/messages"
    auth = ("api", settings.mailgun_api_key)
    data = {
        "from": settings.mailgun_from_email,
        "to": [to_email],
        "subject": subject,
        "text": text_body or html_body,
        "html": html_body,
    }
    async with httpx.AsyncClient(timeout=10.0, auth=auth) as client:
        response = await client.post(url, data=data)
        if response.status_code >= 400:
            logger.warning("Mailgun send failed: %s", response.text)
            return False
    return True


async def _send_smtp(to_email: str, subject: str, html_body: str, text_body: str | None) -> bool:
    import asyncio
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    loop = asyncio.get_running_loop()

    def _send() -> bool:
        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = settings.smtp_from_email
        message["To"] = to_email
        if text_body:
            message.attach(MIMEText(text_body, "plain"))
        message.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
        return True

    return await loop.run_in_executor(None, _send)


async def send_sms_notification(to_number: str, message: str) -> bool:
    if not (settings.twilio_account_sid and settings.twilio_auth_token and settings.twilio_messaging_service_sid):
        logger.info("SMS notification skipped; Twilio not configured")
        return False

    url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json"
    data = {
        "To": to_number,
        "MessagingServiceSid": settings.twilio_messaging_service_sid,
        "Body": message,
    }
    auth = (settings.twilio_account_sid, settings.twilio_auth_token)

    async with httpx.AsyncClient(timeout=10.0, auth=auth) as client:
        response = await client.post(url, data=data)
        if response.status_code >= 400:
            logger.warning("Twilio send failed: %s", response.text)
            return False
    return True
