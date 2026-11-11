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
  const nocPagesDir = path.resolve(srcDir, "pages/noc");
  const wallboardPagesDir = path.resolve(srcDir, "pages/wallboard");
  const tvComponentsDir = path.resolve(srcDir, "components/tv");
  const telemetryComponentsDir = path.resolve(srcDir, "components/telemetry");
  const layoutComponentsDir = path.resolve(srcDir, "components/layout");

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

  it("módulos de NOC, TV Wallboard, Layout e Telemetria não devem importar da pasta mocks", () => {
    const operationalFiles = [
      ...scanFiles(nocPagesDir),
      ...scanFiles(wallboardPagesDir),
      ...scanFiles(tvComponentsDir),
      ...scanFiles(telemetryComponentsDir),
      ...scanFiles(layoutComponentsDir),
    ];
    for (const filePath of operationalFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      const relative = path.relative(srcDir, filePath);
      expect(content, `${relative} não deve importar da pasta mocks`).not.toMatch(
        /from\s+["'].*\/mocks\/.*["']/
      );
    }
  });

  it("telas e layouts de produção não devem referenciar constantes legadas de mock", () => {
    const appLayoutPath = path.resolve(layoutComponentsDir, "AppLayout.tsx");
    const nocPath = path.resolve(nocPagesDir, "NocDashboardPage.tsx");
    const tvPath = path.resolve(wallboardPagesDir, "TvWallboardPage.tsx");

    for (const file of [appLayoutPath, nocPath, tvPath]) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, "utf-8");
        expect(content).not.toMatch(/INITIAL_MOCK_DEVICES/);
        expect(content).not.toMatch(/TV_DEVICES/);
        expect(content).not.toMatch(/TV_INCIDENTS/);
        expect(content).not.toMatch(/TV_BACKBONES/);
      }
    }
  });
});
