import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { NotificationCenter } from "../src/components/notifications/NotificationCenter";
import { Header } from "../src/components/layout/Header";
import { notificationsApi } from "../src/services/notificationsApi";
import type { ClientNotification } from "../src/types/clientPortal";

const mockNotifications: ClientNotification[] = [
  {
    id: "notif-1",
    title: "Manutenção Emergencial Fibra Óptica",
    summary: "Roteador RT-EDGE-01 passará por intervenção preventiva.",
    timestampWat: "09:30 WAT",
    impactSlaFormatted: "0m (Isento)",
    isRead: false,
    type: "maintenance",
    severity: "warning",
  },
  {
    id: "notif-2",
    title: "Serviço Normalizado",
    summary: "API-GATEWAY restabeleceu conectividade com latência nominal.",
    timestampWat: "08:15 WAT",
    impactSlaFormatted: "12m",
    isRead: true,
    type: "resolved",
    severity: "success",
  },
];

vi.mock("../src/services/notificationsApi", () => ({
  notificationsApi: {
    listNotifications: vi.fn(),
    getUnreadCount: vi.fn(),
    markAllAsRead: vi.fn(),
    syncSince: vi.fn(),
  },
}));

vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u-1", name: "Daniel Ndonda", role: "SUPER_ADMIN" },
    logout: vi.fn(),
  }),
}));

describe("Central de Notificações & Header SSE (Issue #357)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (notificationsApi.listNotifications as any).mockResolvedValue(mockNotifications);
    (notificationsApi.markAllAsRead as any).mockResolvedValue({ success: true, unreadCount: 0 });
    (notificationsApi.syncSince as any).mockResolvedValue([]);
  });

  describe("Componente NotificationCenter", () => {
    it("deve renderizar o botão de sino com badge de não lidas e atributos de acessibilidade", () => {
      render(
        <NotificationCenter
          notifications={mockNotifications}
          unreadCount={1}
          onMarkAllAsRead={vi.fn()}
        />
      );

      const bellBtn = screen.getByTestId("notification-bell-btn");
      expect(bellBtn).toBeInTheDocument();
      expect(bellBtn).toHaveAttribute("aria-expanded", "false");

      const badge = screen.getByTestId("notification-unread-badge");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent("1");
    });

    it("deve abrir o popover com a lista de comunicados ao clicar no sino", () => {
      render(
        <NotificationCenter
          notifications={mockNotifications}
          unreadCount={1}
          onMarkAllAsRead={vi.fn()}
        />
      );

      const bellBtn = screen.getByTestId("notification-bell-btn");
      fireEvent.click(bellBtn);

      expect(bellBtn).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByTestId("notification-popover")).toBeInTheDocument();
      expect(screen.getByText("Comunicados Técnicos")).toBeInTheDocument();
      expect(screen.getByText("Manutenção Emergencial Fibra Óptica")).toBeInTheDocument();
      expect(screen.getByText("Serviço Normalizado")).toBeInTheDocument();
    });

    it("deve fechar o popover ao pressionar a tecla Escape", () => {
      render(
        <NotificationCenter
          notifications={mockNotifications}
          unreadCount={1}
          onMarkAllAsRead={vi.fn()}
        />
      );

      const bellBtn = screen.getByTestId("notification-bell-btn");
      fireEvent.click(bellBtn);
      expect(screen.getByTestId("notification-popover")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByTestId("notification-popover")).not.toBeInTheDocument();
    });

    it("deve acionar onMarkAllAsRead ao clicar no botão marcar todas como lidas", () => {
      const handleMarkAll = vi.fn();
      render(
        <NotificationCenter
          notifications={mockNotifications}
          unreadCount={1}
          onMarkAllAsRead={handleMarkAll}
        />
      );

      fireEvent.click(screen.getByTestId("notification-bell-btn"));
      const markAllBtn = screen.getByTestId("mark-all-read-btn");
      fireEvent.click(markAllBtn);

      expect(handleMarkAll).toHaveBeenCalledTimes(1);
    });
  });

  describe("Integração do Header com Notificações", () => {
    it("deve carregar notificações iniciais da API e exibir badge no Header", async () => {
      render(
        <BrowserRouter>
          <Header />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(notificationsApi.listNotifications).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        expect(screen.getByTestId("notification-unread-badge")).toHaveTextContent("1");
      });
    });

    it("deve permitir marcar todas as notificações como lidas no Header", async () => {
      render(
        <BrowserRouter>
          <Header />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId("notification-unread-badge")).toBeInTheDocument();
      });

      // Abrir popover
      fireEvent.click(screen.getByTestId("notification-bell-btn"));

      const markAllBtn = await screen.findByTestId("mark-all-read-btn");
      fireEvent.click(markAllBtn);

      await waitFor(() => {
        expect(notificationsApi.markAllAsRead).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        expect(screen.queryByTestId("notification-unread-badge")).not.toBeInTheDocument();
      });
    });
  });
});
