"""Cálculo criptográfico e encadeamento de hash SHA-256 para auditoria imutável."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Any

GENESIS_HASH: str = "0" * 64


def _normalize_timestamp(dt: datetime) -> str:
    """Normaliza o datetime para string ISO-8601 em UTC."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    else:
        dt = dt.astimezone(UTC)
    return dt.isoformat()


def compute_audit_hash(
    *,
    id: str,
    actor_user_id: str | None,
    action: str,
    resource_type: str,
    resource_id: str,
    result: str,
    details: dict[str, Any] | None,
    created_at: datetime,
    previous_hash: str | None,
) -> str:
    """Calcula hash SHA-256 encadeado vinculando o registro ao seu antecessor cronológico."""
    serialized_details = (
        json.dumps(details, sort_keys=True, separators=(",", ":"), default=str)
        if details is not None
        else ""
    )
    timestamp_str = _normalize_timestamp(created_at)
    prev_hash_str = previous_hash if previous_hash is not None else GENESIS_HASH

    payload = (
        f"{id}|"
        f"{actor_user_id or ''}|"
        f"{action}|"
        f"{resource_type}|"
        f"{resource_id}|"
        f"{result}|"
        f"{serialized_details}|"
        f"{timestamp_str}|"
        f"{prev_hash_str}"
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
