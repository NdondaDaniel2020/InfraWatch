"""Roteador principal agregador do contexto Network Topology."""

from __future__ import annotations

from fastapi import APIRouter

from src.contexts.network.topology.api.routes.topology import router as topology_router

router = APIRouter()
router.include_router(topology_router)

__all__ = ["router"]
