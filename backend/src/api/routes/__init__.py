"""API routes package for InfraWatch."""

from src.api.routes.sse import router as sse_router

__all__ = ["sse_router"]
