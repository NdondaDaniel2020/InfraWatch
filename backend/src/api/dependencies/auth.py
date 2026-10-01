"""Dependências de autenticação para as rotas da API InfraWatch.

Fornece suporte unificado para extração de token via Header Bearer e Query Parameter
(essencial para conexões nativas de EventSource/SSE de navegadores).
"""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Query, status
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError

from src.core.security.tokens import decode_access_token


@dataclass(frozen=True)
class AuthenticatedUser:
    """Representação leve do usuário autenticado no contexto da requisição."""

    id: str
    email: str
    role: str
    organization_id: str | None = None

    @property
    def is_super_admin(self) -> bool:
        """Indica se o usuário possui privilégios de superadministrador global."""
        return self.role in ("SUPER_ADMIN", "ADMIN")

    def can_access_organization(self, target_org_id: str | None) -> bool:
        """Valida se o usuário pode acessar dados de uma organização específica."""
        if self.is_super_admin:
            return True
        if target_org_id is None:
            return True
        return self.organization_id == target_org_id


async def get_sse_current_user(
    token_query: Annotated[str | None, Query(alias="token")] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> AuthenticatedUser:
    """Extrai e valida o usuário a partir de query param ?token= ou header Authorization: Bearer.

    Utilizado principalmente para conexões SSE (Server-Sent Events) onde a API
    EventSource nativa do browser não permite customizar headers HTTP.
    """
    token: str | None = None

    # 1. Prioriza header Authorization caso fornecido
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
    # 2. Caso contrário, utiliza query parameter ?token=
    elif token_query:
        token = token_query.strip()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticação necessária. Forneça o token no header Bearer ou query param 'token'.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(token)
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
    except InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação inválido ou corrompido.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido: identificador de usuário ausente.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return AuthenticatedUser(
        id=str(user_id),
        email=str(payload.get("email", "")),
        role=str(payload.get("role", "CLIENT_VIEWER")),
        organization_id=payload.get("organization_id") or payload.get("org_id"),
    )


SSECurrentUserDep = Annotated[AuthenticatedUser, Depends(get_sse_current_user)]
