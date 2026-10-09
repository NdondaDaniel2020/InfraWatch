"""Consumers assíncronos do Bounded Context de Identidade (IAM)."""

from src.contexts.iam.consumers.iam_email_consumer import (
    IAM_EMAIL_TOPICS,
    IamEmailConsumer,
)

__all__ = [
    "IAM_EMAIL_TOPICS",
    "IamEmailConsumer",
]
