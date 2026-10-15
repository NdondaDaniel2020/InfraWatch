---
name: event-driven-consumer-pattern
description: Diretrizes e padrão arquitetural para desacoplamento orientado a eventos via Consumers e Transactional Outbox no InfraWatch. Abrange prevenção de timing attacks, eliminação de dual-write, isolamento de falhas (blast radius), backpressure e comunicação entre Bounded Contexts.
---

# Padrão de Desacoplamento com Consumers (Event-Driven Consumer Pattern)

Esta skill formaliza o padrão arquitetural de **desacoplamento orientado a eventos via Consumers** no **InfraWatch**. Ela orienta quando e como extrair efeitos colaterais de requisições HTTP e serviços de aplicação, garantindo segurança contra *timing attacks*, integridade transacional sem *dual-write* e resiliência operacional.

---

## 🧭 Quando Manter Síncrono vs Quando Desacoplar via Consumer

Não use consumers apenas para "jogar tarefas lentas para segundo plano". Use esta matriz para decidir a abordagem:

| Manter Síncrono (Inline / Direto) | Desacoplar via Consumer (Event-Driven) |
| :--- | :--- |
| **Leituras Estritas (Queries):** O cliente precisa do dado imediatamente na resposta HTTP (ex.: perfil do usuário, lista de dispositivos). | **Efeitos Colaterais Secundários:** Ações que devem acontecer após a mutação de estado (ex.: e-mails, push notifications, webhooks). |
| **Validações Invariantes:** Regras que impedem a existência da transação (ex.: checagem de duplicidade de login ou e-mail). | **Integrações de Terceiros (I/O Externo):** APIs de terceiros suscetíveis a lentidão ou quedas (ex.: SMTP, GLPI, Telegram, Zabbix). |
| **Operações puras de banco:** Inserção ou atualização do agregado central na mesma transação atômica. | **Prevenção de Timing Attacks:** Fluxos de autenticação/segurança onde a latência de I/O revelaria dados sensíveis (enumeração de contas). |
| **Erros devem abortar a requisição:** Se falhar, o recurso NÃO deve ser criado (ex.: senha fraca ou payload inválido). | **Tolerância a Falhas Temporárias:** O recurso principal já foi salvo com sucesso; falha no efeito secundário deve retentar sem quebrar o usuário. |

---

## 🛡️ Os 5 Benefícios Arquiteturais do Consumer no InfraWatch

### 1. Eliminação de Timing Attacks (Enumeração de Usuários)
- **Problema:** Em fluxos como *Esqueci minha senha*, consultar o banco e responder leva ~10ms se o usuário não existir. Se existir e chamar o SMTP síncrono, leva ~800ms. O invasor descobre contas ativas apenas cronometrando a resposta.
- **Solução com Consumer:** O endpoint grava o evento no Transactional Outbox e retorna `200 OK` em tempo constante (~10ms) em ambos os casos. O `IamEmailConsumer` processa o envio assincronamente.

### 2. Eliminação do Dual-Write (Consistência Sem Transação Distribuída)
- **Problema:** Tentar commitar no PostgreSQL e chamar uma API externa (ou publicar no Kafka/Redis) na mesma requisição cria inconsistência se um dos lados falhar após o outro.
- **Solução com Consumer:** A entidade e o evento de domínio são gravados na **mesma transação SQL atômica** via tabela `outbox`. O relay publica no Redis Streams e o consumer executa a entrega com garantia *at-least-once*.

### 3. Redução do Raio de Explosão (Blast Radius Reduction)
- **Problema:** Queda ou degradação no provedor de e-mail (SendGrid/Mailgun) ou no GLPI trava a API inteira.
- **Solução com Consumer:** O usuário navega normalmente e as operações primárias funcionam. Os eventos acumulam na fila e são consumidos quando a integração externa retornar, sem erros `500` para o cliente.

### 4. Princípio do Aberto/Fechado (OCP) e Bounded Contexts
- Um contexto de negócio (ex.: `Inventory`) não deve importar adapters de outros contextos (`ZabbixClient`, `GlpiClient`, `AuditService`).
- O serviço de domínio apenas emite o evento (`DeviceCreatedEvent`). Novos consumers conectam-se ao evento sem tocar em uma única linha do serviço original.

### 5. Nivelamento de Carga e Backpressure
- APIs externas impõem limites de requisições por segundo (rate limits).
- Em eventos de tempestade (ex.: 200 enlaces caindo no mesmo minuto), o consumer drena a fila de alertas em cadência controlada (*leaky bucket*), evitando erros `429 Too Many Requests`.

---

## 🏛️ Estrutura Canônica de um Consumer (`backend/src/contexts/<context>/consumers/`)

Todo consumer deve seguir o protocolo unificado de mensageria do InfraWatch:

```python
"""Consumer assíncrono para eventos do contexto <context>."""

from __future__ import annotations

import logging
from typing import Any

from src.core.messaging.interfaces import EventHandler

logger = logging.getLogger("infrawatch.<context>.consumer")

# 1. Mapeamento declarativo de eventos para métodos de ação
_EVENT_HANDLERS: dict[str, str] = {
    "DeviceCreatedEvent": "_handle_device_created",
    "DeviceStatusChanged": "_handle_device_status_changed",
}


class ExampleContextConsumer(EventHandler):
    """Consumer que processa eventos de domínio desacoplados."""

    async def handle(self, topic: str, event_data: dict[str, Any]) -> None:
        """Assinatura padrão exigida pelo barramento de eventos."""
        event_type = str(event_data.get("event_type", topic))
        handler_name = _EVENT_HANDLERS.get(event_type)

        if not handler_name:
            logger.debug("Evento '%s' ignorado pelo consumer %s", event_type, self.__class__.__name__)
            return

        handler = getattr(self, handler_name, None)
        if not handler:
            logger.warning("Handler '%s' não implementado para evento '%s'", handler_name, event_type)
            return

        try:
            await handler(event_data)
            logger.info("Evento '%s' processado com sucesso", event_type)
        except Exception:
            # Erro logado com rastreabilidade completa; re-raise permite retries do barramento/relay
            logger.exception("Falha ao processar evento '%s' no consumer", event_type)
            raise

    # 2. Handlers específicos isolados e atômicos
    async def _handle_device_created(self, data: dict[str, Any]) -> None:
        device_id = data.get("aggregate_id") or data.get("device_id")
        # Executa a ação do adapter técnico isolado
        ...
```

---

## 🧪 Estratégia de Testes para Consumers

Ao criar um consumer, adicione testes em `backend/tests/unit/<context>/test_<consumer>.py`:

1. **Despacho Correto:** O método `handle(topic, event_data)` roteia para o handler correto com o payload esperado.
2. **Ignorar Eventos Não Mapeados:** Eventos fora do escopo do consumer retornam silenciosamente sem lançar exceções.
3. **Isolamento de Falhas e Re-raise:** Falhas em integrações externas logizam a exceção e propagam o erro para possibilitar políticas de retentativa ou DLQ no barramento.
4. **Idempotência:** Reprocessar o mesmo evento duas vezes não gera efeitos colaterais duplicados ou inconsistentes.

---

## 🎯 Regras de Ouro
1. **Zero Lógica de Negócio Invariante no Consumer:** O consumer é apenas um *Application Handler / Driving Adapter*. A regra de negócio principal pertence ao Agregado de Domínio ou ao Caso de Uso que gerou o evento.
2. **Payload Serializável:** Dados transmitidos no evento devem ser tipos primitivos JSON (strings, ints, floats, booleans, listas, dicts). Converta `UUID` para `str` e datas para `.isoformat()`.
3. **Assinatura Padronizada:** Sempre use a assinatura canônica `async def handle(self, topic: str, event_data: dict[str, Any]) -> None:`.
4. **Nunca Mascare Erros com Retorno Sucesso Falso:** Se a integração externa falhou e precisa de retry, registre no log e levante a exceção (`logger.exception` seguido de `raise`).
