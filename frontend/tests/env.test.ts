import { describe, it, expect } from "vitest";
import { resolveApiUrl, ENV } from "../src/utils/env";

describe("Módulo de Ambiente e Resolução de URLs (Issue #274)", () => {
  it("deve manter intactas URLs absolutas que iniciam com http:// ou https://", () => {
    expect(resolveApiUrl("http://localhost:8000/api/v1/health")).toBe(
      "http://localhost:8000/api/v1/health"
    );
    expect(resolveApiUrl("https://infrawatch.42.fr/api/v1/events")).toBe(
      "https://infrawatch.42.fr/api/v1/events"
    );
  });

  it("deve retornar rota relativa com leading slash quando API_BASE_URL for vazio", () => {
    if (!ENV.API_BASE_URL) {
      expect(resolveApiUrl("/api/v1/users")).toBe("/api/v1/users");
      expect(resolveApiUrl("api/v1/users")).toBe("/api/v1/users");
      expect(resolveApiUrl("api/v1/auth/refresh")).toBe("/api/v1/auth/refresh");
    }
  });

  it("deve possuir valores padrões canônicos para SSE_STREAM_URL e APP_TITLE", () => {
    expect(ENV.SSE_STREAM_URL).toBeDefined();
    expect(typeof ENV.SSE_STREAM_URL).toBe("string");
    expect(ENV.APP_TITLE).toBe("InfraWatch NOC");
  });

  it("deve resolver WS_BASE_URL considerando o host e protocolo atual", () => {
    expect(typeof ENV.WS_BASE_URL).toBe("string");
    if (typeof window !== "undefined" && window.location.host) {
      const expectedProto = window.location.protocol === "https:" ? "wss:" : "ws:";
      expect(ENV.WS_BASE_URL).toBe(`${expectedProto}//${window.location.host}`);
    }
  });
});
