import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Diretriz Arquitetural Anti-Mock (P2 - CI & Contratos Reais)", () => {
  const srcDir = path.resolve(__dirname, "../src");
  const servicesDir = path.resolve(srcDir, "services");
  const clientPagesDir = path.resolve(srcDir, "pages/client");
  const clientComponentsDir = path.resolve(srcDir, "components/client");
  const backupPagesDir = path.resolve(srcDir, "pages/backup");
  const slaPagesDir = path.resolve(srcDir, "pages/sla");
  const auditPagesDir = path.resolve(srcDir, "pages/audit");
  const topologyPagesDir = path.resolve(srcDir, "pages/topology");
  const inventoryPagesDir = path.resolve(srcDir, "pages/inventory");

  const scanFiles = (dir: string): string[] => {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...scanFiles(fullPath));
      } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
        files.push(fullPath);
      }
    }
    return files;
  };

  it("serviços essenciais de produção não devem importar mocks", () => {
    const servicesToCheck = [
      "clientPortalApi.ts",
      "backupApi.ts",
      "slaApi.ts",
      "auditApi.ts",
      "deviceDetailApi.ts",
      "notificationsApi.ts",
      "adminApi.ts",
      "topologyApi.ts",
      "incidentsApi.ts",
    ];

    for (const serviceFile of servicesToCheck) {
      const filePath = path.join(servicesDir, serviceFile);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        expect(content, `${serviceFile} não deve importar da pasta mocks`).not.toMatch(
          /from\s+["'].*\/mocks\/.*["']/
        );
      }
    }
  });

  it("módulos do Portal do Cliente não devem importar dados estáticos de mocks", () => {
    const clientFiles = [...scanFiles(clientPagesDir), ...scanFiles(clientComponentsDir)];
    for (const filePath of clientFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      const relative = path.relative(srcDir, filePath);
      expect(content, `${relative} não deve importar da pasta mocks`).not.toMatch(
        /from\s+["'].*\/mocks\/.*["']/
      );
    }
  });

  it("módulos de Backup, SLA, Auditoria, Topologia e Inventário não devem importar dados estáticos de mocks", () => {
    const targetFiles = [
      ...scanFiles(backupPagesDir),
      ...scanFiles(slaPagesDir),
      ...scanFiles(auditPagesDir),
      ...scanFiles(topologyPagesDir),
      ...scanFiles(inventoryPagesDir),
    ];
    for (const filePath of targetFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      const relative = path.relative(srcDir, filePath);
      expect(content, `${relative} não deve importar da pasta mocks`).not.toMatch(
        /from\s+["'].*\/mocks\/.*["']/
      );
    }
  });

  it("serviços de API não devem mascarar erros com catch silencioso retornando arrays mock", () => {
    const criticalApis = [
      "clientPortalApi.ts",
      "backupApi.ts",
      "slaApi.ts",
      "auditApi.ts",
      "deviceDetailApi.ts",
      "incidentsApi.ts",
    ];

    for (const apiFile of criticalApis) {
      const filePath = path.join(servicesDir, apiFile);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        expect(content, `${apiFile} não deve ter fallback silencioso com mock no catch`).not.toMatch(
          /catch\s*\{[^}]*return\s+\[\s*\.\.\.mock/i
        );
      }
    }
  });
});
