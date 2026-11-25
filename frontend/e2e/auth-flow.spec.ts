import { test, expect } from "@playwright/test";

test.describe("Fluxo de Autenticação e Segurança (E2E)", () => {
  test("deve redirecionar usuário não autenticado para /login ao tentar acessar rota privada", async ({
    page,
  }) => {
    await page.goto("/noc");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator('[data-testid="login-page"]')).toBeVisible();
  });

  test("deve renderizar a tela de login com formulário e aviso institucional", async ({
    page,
  }) => {
    await page.goto("/login");

    // Título da aplicação
    await expect(page).toHaveTitle(/InfraWatch/i);

    // Campos de autenticação
    const emailInput = page.locator('input[type="email"], input[id="email"]');
    const passwordInput = page.locator('input[type="password"], input[id="password"]');
    const submitBtn = page.locator('button[type="submit"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();

    // Verificação do texto institucional que orienta o cadastro via administrador da organização
    const noticeText = page.locator("text=Administrador da sua organização");
    await expect(noticeText).toBeVisible();
  });

  test("deve alternar para o modo de recuperação de senha ao clicar em 'Esqueceu a senha?'", async ({
    page,
  }) => {
    await page.goto("/login");

    const forgotPasswordBtn = page.locator("#btn-goto-forgot");
    await expect(forgotPasswordBtn).toBeVisible();
    await forgotPasswordBtn.click();

    // Verifica que o card alternou para o modo de recuperação de senha
    const forgotEmailInput = page.locator("#forgot-email");
    await expect(forgotEmailInput).toBeVisible();
    await expect(page.locator("text=Enviar Link de Recuperação")).toBeVisible();
  });

  test("deve acessar a rota direta de recuperação de senha /password-reset", async ({
    page,
  }) => {
    await page.goto("/password-reset");
    await expect(page).toHaveURL(/\/password-reset/);
    await expect(page.locator("body")).toBeVisible();
  });

  test("deve exibir validação ao tentar submeter credenciais inválidas", async ({
    page,
  }) => {
    await page.goto("/login");

    const emailInput = page.locator('input[type="email"], input[id="email"]');
    const submitBtn = page.locator('button[type="submit"]');

    await emailInput.fill("formato-invalido");
    await submitBtn.click();

    // Validação nativa do HTML5
    const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.checkValidity());
    expect(isInvalid).toBe(true);
  });
});
