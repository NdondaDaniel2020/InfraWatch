"""Módulo de repositórios do contexto de Identidade."""

from src.contexts.identity.repositories.organization_repository import OrganizationRepository
from src.contexts.identity.repositories.user_repository import UserRepository

__all__ = [
    "OrganizationRepository",
    "UserRepository",
]
