import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Mock explícito ativado por padrão nas suítes de teste de integração
if (process.env.VITE_ENABLE_MOCKS === undefined) {
  process.env.VITE_ENABLE_MOCKS = "true";
}

// Polyfill ResizeObserver para componentes Recharts em ambiente jsdom
if (typeof window !== "undefined" && !window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

afterEach(() => {
  cleanup();
});
