import logging
import smtplib
from email.message import EmailMessage

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.settings import ApiCredential

logger = logging.getLogger(__name__)


async def send_email(session: AsyncSession, *, to: str, subject: str, body: str) -> None:
    cred = await _load_smtp_credentials(session)
    if not cred:
        logger.warning("SMTP credentials missing; skipping email to %s", to)
        return

    msg = EmailMessage()
    msg["From"] = cred.metadata.get("from_email") if cred.metadata else "noreply@township"
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    try:
        with smtplib.SMTP(cred.metadata.get("host", "localhost"), int(cred.metadata.get("port", 25))) as smtp:
            if cred.metadata.get("use_tls"):
                smtp.starttls()
            if cred.key:
                smtp.login(cred.key, cred.secret)
            smtp.send_message(msg)
    except Exception as exc:  # pragma: no cover - best effort
        logger.error("Failed to send email: %s", exc)


async def _load_smtp_credentials(session: AsyncSession) -> ApiCredential | None:
    stmt = select(ApiCredential).where(ApiCredential.provider == "smtp")
    result = await session.execute(stmt)
    cred = result.scalar_one_or_none()
    if cred:
        return cred
    if settings.mailgun_api_key:
        return ApiCredential(provider="smtp", key="api", secret=settings.mailgun_api_key, metadata={"host": "smtp.mailgun.org", "port": 587, "use_tls": True})
    return None
