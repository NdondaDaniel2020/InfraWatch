import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { cn } from "../../src/lib/utils";
import { Input } from "../../src/components/ui/input";
import { Button, buttonVariants } from "../../src/components/ui/Button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "../../src/components/ui/dialog";
import { Toaster, toast } from "../../src/components/ui/sonner";

describe("Accessible UI Primitives & Design System (Issue #279)", () => {
  describe("1. Utility: cn (clsx + tailwind-merge)", () => {
    it("deve combinar classes simples e condicionais", () => {
      const result = cn("btn", true && "btn-active", false && "btn-hidden");
      expect(result).toBe("btn btn-active");
    });

    it("deve resolver conflitos de especificidade Tailwind mantendo a última classe", () => {
      const result = cn("p-2 text-slate-100", "p-4");
      expect(result).toContain("p-4");
      expect(result).not.toContain("p-2");
    });

    it("deve ignorar valores falsy, null e undefined", () => {
      expect(cn("px-4", null, undefined, false, "py-2")).toBe("px-4 py-2");
    });
  });

  describe("2. Primitive: Input", () => {
    it("deve renderizar o input com estilos base e atributos HTML", () => {
      render(
        <Input
          placeholder="Digite o IP do ativo"
          defaultValue="192.168.1.1"
          data-testid="test-input"
        />
      );

      const input = screen.getByTestId("test-input") as HTMLInputElement;
      expect(input).toBeInTheDocument();
      expect(input.value).toBe("192.168.1.1");
      expect(input).toHaveAttribute("placeholder", "Digite o IP do ativo");
    });

    it("deve marcar aria-invalid e aplicar borda vermelha quando error=true", () => {
      render(<Input error placeholder="IP Inválido" data-testid="error-input" />);
      const input = screen.getByTestId("error-input");
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input.className).toContain("border-rose-500");
    });

    it("deve respeitar a propriedade disabled", () => {
      render(<Input disabled placeholder="Bloqueado" data-testid="disabled-input" />);
      const input = screen.getByTestId("disabled-input");
      expect(input).toBeDisabled();
    });
  });

  describe("3. Primitive: Button & buttonVariants", () => {
    it("deve gerar classes semânticas com buttonVariants", () => {
      const primaryClasses = buttonVariants({ variant: "primary", size: "sm" });
      expect(primaryClasses).toContain("bg-sky-500");
      expect(primaryClasses).toContain("text-xs");

      const destructiveClasses = buttonVariants({ variant: "destructive", size: "lg" });
      expect(destructiveClasses).toContain("text-rose-400");
      expect(destructiveClasses).toContain("text-base");
    });

    it("deve renderizar botão acessível e disparar evento onClick", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Salvar Ativo</Button>);

      const btn = screen.getByRole("button", { name: /salvar ativo/i });
      expect(btn).toBeInTheDocument();

      await user.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("4. Primitive: Dialog (Radix UI WAI-ARIA)", () => {
    it("deve abrir o modal ao clicar no trigger e exibir título e descrição", async () => {
      const user = userEvent.setup();
      render(
        <Dialog>
          <DialogTrigger asChild>
            <Button>Abrir Configuração</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Configuração de Ativo</DialogTitle>
              <DialogDescription>
                Ajuste os parâmetros de telemetria e polling do dispositivo.
              </DialogDescription>
            </DialogHeader>
            <div>Conteúdo do formulário</div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Fechar</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );

      expect(screen.queryByText("Configuração de Ativo")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /abrir configuração/i }));

      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Configuração de Ativo")).toBeInTheDocument();
      expect(
        screen.getByText("Ajuste os parâmetros de telemetria e polling do dispositivo.")
      ).toBeInTheDocument();
    });

    it("deve fechar o modal ao clicar no botão de fechar", async () => {
      const user = userEvent.setup();
      render(
        <Dialog defaultOpen>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Modal de Teste</DialogTitle>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button>Concluir</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );

      expect(screen.getByText("Modal de Teste")).toBeInTheDocument();

      const closeButton = screen.getByRole("button", { name: /fechar/i });
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText("Modal de Teste")).not.toBeInTheDocument();
      });
    });
  });

  describe("5. Notifications: Sonner Toaster", () => {
    it("deve renderizar o container do Toaster e exibir toasts de sucesso", async () => {
      const user = userEvent.setup();
      render(
        <div>
          <Toaster />
          <Button onClick={() => toast.success("Dispositivo salvo com sucesso!")}>
            Disparar Toast
          </Button>
        </div>
      );

      const triggerBtn = screen.getByRole("button", { name: /disparar toast/i });
      await user.click(triggerBtn);

      expect(
        await screen.findByText("Dispositivo salvo com sucesso!")
      ).toBeInTheDocument();
    });

    it("deve exibir toasts de erro corretamente", async () => {
      const user = userEvent.setup();
      render(
        <div>
          <Toaster />
          <Button onClick={() => toast.error("Falha na comunicação com o backend")}>
            Disparar Erro
          </Button>
        </div>
      );

      await user.click(screen.getByRole("button", { name: /disparar erro/i }));

      expect(
        await screen.findByText("Falha na comunicação com o backend")
      ).toBeInTheDocument();
    });
  });
});
