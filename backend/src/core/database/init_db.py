"""Database initialization and schema validation for InfraWatch.

Provides fail-fast database connection validation at startup.
Does NOT include seeding (roles, admin user) - that's application-specific.
"""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from src.core.config import get_settings
from src.core.database.base_model import Base
from src.core.database.session import get_engine

logger = logging.getLogger(__name__)


async def init_db(engine: AsyncEngine | None = None) -> AsyncEngine:
    """Validate database connectivity and ensure schema exists.

    This is called at application startup (lifespan) for fail-fast behavior.
    If the database is unreachable or credentials are invalid, this raises
    immediately rather than failing on the first request.

    Args:
        engine: Optional AsyncEngine to use. If not provided, uses the singleton.

    Returns:
        The AsyncEngine that was validated.

    Raises:
        Exception: If database connection fails or schema validation fails.
    """
    if engine is None:
        engine = get_engine()

    settings = get_settings()

    # Test connectivity and create tables if they don't exist
    # In production with Alembic, this is a no-op (tables already exist)
    # In development/test, this ensures schema is up to date
    async with engine.begin() as connection:
        if settings.ENVIRONMENT in ("development", "test"):
            # Create all tables (idempotent)
            await connection.run_sync(Base.metadata.create_all)
            logger.info("Database schema validated/created for %s environment", settings.ENVIRONMENT)
        else:
            # Production: just test connectivity
            await connection.execute(text("SELECT 1"))
            logger.info("Database connectivity validated for production environment")

    return engine


async def close_db(engine: AsyncEngine | None = None) -> None:
    """Dispose of the database engine and all pooled connections."""
    if engine is None:
        from src.core.database.session import get_engine
        engine = get_engine()

    await engine.dispose()
    logger.info("Database engine disposed")