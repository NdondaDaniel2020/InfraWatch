"""Dependências de autenticação para as rotas da API InfraWatch.

Fornece suporte unificado para extração de token via Header Bearer e Query Parameter
(essencial para conexões nativas de EventSource/SSE de navegadores).
"""

from typing import Annotated

from fastapi import Depends, Header, HTTPException, Query, Request, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError, PyJWTError

from src.contexts.iam.domain.authenticated_user import AuthenticatedUser
from src.contexts.iam.domain.enums import UserRole
from src.contexts.iam.security.tokens import decode_access_token
from src.contexts.iam.services.token_service import (
    is_session_blacklisted,
    is_token_blacklisted,
)
from src.core.exceptions import (
    InvalidTokenError as CoreInvalidTokenError,
)
from src.core.exceptions import (
    TokenExpiredError as CoreTokenExpiredError,
)
from src.core.infrastructure.redis import get_redis_client


oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login-form",
    auto_error=False,
)


async def get_current_user(
    request: Request = None,  # type: ignore[assignment]
    token_bearer: Annotated[str | None, Depends(oauth2_scheme)] = None,
    token_query: Annotated[str | None, Query(alias="token")] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> AuthenticatedUser:
    """Extrai e valida o token JWT.

    Ordem de resolução:
    1. Cabeçalho Authorization via OAuth2PasswordBearer
    2. Cabeçalho Authorization: Bearer manual
    3. Query parameter ?token= (utilizado por conexões EventSource / SSE)
    """
    raw_token = token_bearer

    if not raw_token and authorization:
        if authorization.startswith("Bearer "):
            raw_token = authorization[7:].strip()
        else:
            raw_token = authorization.strip()

    if not raw_token and token_query:
        raw_token = token_query.strip()

    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticação necessária. Forneça o token no cabeçalho Authorization ou parâmetro token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(raw_token)
    except (CoreTokenExpiredError, ExpiredSignatureError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
    except (CoreInvalidTokenError, InvalidTokenError, PyJWTError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação inválido ou corrompido.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    jti = payload.get("jti")
    sid = payload.get("sid")

    redis_cli = None
    if request is not None and hasattr(request, "app") and hasattr(request.app, "state"):
        redis_cli = getattr(request.app.state, "redis_client", None)
    if redis_cli is None:
        redis_cli = get_redis_client()

    if jti and await is_token_blacklisted(jti, redis_client=redis_cli):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação revogado ou na lista de bloqueio.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if sid and await is_session_blacklisted(sid, redis_client=redis_cli):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão revogada remotamente.",
            headers={"WWW-Authenticate": "Bearer"},
        )

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
        role=str(payload.get("role", UserRole.CLIENT_VIEWER.value)),
        organization_id=payload.get("organization_id") or payload.get("org_id"),
    )


CurrentUserDep = Annotated[AuthenticatedUser, Depends(get_current_user)]

__all__ = [
    "AuthenticatedUser",
    "CurrentUserDep",
    "get_current_user",
    "oauth2_scheme",
]
