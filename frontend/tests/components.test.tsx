import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../src/components/ui/Button";
import { Badge } from "../src/components/ui/Badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "../src/components/ui/Card";
import { Skeleton } from "../src/components/ui/Skeleton";
import { Modal } from "../src/components/ui/Modal";

describe("Obsidian Telemetry — Design System Components", () => {
  describe("Button Component", () => {
    it("deve renderizar o texto do botão corretamente", () => {
      render(<Button>Reconhecer Alerta</Button>);
      expect(screen.getByRole("button", { name: /reconhecer alerta/i })).toBeInTheDocument();
    });

    it("deve acionar o manipulador de clique onClick", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Ação NOC</Button>);

      await user.click(screen.getByRole("button", { name: /ação noc/i }));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("deve respeitar a propriedade disabled", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(
        <Button disabled onClick={handleClick}>
          Desabilitado
        </Button>
      );

      const btn = screen.getByRole("button", { name: /desabilitado/i });
      expect(btn).toBeDisabled();

      await user.click(btn);
      expect(handleClick).not.toHaveBeenCalled();
    });

    it("deve exibir indicador de carregamento e desabilitar botão quando isLoading=true", () => {
      render(<Button isLoading>Processando</Button>);
      const btn = screen.getByRole("button");
      expect(btn).toBeDisabled();
      expect(btn.querySelector(".animate-spin")).toBeInTheDocument();
    });

    it("deve renderizar variantes com propriedades adequadas", () => {
      const { rerender } = render(<Button variant="destructive">Excluir</Button>);
      expect(screen.getByRole("button")).toHaveStyle({
        color: "var(--color-critical)",
      });

      rerender(<Button variant="primary">Confirmar</Button>);
      expect(screen.getByRole("button")).toHaveStyle({
        backgroundColor: "var(--color-primary)",
      });
    });
  });

  describe("Badge Component", () => {
    it("deve renderizar o rótulo do badge e o ponto de status (dot)", () => {
      render(<Badge variant="healthy">UP / HEALTHY</Badge>);
      expect(screen.getByText("UP / HEALTHY")).toBeInTheDocument();
      expect(screen.getByTestId("badge-dot")).toBeInTheDocument();
    });

    it("deve ocultar o ponto quando dot=false", () => {
      render(
        <Badge variant="maintenance" dot={false}>
          PROGRAMADO
        </Badge>
      );
      expect(screen.queryByTestId("badge-dot")).not.toBeInTheDocument();
    });

    it("deve aplicar classe de animação pulse quando pulse=true", () => {
      render(
        <Badge variant="critical" pulse>
          DOWN
        </Badge>
      );
      const dot = screen.getByTestId("badge-dot");
      expect(dot).toHaveClass("pulse-indicator");
    });

    it("deve aplicar as cores da variante semântica", () => {
      const { container } = render(<Badge variant="degraded">WARNING</Badge>);
      const badge = container.firstChild as HTMLElement;
      expect(badge).toHaveStyle({
        color: "var(--color-degraded)",
      });
    });
  });

  describe("Card Component", () => {
    it("deve compor containers estruturados com cabeçalho, conteúdo e rodapé", () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Roteador BGP</CardTitle>
            <CardDescription>Gateway Principal</CardDescription>
          </CardHeader>
          <CardContent>
            <span>Latência: 12ms</span>
          </CardContent>
          <CardFooter>
            <button>Ação</button>
          </CardFooter>
        </Card>
      );

      expect(screen.getByText("Roteador BGP")).toBeInTheDocument();
      expect(screen.getByText("Gateway Principal")).toBeInTheDocument();
      expect(screen.getByText("Latência: 12ms")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Ação" })).toBeInTheDocument();
    });

    it("deve suportar variante elevada (elevated)", () => {
      const { container } = render(<Card elevated>Conteúdo</Card>);
      expect(container.firstChild).toHaveStyle({
        backgroundColor: "var(--color-surface-elevated)",
      });
    });
  });

  describe("Skeleton Component", () => {
    it("deve renderizar com a classe shimmer-effect", () => {
      render(<Skeleton width="200px" height="30px" />);
      const skeleton = screen.getByTestId("skeleton");
      expect(skeleton).toHaveClass("shimmer-effect");
      expect(skeleton).toHaveStyle({
        width: "200px",
        height: "30px",
      });
    });

    it("deve renderizar formato circular quando circle=true", () => {
      render(<Skeleton circle height="40px" width="40px" />);
      const skeleton = screen.getByTestId("skeleton");
      expect(skeleton).toHaveStyle({
        borderRadius: "50%",
      });
    });
  });

  describe("Modal Component", () => {
    it("não deve renderizar quando isOpen=false", () => {
      render(
        <Modal isOpen={false} onClose={() => {}}>
          Corpo do Modal
        </Modal>
      );
      expect(screen.queryByTestId("modal-container")).not.toBeInTheDocument();
    });

    it("deve renderizar título, corpo e rodapé quando isOpen=true", () => {
      render(
        <Modal
          isOpen={true}
          onClose={() => {}}
          title="Confirmar Reinicialização"
          description="Ação crítica de rede"
          footer={<button>Confirmar</button>}
        >
          <span>Deseja reiniciar a porta 22?</span>
        </Modal>
      );

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Confirmar Reinicialização")).toBeInTheDocument();
      expect(screen.getByText("Ação crítica de rede")).toBeInTheDocument();
      expect(screen.getByText("Deseja reiniciar a porta 22?")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Confirmar" })).toBeInTheDocument();
    });

    it("deve acionar onClose ao clicar no botão de fechar ou no overlay", () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose} title="Janela de Manutenção">
          Conteúdo
        </Modal>
      );

      fireEvent.click(screen.getByTestId("modal-close-button"));
      expect(handleClose).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId("modal-overlay"));
      expect(handleClose).toHaveBeenCalledTimes(2);
    });

    it("deve acionar onClose ao pressionar tecla Escape", () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose}>
          Conteúdo
        </Modal>
      );

      fireEvent.keyDown(window, { key: "Escape" });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });
});
