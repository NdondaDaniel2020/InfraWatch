# 📦 Prompt de Execução: Padronização da Gestão Transacional (Opção 1)

> **Instruções para o Agente:**  
> Implemente o padrão **Service-Delimited Transactions com Outbox Atômico** no projeto `InfraWatch` (`/spot/NdDaniel/Code/Estudo/InfraWatch/backend`).  
> **Objetivo:** Transferir toda a responsabilidade de `commit()`, `refresh()` e registro de eventos de `Outbox` das rotas HTTP para dentro dos respectivos **Application Services**, garantindo atomicidade estrita e transformando todos os controllers em *Thin Controllers*.  
> **Meta:** Todos os 206 testes devem continuar passando com 100% de sucesso.

---

## 🧭 Regras Arquiteturais da Gestão Transacional

1. **O Service é o dono da transação:** Todo caso de uso que altera o banco deve executar `await self.session.commit()` internamente.
2. **Atomicidade com Outbox:** Se um caso de uso gera um evento (ex.: `UserLoggedInEvent`), o evento deve ser adicionado ao Outbox **na mesma sessão antes do `commit()`**:
   ```python
   OutboxRepository.add_event(self.session, event, aggregate_type="User")
   await self.session.commit()
   ```
3. **Rotas HTTP NUNCA chamam `commit()` ou `refresh()`:** As rotas apenas recebem DTOs, invocam o Service e retornam o DTO de resposta.
4. **Repositórios NUNCA chamam `commit()`:** O Repository faz apenas operações de dados (`add`, `get`, `delete`, `flush`).

---

## 🛠️ Passo a Passo de Implementação

---

### PASSO 1: Encapsular Transações e Outbox nos Services de IAM

#### 1.1. Arquivo: `src/contexts/iam/services/auth_service.py`
Adicionar a importação do `OutboxRepository` e dos eventos necessários caso não existam:
```python
from src.core.events.outbox_repository import OutboxRepository
from src.contexts.iam.domain.events import UserLoggedInEvent
```

1. **No método `authenticate(...)`**:
   Quando o login for concluído com sucesso (sem pendência de MFA) e o par de tokens for gerado:
   ```python
   # Registra auditoria no Transactional Outbox antes do commit
   event = UserLoggedInEvent(
       aggregate_id=user.id,
       user_id=user.id,
       email=user.email,
       ip_address=client_ip,
       user_agent=user_agent,
       organization_id=user.organization_id,
   )
   OutboxRepository.add_event(self.session, event, aggregate_type="User")
   await self.session.commit()
   return user, tokens
   ```

2. **No método `authenticate_mfa_challenge(...)`**:
   Após validar o código TOTP/Backup e gerar o par de tokens:
   ```python
   event = UserLoggedInEvent(
       aggregate_id=user.id,
       user_id=user.id,
       email=user.email,
       ip_address=client_ip,
       user_agent=user_agent,
       organization_id=user.organization_id,
   )
   OutboxRepository.add_event(self.session, event, aggregate_type="User")
   await self.session.commit()
   return user, tokens
   ```

3. **Nos métodos de e-mail e redefinição de senha**:
   - `verify_email(self, token: str)`: adicionar `await self.session.commit()` ao final.
   - `resend_verification_email(self, email: str)`: adicionar `await self.session.commit()` após criar o novo token.
   - `request_password_reset(self, email: str)`: adicionar `await self.session.commit()` após criar o token e enfileirar o e-mail.
   - `reset_password(self, token: str, new_password: str)`: adicionar `await self.session.commit()` após atualizar a senha.

---

#### 1.2. Arquivo: `src/contexts/iam/services/token_service.py`
Importar:
```python
from src.core.events.outbox_repository import OutboxRepository
from src.contexts.iam.domain.events import UserLoggedOutEvent
```

1. **No método `rotate_refresh_token(...)`**:
   Adicionar `await self.session.commit()` logo antes de retornar o novo par de tokens.

2. **No método `revoke_refresh_token(...)`**:
   Adicionar parâmetros opcionais `user_id: UUID | None = None` e `email: str | None = None`:
   ```python
   async def revoke_refresh_token(
       self,
       raw_refresh_token: str,
       user_id: UUID | None = None,
       email: str | None = None,
   ) -> bool:
       # ... lógica existente de revogação ...
       if user_id:
           event = UserLoggedOutEvent(
               aggregate_id=user_id,
               user_id=user_id,
               email=email or "",
               reason="User logout",
           )
           OutboxRepository.add_event(self.session, event, aggregate_type="User")
       await self.session.commit()
       return True
   ```

---

#### 1.3. Arquivo: `src/contexts/iam/services/user_service.py`
Garantir que todas as mutações de usuário executem `commit()` e `refresh()` internamente:
1. `register_user(...)`: adicionar `await self.session.commit()` e `await self.session.refresh(user)` antes do `return user, verification_token`.
2. `update_profile(...)`: adicionar `await self.session.commit()` e `await self.session.refresh(user)` antes de retornar o usuário atualizado.
3. `update_user_role(...)`: adicionar `await self.session.commit()` e `await self.session.refresh(user)`.
4. `activate_user(...)`: adicionar `await self.session.commit()` e `await self.session.refresh(user)`.
5. `deactivate_user(...)`: adicionar `await self.session.commit()` e `await self.session.refresh(user)`.
6. `admin_disable_mfa(...)`: adicionar `await self.session.commit()` e `await self.session.refresh(user)`.

---

#### 1.4. Arquivo: `src/contexts/iam/services/session_service.py`
1. `revoke_session(self, user_id: UUID, session_id: UUID) -> bool`:
   Adicionar `await self.session.commit()` se a sessão foi revogada com sucesso.
2. `revoke_all_sessions(self, user_id: UUID) -> int`:
   Adicionar `await self.session.commit()` após revogar todas as sessões.

---

#### 1.5. Arquivos: `src/contexts/iam/services/mfa_service.py` e `notification_service.py`
- Em `mfa_service.py`: adicionar `await self.session.commit()` em:
  - `setup_totp(...)`
  - `verify_and_activate_totp(...)`
  - `generate_backup_codes(...)`
  - `disable_mfa(...)`
- Em `notification_service.py`: adicionar `await self.session.commit()` em:
  - `mark_as_read(...)`
  - `mark_all_as_read(...)`

---

### PASSO 2: Limpar as Rotas HTTP (Remover Commits e Outbox)

Agora que os Services são transacionais, limpe as rotas HTTP:

#### 2.1. Arquivo: `src/contexts/iam/api/routes/auth.py`
1. Remover todos os `await db.commit()` e `await db.refresh(user)` dos endpoints:
   - `/register`
   - `/login`
   - `/login-form`
   - `/login/mfa-challenge`
   - `/refresh`
   - `/logout`
   - `/logout/all`
   - `/verify-email`
   - `/verify-email/resend`
   - `/password-reset/request`
   - `/password-reset/confirm`
2. Remover as instanciações de `UserLoggedInEvent`, `UserLoggedOutEvent` e as chamadas `OutboxRepository.add_event(db, ...)`.
3. No endpoint `/logout`, chamar simplesmente:
   ```python
   await token_service.revoke_refresh_token(
       raw_refresh_token=body.refresh_token,
       user_id=UUID(current_user.id),
       email=current_user.email,
   )
   return {"status": "ok", "message": "Sessão encerrada com sucesso."}
   ```

#### 2.2. Arquivo: `src/contexts/iam/api/routes/users.py`
1. Remover todos os `await db.commit()` e `await db.refresh(...)` dos endpoints:
   - `/me` (PATCH)
   - `/me/sessions/{session_id}` (DELETE)
   - `/me/sessions` (DELETE)
   - `/{user_id}/roles` (PUT)
   - `/{user_id}/activate` (POST)
   - `/{user_id}/deactivate` (POST)
   - `/{user_id}/mfa` (DELETE)

#### 2.3. Arquivo: `src/contexts/iam/api/routes/mfa.py`
1. Remover todos os 4 `await db.commit()`.

#### 2.4. Arquivo: `src/contexts/iam/api/routes/notifications.py`
1. Remover os 2 `await db.commit()`.

---

### PASSO 3: Injeção de Dependência de Serviços (FastAPI Depends)

Crie ou atualize o arquivo `src/contexts/iam/api/dependencies/services.py`:
```python
"""Injeção de dependências dos serviços de aplicação do IAM."""

from typing import Annotated
from fastapi import Depends
from src.core.database.session import DbSessionDep
from src.contexts.iam.services.auth_service import AuthService
from src.contexts.iam.services.user_service import UserService
from src.contexts.iam.services.token_service import TokenService
from src.contexts.iam.services.session_service import SessionService
from src.contexts.iam.services.mfa_service import MfaService
from src.contexts.iam.services.notification_service import NotificationService
from src.contexts.iam.services.organization_service import OrganizationService

def get_auth_service(db: DbSessionDep) -> AuthService:
    return AuthService(db)

def get_user_service(db: DbSessionDep) -> UserService:
    return UserService(db)

def get_token_service(db: DbSessionDep) -> TokenService:
    return TokenService(db)

def get_session_service(db: DbSessionDep) -> SessionService:
    return SessionService(db)

def get_mfa_service(db: DbSessionDep) -> MfaService:
    return MfaService(db)

def get_notification_service(db: DbSessionDep) -> NotificationService:
    return NotificationService(db)

def get_organization_service(db: DbSessionDep) -> OrganizationService:
    return OrganizationService(db)

AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]
UserServiceDep = Annotated[UserService, Depends(get_user_service)]
TokenServiceDep = Annotated[TokenService, Depends(get_token_service)]
SessionServiceDep = Annotated[SessionService, Depends(get_session_service)]
MfaServiceDep = Annotated[MfaService, Depends(get_mfa_service)]
NotificationServiceDep = Annotated[NotificationService, Depends(get_notification_service)]
OrganizationServiceDep = Annotated[OrganizationService, Depends(get_organization_service)]
```

E utilize essas dependências nos endpoints das rotas (ex.: em vez de `user_service = UserService(db)`, receba `user_service: UserServiceDep`).

---

### 🧪 PASSO 4: Validação e Testes

1. No terminal do backend, execute a suíte de testes:
   ```bash
   uv run pytest
   ```
2. Certifique-se de que todos os **206 testes** continuam passando sem erros.
3. Se algum teste unitário de service falhar por mock de sessão, garanta que o mock da sessão suporte `await session.commit()`.
4. Faça o commit seguindo o padrão Conventional Commits em Português:
   ```bash
   git add .
   git commit -m "refactor(database): padronizar gestao transacional nos services com outbox atomico"
   ```
