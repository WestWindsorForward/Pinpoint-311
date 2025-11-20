from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


# Import all models for Alembic autodiscovery
from app import models  # noqa: E402,F401
