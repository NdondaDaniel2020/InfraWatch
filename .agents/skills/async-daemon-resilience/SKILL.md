---
name: async-daemon-resilience
description: Diretrizes e padrão arquitetural para daemons e background workers assíncronos no InfraWatch (ProbeWorker, OutboxRelayWorker, ZabbixSyncWorker, TokenCleanupWorker). Cobre graceful shutdown, controle de concorrência com semáforo, ciclo de vida com try-finally e testes de resiliência.
---

# Resiliência de Daemons e Background Workers (Async Daemon Resilience)

Esta skill define a arquitetura, convenções e regras de resiliência obrigatórias para todos os processos assíncronos em segundo plano (**Daemons**, **Workers** e **Schedulers**) no ecossistema do **InfraWatch**.

---

## 🏛️ Anatomia Padrão de um Daemon no InfraWatch

Todos os workers de background (ex: `ProbeWorkerDaemon`, `OutboxRelayWorker`, `ZabbixSyncWorker`, `TokenCleanupWorker`) devem implementar a seguinte estrutura de confiabilidade:

```python
class ExampleDaemon:
    """Estrutura padrão de worker resiliente no InfraWatch."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession] | None = None,
        poll_interval: float = 30.0,
        max_concurrent: int = 250,
    ) -> None:
        self._session_factory = session_factory or get_session_factory()
        self._poll_interval = poll_interval
        self._stop_event = asyncio.Event()
        # 1. Semáforo para proteção de descritores de arquivo (FD) e conexões
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._task: asyncio.Task[None] | None = None

    async def execute_task_with_guard(self, target: Any) -> None:
        """Executa trabalho atômico protegido por semáforo e captura de erros."""
        async with self._semaphore:
            try:
                await self._do_atomic_work(target)
            except Exception:
                logger.exception("Falha ao processar item %s no worker", target)

    async def run_loop(self) -> None:
        """Loop principal resiliente a falhas temporárias."""
        logger.info("Iniciando loop do daemon...")
        while not self._stop_event.is_set():
            try:
                await self._execute_cycle()
            except asyncio.CancelledError:
                break
            except Exception:
                # 2. Tolerância a falhas: erro em um ciclo NÃO mata o processo
                logger.exception("Erro inesperado no ciclo de execução do daemon")
                await asyncio.sleep(2.0)  # Backoff preventivo contra storm de logs

            # 3. Espera cancelável com timeout
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=self._poll_interval)
            except TimeoutError:
                pass  # Intervalo expirou normalmente, inicia próximo ciclo

    async def start(self) -> None:
        """Inicia o daemon em background."""
        self._stop_event.clear()
        self._task = asyncio.create_task(self.run_loop())

    async def stop(self) -> None:
        """Encerramento gracioso e determinístico."""
        self._stop_event.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Daemon encerrado graciosamente.")
```

---

## 🛡️ Pilares de Resiliência

### 1. Parada Graciosa (Graceful Shutdown)
- O encerramento deve ser disparado por `asyncio.Event()` (`_stop_event.set()`).
- O loop de sono deve usar `asyncio.wait_for(self._stop_event.wait(), timeout=...)` em vez de `asyncio.sleep()`, permitindo interrupção instantânea sem aguardar o término do intervalo.
- Ao parar, todas as tarefas ativas (`asyncio.gather(*tasks, return_exceptions=True)`) devem ser aguardadas para evitar `RuntimeError: Task was destroyed but it is pending`.

### 2. Controle de Concorrência e Semáforos
- Ao disparar sondas de rede (ICMP, HTTP, TCP) ou chamadas a APIs externas (Zabbix, GLPI), use **obrigatoriamente** `asyncio.Semaphore(max_concurrent)`.
- Isso previne o esgotamento de descritores de arquivo no Linux (`OSError: [Errno 24] Too many open files`) e a exaustão do loop de eventos.

### 3. Ciclo de Vida Abrangente (`try...finally`) no Lifespan
- Toda inicialização e teardown de workers integrados à API FastAPI deve ser contida em um bloco `try...finally` abrangente em `backend/src/core/web/lifespan.py`.
- No bloco `finally:`, cada recurso (workers, Redis, event bus, database engine) deve ser encerrado em seu próprio `try...except`, garantindo que uma falha ao fechar um worker não impeça o descarte seguro dos demais recursos.

### 4. Tratamento Defensivo de Serviços Opcionais
- Clientes como Redis ou Zabbix podem não estar configurados em ambientes mínimos ou de teste.
- Sempre verifique a existência do cliente antes de utilizá-lo:
  ```python
  redis = get_redis_client()
  if redis:
      await redis.set(...)
  ```
- Trate indisponibilidade transitória com política **fail-open** para não travar a aplicação caso o Redis caia temporariamente.

---

## 🧪 Testes Unitários de Resiliência Obrigatórios

Para cada daemon ou worker criado, adicione testes em `backend/tests/unit/core/test_lifespan_workers.py` ou `tests/unit/workers/` validando:

1. **Ciclo de Vida Básico:** `start()` cria a task e `stop()` a finaliza graciosamente.
2. **Resiliência a Exceções:** Uma exceção levantada em `_execute_cycle()` (ex: perda de conexão com PostgreSQL) é capturada e não encerra o daemon.
3. **Respeito a Configurações:** O worker honra parâmetros como `poll_interval`, `batch_size` e `max_concurrent`.
4. **Isolamento de Shutdown:** Falha de parada em um componente não trava os demais componentes do teardown.

---

## 🎯 Regras de Ouro
1. **Nunca use `while True` cego:** Loops de workers sempre devem verificar `while not self._stop_event.is_set():`.
2. **Nunca engula exceções sem log:** Sempre utilize `logger.exception(...)` para manter rastreabilidade total no Sentry e nos logs centrais.
3. **Semáforo para I/O massivo:** Toda rotina com potencial de disparar dezenas de tarefas assíncronas concorrentes deve ter `asyncio.Semaphore`.
4. **Sinais POSIX no modo standalone:** Scripts com execução CLI direta (`__main__`) devem capturar `SIGINT` e `SIGTERM` chamando o encerramento gracioso.
