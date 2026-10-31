import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useSSE } from "../src/hooks/useSSE";

describe("useSSE — Motor Fetch ReadableStream com Bearer Header (ADR-033)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("deve realizar requisição com Fetch, Authorization: Bearer e URL limpa sem query string", async () => {
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(": connected\n\n"));
      },
    });

    vi.spyOn(window, "fetch").mockImplementation((url, init) => {
      capturedUrl = String(url);
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      return Promise.resolve(
        new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        })
      );
    });

    const onOpen = vi.fn();
    const { result } = renderHook(() =>
      useSSE({
        url: "/api/v1/events/stream",
        token: "token-secreto-jwt",
        transport: "fetch",
        onOpen,
      })
    );

    // Permite que promises pendentes resolvam
    await act(async () => {
      await Promise.resolve();
    });

    expect(capturedUrl).toBe("/api/v1/events/stream");
    expect(capturedUrl).not.toContain("token=");
    expect(capturedHeaders["Authorization"]).toBe("Bearer token-secreto-jwt");
    expect(capturedHeaders["Accept"]).toBe("text/event-stream");
    expect(result.current.status).toBe("connected");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("deve parsear stream com blocos SSE e despachar mensagens e heartbeats", async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream({
      start(controller) {
        streamController = controller;
      },
    });

    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );

    const onMessage = vi.fn();
    const { result } = renderHook(() =>
      useSSE({
        url: "/api/v1/events/stream",
        token: "jwt-test",
        transport: "fetch",
        onMessage,
      })
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Envia comentário : ping
    act(() => {
      streamController.enqueue(new TextEncoder().encode(": ping\n\n"));
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.lastHeartbeatAt).toBeInstanceOf(Date);

    // Envia evento de telemetria
    const eventPayload = {
      event_type: "DeviceLatencyMeasured",
      device_id: "core-rtr-01",
      latency_ms: 4.2,
    };

    act(() => {
      streamController.enqueue(
        new TextEncoder().encode(
          `event: DeviceLatencyMeasured\ndata: ${JSON.stringify(eventPayload)}\n\n`
        )
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(onMessage).toHaveBeenCalledWith(eventPayload);
    expect(result.current.lastEvent).toEqual(eventPayload);
  });

  it("deve parar imediatamente quando response status for 401 sem disparar reconexão em loop", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response("Unauthorized", {
        status: 401,
        statusText: "Unauthorized",
      })
    );

    const onError = vi.fn();
    const { result } = renderHook(() =>
      useSSE({
        url: "/api/v1/events/stream",
        token: "token-expirado",
        transport: "fetch",
        onError,
      })
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe("disconnected");
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("401"),
      })
    );
  });
});
