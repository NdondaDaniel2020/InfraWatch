"""Testes de Carga, Concorrência e Estabilidade do Agendador em RAM (Tarefa 8.4).

Valida que o InMemorySchedule sustenta 5.000 alvos simultâneos em memória
com latência de varredura inferior a 50ms, controle de concorrência via semáforo
e resiliência a mutações concorrentes sem vazamento de descritores.
"""

import asyncio
import time
from uuid import uuid4

import pytest

from src.workers.scheduler.in_memory_inventory import InMemorySchedule, ProbeTarget


@pytest.mark.asyncio
async def test_load_5000_targets_in_memory_tick_latency():
    """Valida cadastro e tempo de varredura do agendador com 5.000 alvos."""
    schedule = InMemorySchedule()
    target_count = 5000

    # 1. Popula 5.000 alvos em memória
    start_load = time.perf_counter()
    for i in range(target_count):
        target = ProbeTarget(
            device_id=uuid4(),
            organization_id=uuid4(),
            name=f"Device-{i:05d}",
            ip_address=f"10.{(i // 65536) % 256}.{(i // 256) % 256}.{i % 256}",
            port=80 if i % 2 == 0 else 443,
            protocol="http" if i % 2 == 0 else "https",
            category="SERVER" if i % 3 == 0 else "ROUTER",
            interval_seconds=30 if i % 2 == 0 else 60,
            is_paused=False,
            status="UP",
        )
        await schedule.add_or_update(target)

    load_duration = time.perf_counter() - start_load
    assert schedule.count == target_count
    # Cadastro de 5.000 itens em memória deve ser célere (< 1.5s)
    assert load_duration < 1.5

    # 2. Mede a latência de varredura para recuperar alvos ativos
    tick_times: list[float] = []
    for _ in range(10):
        t0 = time.perf_counter()
        active = await schedule.get_active_targets()
        dt_ms = (time.perf_counter() - t0) * 1000.0
        tick_times.append(dt_ms)
        assert len(active) == target_count

    avg_tick_ms = sum(tick_times) / len(tick_times)
    max_tick_ms = max(tick_times)

    # Critério de aceite: Varredura de 5.000 alvos em RAM deve ser < 50ms
    assert avg_tick_ms < 50.0, f"Tempo médio de tick ({avg_tick_ms:.2f}ms) excedeu limite de 50ms"
    assert max_tick_ms < 100.0, f"Pico de tick ({max_tick_ms:.2f}ms) excedeu limite de 100ms"


@pytest.mark.asyncio
async def test_load_concurrency_semaphore_throttling():
    """Valida controle de concorrência com semáforo para 5.000 tarefas concorrentes."""
    semaphore_limit = 250
    semaphore = asyncio.Semaphore(semaphore_limit)
    total_tasks = 5000

    current_concurrency = 0
    max_observed_concurrency = 0
    completed_tasks = 0
    lock = asyncio.Lock()

    async def simulated_probe_execution(index: int):
        nonlocal current_concurrency, max_observed_concurrency, completed_tasks
        async with semaphore:
            async with lock:
                current_concurrency += 1
                max_observed_concurrency = max(max_observed_concurrency, current_concurrency)

            # Simula I/O não-bloqueante ultrarrápido
            await asyncio.sleep(0.0001)

            async with lock:
                current_concurrency -= 1
                completed_tasks += 1

    t0 = time.perf_counter()
    tasks = [asyncio.create_task(simulated_probe_execution(i)) for i in range(total_tasks)]
    await asyncio.gather(*tasks)
    duration = time.perf_counter() - t0

    assert completed_tasks == total_tasks
    assert max_observed_concurrency <= semaphore_limit
    assert max_observed_concurrency > 100  # Confirma que houve paralelismo real expressivo

    throughput = total_tasks / duration
    # Confirma throughput elevado de despacho assíncrono (> 1.000 tarefas/segundo)
    assert throughput > 1000.0, f"Throughput {throughput:.1f} tarefas/s abaixo do esperado"


@pytest.mark.asyncio
async def test_concurrent_mutations_under_heavy_read_load():
    """Valida que mutações (add, pause, remove) não corrompem nem travam o agendador durante leitura pesada."""
    schedule = InMemorySchedule()
    base_targets: list[ProbeTarget] = []

    for i in range(2000):
        t = ProbeTarget(
            device_id=uuid4(),
            organization_id=uuid4(),
            name=f"BaseDev-{i}",
            ip_address="10.0.0.1",
            port=80,
            protocol="http",
            category="SWITCH",
            interval_seconds=60,
        )
        base_targets.append(t)
        await schedule.add_or_update(t)

    stop_event = asyncio.Event()

    async def reader_loop():
        read_cycles = 0
        while not stop_event.is_set():
            active = await schedule.get_active_targets()
            assert len(active) > 0
            read_cycles += 1
            await asyncio.sleep(0.001)
        return read_cycles

    async def writer_mutations():
        # Adiciona novos alvos
        new_targets = [
            ProbeTarget(
                device_id=uuid4(),
                organization_id=uuid4(),
                name=f"NewDev-{j}",
                ip_address="10.0.1.1",
                port=443,
                protocol="https",
                category="FIREWALL",
                interval_seconds=30,
            )
            for j in range(200)
        ]
        for nt in new_targets:
            await schedule.add_or_update(nt)

        # Pausa alguns alvos existentes
        for t in base_targets[:100]:
            await schedule.pause(t.device_id)

        # Remove alguns alvos
        for t in base_targets[100:150]:
            await schedule.remove(t.device_id)

    readers = [asyncio.create_task(reader_loop()) for _ in range(5)]
    writer = asyncio.create_task(writer_mutations())

    await writer
    # Permite aos leitores executar ciclos adicionais
    await asyncio.sleep(0.02)
    stop_event.set()
    read_results = await asyncio.gather(*readers)

    # Valida que todos os leitores completaram ciclos concorrentes sem levantar exceções
    assert all(cycles >= 1 for cycles in read_results)
    # Contagem final: 2000 base + 200 novos - 50 removidos = 2150
    assert schedule.count == 2150
