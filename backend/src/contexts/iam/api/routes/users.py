"""Rotas REST da API para Gestão de Usuários, Perfil e Sessões Ativas (ADR-003, ADR-012)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from src.contexts.iam.api.dependencies import (
    CurrentUserDep,
    PaginationParamsDep,
    SessionServiceDep,
    UserServiceDep,
    require_roles,
)
from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.schemas.session import (
    SessionListResponse,
    SessionResponse,
    SessionRevokeResponse,
)
from src.contexts.iam.schemas.user import (
    UserListResponse,
    UserPublicResponse,
    UserRolesUpdate,
    UserUpdate,
)
from src.core.exceptions import NotFoundError

router = APIRouter(prefix="/api/v1/users", tags=["Users & Sessions"])


@router.get(
    "/me",
    response_model=UserPublicResponse,
    summary="Obter perfil do usuário conectado",
)
async def get_my_user_profile(
    current_user: CurrentUserDep,
    user_service: UserServiceDep,
) -> UserPublicResponse:
    """Retorna os dados públicos da conta autenticada."""
    try:
        user = await user_service.get_user_by_id(UUID(current_user.id))
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from None

    return UserPublicResponse.model_validate(user)


@router.patch(
    "/me",
    response_model=UserPublicResponse,
    summary="Atualizar perfil próprio (nome)",
)
async def update_my_user_profile(
    body: UserUpdate,
    current_user: CurrentUserDep,
    user_service: UserServiceDep,
) -> UserPublicResponse:
    """Atualiza dados permitidos da conta (como full_name)."""
    user_uuid = UUID(current_user.id)
    try:
        updated = await user_service.update_profile(user_uuid, full_name=body.full_name)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from None

    return UserPublicResponse.model_validate(updated)


@router.get(
    "/me/sessions",
    response_model=SessionListResponse,
    summary="Listar dispositivos e sessões ativas do usuário",
)
async def list_my_sessions(
    current_user: CurrentUserDep,
    session_service: SessionServiceDep,
) -> SessionListResponse:
    """Retorna todos os tokens de refresh ativos que representam sessões do usuário."""
    user_uuid = UUID(current_user.id)
    tokens = await session_service.list_active_sessions(user_uuid)

    sessions_data = [
        SessionResponse(
            id=t.id,
            device_name=t.device_name,
            ip_address=t.ip_address,
            created_at=t.created_at,
            expires_at=t.expires_at,
            is_current=False,
        )
        for t in tokens
    ]
    return SessionListResponse(sessions=sessions_data, total=len(sessions_data))


@router.delete(
    "/me/sessions/{session_id}",
    response_model=SessionRevokeResponse,
    summary="Encerrar remotamente uma sessão específica",
)
async def revoke_session_by_id(
    session_id: UUID,
    current_user: CurrentUserDep,
    session_service: SessionServiceDep,
) -> SessionRevokeResponse:
    """Invalida o refresh token de um dispositivo conectado específico."""
    user_uuid = UUID(current_user.id)
    success = await session_service.revoke_session(user_uuid, session_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sessão não encontrada ou já expirada.",
        )

    return SessionRevokeResponse(message="Sessão revogada com sucesso.", revoked_count=1)


@router.delete(
    "/me/sessions",
    response_model=SessionRevokeResponse,
    summary="Encerrar todas as sessões ativas",
)
async def revoke_all_sessions(
    current_user: CurrentUserDep,
    session_service: SessionServiceDep,
) -> SessionRevokeResponse:
    """Invalida todas as sessões ativas do usuário conectado."""
    user_uuid = UUID(current_user.id)
    count = await session_service.revoke_all_sessions(user_uuid)
    return SessionRevokeResponse(
        message="Todas as sessões ativas foram revogadas com sucesso.",
        revoked_count=count,
    )


# -------------------------------------------------------------------------
# Endpoints Administrativos (Restritos a Gestores e Administradores)
# -------------------------------------------------------------------------


@router.get(
    "",
    response_model=UserListResponse,
    summary="Listar usuários cadastrados com paginação (Admin)",
    dependencies=[
        Depends(
            require_roles(
                UserRole.SUPER_ADMIN,
                UserRole.NOC_OPERATOR,
                UserRole.ORG_ADMIN,
            )
        )
    ],
)
async def list_users(
    current_user: CurrentUserDep,
    pagination: PaginationParamsDep,
    user_service: UserServiceDep,
    organization_id: UUID | None = None,
) -> UserListResponse:
    """Lista usuários cadastrados respeitando o isolamento do tenant caso não seja Super Admin."""
    effective_org = organization_id
    if (
        not current_user.is_super_admin
        and current_user.role != UserRole.NOC_OPERATOR
        and current_user.organization_id
    ):
        effective_org = UUID(current_user.organization_id)

    users, total = await user_service.list_users(
        organization_id=effective_org,
        offset=pagination.offset,
        limit=pagination.limit,
    )

    items = [UserPublicResponse.model_validate(u) for u in users]
    return UserListResponse(
        items=items,
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.get(
    "/{user_id}",
    response_model=UserPublicResponse,
    summary="Consultar usuário por ID (Admin)",
    dependencies=[
        Depends(
            require_roles(
                UserRole.SUPER_ADMIN,
                UserRole.NOC_OPERATOR,
                UserRole.ORG_ADMIN,
            )
        )
    ],
)
async def get_user_by_id(
    user_id: UUID,
    user_service: UserServiceDep,
) -> UserPublicResponse:
    """Busca os detalhes cadastrais de um usuário específico."""
    try:
        user = await user_service.get_user_by_id(user_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from None

    return UserPublicResponse.model_validate(user)


@router.put(
    "/{user_id}/roles",
    response_model=UserPublicResponse,
    summary="Alterar perfil/papel de acesso RBAC de um usuário (Super Admin)",
    dependencies=[Depends(require_roles(UserRole.SUPER_ADMIN))],
)
async def update_user_role(
    user_id: UUID,
    body: UserRolesUpdate,
    user_service: UserServiceDep,
) -> UserPublicResponse:
    """Atualiza o papel de permissão atribuído ao usuário."""
    try:
        updated = await user_service.update_user_role(user_id, body.role)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from None

    return UserPublicResponse.model_validate(updated)


@router.post(
    "/{user_id}/activate",
    response_model=UserPublicResponse,
    summary="Reativar usuário previamente bloqueado (Admin)",
    dependencies=[
        Depends(
            require_roles(
                UserRole.SUPER_ADMIN,
                UserRole.ORG_ADMIN,
            )
        )
    ],
)
async def activate_user(
    user_id: UUID,
    user_service: UserServiceDep,
) -> UserPublicResponse:
    """Reativa conta de usuário."""
    try:
        user = await user_service.activate_user(user_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from None

    return UserPublicResponse.model_validate(user)


@router.post(
    "/{user_id}/deactivate",
    response_model=UserPublicResponse,
    summary="Desativar conta de usuário e revogar sessões ativas (Admin)",
    dependencies=[
        Depends(
            require_roles(
                UserRole.SUPER_ADMIN,
                UserRole.ORG_ADMIN,
            )
        )
    ],
)
async def deactivate_user(
    user_id: UUID,
    current_user: CurrentUserDep,
    user_service: UserServiceDep,
) -> UserPublicResponse:
    """Desativa a conta do usuário e revoga todos os tokens ativos. Administrador não pode desativar a si mesmo."""
    if str(user_id) == str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não é permitido desativar a própria conta de administrador.",
        )

    try:
        user = await user_service.deactivate_user(user_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from None

    return UserPublicResponse.model_validate(user)


@router.delete(
    "/{user_id}/mfa",
    response_model=UserPublicResponse,
    summary="Desativação administrativa de emergência do MFA (Super Admin)",
    dependencies=[Depends(require_roles(UserRole.SUPER_ADMIN))],
)
async def admin_disable_mfa(
    user_id: UUID,
    user_service: UserServiceDep,
) -> UserPublicResponse:
    """Desativa o MFA de um usuário por intervenção de suporte quando há perda irrecuperável de chaves."""
    try:
        user = await user_service.admin_disable_mfa(user_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from None

    return UserPublicResponse.model_validate(user)
