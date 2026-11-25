import { test, expect } from "@playwright/test";

test.describe("Navegação do Sistema e Shell Operacional (E2E)", () => {
  test("deve redirecionar para /login ao tentar acessar rotas desconhecidas sem autenticação", async ({
    page,
  }) => {
    await page.goto("/rota-totalmente-inexistente-123");

    // Redirecionamento estrito de segurança do ProtectedRoute para usuários anônimos
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('[data-testid="login-page"]')).toBeVisible();
  });

  test("deve renderizar favicon e metatags de observabilidade", async ({
    page,
  }) => {
    await page.goto("/login");

    const themeColor = await page.locator('meta[name="theme-color"]').getAttribute("content");
    expect(themeColor).toBe("#090D16");

    const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(viewport).toContain("width=device-width");
  });

  test("deve carregar os módulos assíncronos sem erros de console não tratados", async ({
    page,
  }) => {
    const errorLogs: string[] = [];
    page.on("pageerror", (err) => {
      errorLogs.push(err.message);
    });

    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Nenhum erro crítico não capturado no runtime do navegador
    expect(errorLogs).toHaveLength(0);
  });
});
