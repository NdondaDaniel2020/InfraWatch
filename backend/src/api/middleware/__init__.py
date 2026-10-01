"""Middlewares ASGI e HTTP da aplicação InfraWatch."""

from src.api.middleware.trusted_proxy import TrustedProxyMiddleware

__all__ = ["TrustedProxyMiddleware"]
