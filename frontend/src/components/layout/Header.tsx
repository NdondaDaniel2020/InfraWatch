import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, Menu, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../context/AuthContext";
import { useTelemetry } from "../../context/TelemetryContext";
import { NotificationCenter } from "../notifications/NotificationCenter";
import { notificationsApi } from "../../services/notificationsApi";
import type { ClientNotification } from "../../types/clientPortal";

import type { StatusTickerData } from "../../types/telemetry";

export type { StatusTickerData };

export interface HeaderProps {
  onToggleSidebar?: () => void;
  onOpenSearch?: () => void;
  ticker?: StatusTickerData;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  onOpenSearch,
}) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { isConnected, isReconnecting, subscribeToEvent } = useTelemetry();
  const [utcTime, setUtcTime] = useState<string>("");
  const [notifications, setNotifications] = useState<ClientNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const wasReconnectingRef = useRef(false);

  useEffect(() => {
    // Carrega contagem inicial de notificações não lidas
    notificationsApi
      .listNotifications()
      .then((items) => {
        if (items && items.length > 0) {
          setNotifications(items);
          setUnreadCount(items.filter((n) => !n.isRead).length);
        }
      })
      .catch((err) => {
        console.error("Falha ao consultar notificações:", err);
      });
  }, []);

  // Escuta eventos ao vivo emitidos pelo stream SSE
  useEffect(() => {
    const handleIncomingNotification = (
      title: string,
      summary: string,
      type: "advisory" | "maintenance" | "resolved",
      severity: "info" | "warning" | "success",
      id?: string
    ) => {
      const nowWat =
        new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }) + " WAT";

      const newNotif: ClientNotification = {
        id: id || `sse-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        summary,
        timestampWat: nowWat,
        impactSlaFormatted: "0m",
        isRead: false,
        type,
        severity,
      };

      setNotifications((prev) => [newNotif, ...prev.filter((n) => n.id !== newNotif.id)]);
      setUnreadCount((prev) => prev + 1);

      // Feedback visual imediato via Toast
      if (severity === "warning") {
        toast.warning(title, { description: summary });
      } else if (severity === "success") {
        toast.success(title, { description: summary });
      } else {
        toast.info(title, { description: summary });
      }
    };

    const unsubNotification = subscribeToEvent("NotificationCreated", (payload) => {
      handleIncomingNotification(
        (payload.title as string) || "Novo Comunicado Técnico",
        (payload.message as string) || "Atualização operacional registrada no NOC.",
        payload.type === "maintenance" ? "maintenance" : "advisory",
        payload.severity === "warning" ? "warning" : "info",
        (payload.id as string) || (payload.notification_id as string)
      );
    });

    const unsubAlarm = subscribeToEvent("AlarmTriggered", (payload) => {
      handleIncomingNotification(
        `Alarme: ${(payload.title as string) || (payload.device_name as string) || "Dispositivo Degradado"}`,
        (payload.message as string) || (payload.description as string) || "Falha detectada pelo motor de sondagem.",
        "advisory",
        "warning",
        (payload.event_id as string) || (payload.incident_id as string)
      );
    });

    const unsubIncident = subscribeToEvent("IncidentCreated", (payload) => {
      handleIncomingNotification(
        `Incidente Aberto: ${(payload.title as string) || "Falha Crítica"}`,
        (payload.message as string) || (payload.description as string) || "Incidente prioritário sob investigação do NOC.",
        "advisory",
        "warning",
        payload.incident_id as string
      );
    });

    const unsubResolved = subscribeToEvent("IncidentResolved", (payload) => {
      handleIncomingNotification(
        `Incidente Resolvido: ${(payload.title as string) || "Serviço Normalizado"}`,
        (payload.message as string) || "O dispositivo retornou ao estado nominal de operação.",
        "resolved",
        "success",
        payload.incident_id as string
      );
    });

    const unsubMaintenance = subscribeToEvent("MaintenanceWindowApproved", (payload) => {
      handleIncomingNotification(
        `Janela RFC Aprovada: ${(payload.code as string) || (payload.title as string) || "Manutenção"}`,
        (payload.message as string) || "Janela de manutenção homologada para isenção de SLA.",
        "maintenance",
        "info",
        payload.maintenance_id as string
      );
    });

    return () => {
      unsubNotification();
      unsubAlarm();
      unsubIncident();
      unsubResolved();
      unsubMaintenance();
    };
  }, [subscribeToEvent]);

  // Sincronização Catch-Up pós-reconexão do stream SSE
  useEffect(() => {
    if (isReconnecting) {
      wasReconnectingRef.current = true;
    } else if (isConnected && wasReconnectingRef.current) {
      wasReconnectingRef.current = false;
      const latestId = notifications[0]?.id;
      notificationsApi
        .syncSince(latestId)
        .then((missedItems) => {
          if (missedItems && missedItems.length > 0) {
            setNotifications((prev) => {
              const existingIds = new Set(prev.map((n) => n.id));
              const newItems = missedItems.filter((item) => !existingIds.has(item.id));
              if (newItems.length === 0) return prev;
              setUnreadCount((c) => c + newItems.filter((i) => !i.isRead).length);
              toast.info(`${newItems.length} comunicado(s) sincronizado(s).`);
              return [...newItems, ...prev];
            });
          }
        })
        .catch((err) => {
          console.error("Falha na sincronização Catch-Up de notificações:", err);
        });
    }
  }, [isConnected, isReconnecting, notifications]);

  const handleMarkAllNotificationsRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Falha ao marcar notificações como lidas:", err);
    }
  };

  useEffect(() => {
    const updateUtc = () => {
      const now = new Date();
      const hours = String(now.getUTCHours()).padStart(2, "0");
      const minutes = String(now.getUTCMinutes()).padStart(2, "0");
      const seconds = String(now.getUTCSeconds()).padStart(2, "0");
      setUtcTime(`${hours}:${minutes}:${seconds} UTC`);
    };

    updateUtc();
    const interval = setInterval(updateUtc, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate("/login");
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return "DN";
    const parts = name.trim().split(" ");
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const isOperator =
    user?.role === "SUPER_ADMIN" || user?.role === "NOC_OPERATOR";

  return (
    <header
      data-testid="app-header"
      className="w-full px-4 sm:px-6 h-14 flex items-center justify-between border-b border-obsidian-800/80 sticky top-0 z-50 bg-obsidian-950/95 backdrop-blur-md shrink-0"
    >
      {/* Esquerda: Marca e Identidade do NOC */}
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button
            type="button"
            id="btn-sidebar-toggle"
            data-testid="toggle-sidebar-button"
            onClick={onToggleSidebar}
            className="lg:hidden p-1.5 rounded-lg bg-obsidian-900 border border-obsidian-800 text-slate-400 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 cursor-pointer"
            aria-label="Abrir menu de navegação lateral"
          >
            <Menu size={18} />
          </button>
        )}

        <Link
          to="/"
          className="flex items-center gap-2.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-lg no-underline"
        >
          <div className="w-8 h-8 rounded-xl bg-obsidian-900 border border-obsidian-800 flex items-center justify-center p-1.5 shadow-sm group-hover:border-obsidian-700 transition-colors">
            <svg className="w-full h-full shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <polygon points="12,3 20,7.5 12,12 4,7.5" fill="#ffffff" stroke="#111827" strokeWidth="1.8" strokeLinejoin="round" />
              <polygon points="4,7.5 12,12 12,21 4,16.5" fill="var(--brand-primary, #eab308)" stroke="#ca8a04" strokeWidth="1.8" strokeLinejoin="round" />
              <polygon points="12,12 20,7.5 20,16.5 12,21" fill="#111827" stroke="#374151" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="font-display font-bold text-lg tracking-tight text-white group-hover:text-amber-400 transition-colors">
            InfraWatch
          </span>
        </Link>
      </div>

      {/* Direita: Busca Global, UTC e Perfil */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="header-search-button"
          onClick={onOpenSearch}
          className="relative hidden md:flex items-center h-9 cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 rounded-full group"
          aria-label="Abrir busca global de ativos (Ctrl + K)"
        >
          <Search
            size={16}
            className="absolute left-3 text-slate-400 group-hover:text-slate-200 transition-colors pointer-events-none"
          />
          <span className="w-56 xl:w-72 h-9 pl-9 pr-14 bg-obsidian-900 border border-obsidian-800 rounded-full text-xs font-sans text-slate-400 flex items-center whitespace-nowrap group-hover:border-obsidian-700 group-hover:text-slate-300 transition-colors shadow-inner">
            Pesquisar ativos, IPs, tags…
          </span>
          <kbd className="absolute right-2.5 px-1.5 py-0.5 rounded bg-obsidian-850 border border-obsidian-800 text-[10px] font-mono text-slate-400 pointer-events-none">
            Ctrl K
          </kbd>
        </button>

        {/* Relógio UTC (Exclusivo Operadores) */}
        {isOperator && (
          <time
            data-testid="utc-clock"
            dateTime={new Date().toISOString()}
            className="hidden sm:inline-block font-mono text-[11px] text-slate-400 px-2.5 py-1 rounded-md bg-obsidian-900 border border-obsidian-800"
            title="Relógio Oficial UTC do Barramento"
          >
            {utcTime || "--:--:-- UTC"}
          </time>
        )}


        {/* Central de Notificações Global In-App */}
        <NotificationCenter
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkAllAsRead={handleMarkAllNotificationsRead}
        />

        {/* Perfil do Usuário / Operador */}
        <div className="flex items-center gap-2.5 pl-3 border-l border-obsidian-800">
          <div
            data-testid="user-avatar"
            className="w-8 h-8 rounded-full bg-obsidian-850 border border-obsidian-700 flex items-center justify-center font-mono tabular-nums font-bold text-xs text-emerald-400"
            title={`${user?.name || "Daniel Ndonda"} (${user?.role || "NOC Lead"})`}
          >
            {user?.initials || getInitials(user?.name)}
          </div>
          <div className="hidden 2xl:flex flex-col text-left">
            <span className="text-xs font-medium text-slate-200 leading-tight">
              {user?.name || "Daniel Ndonda"}
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              {user?.role || "NOC Lead"}
            </span>
          </div>
          {user && (
            <button
              type="button"
              onClick={handleLogout}
              data-testid="logout-button"
              title="Encerrar Sessão"
              aria-label="Encerrar Sessão"
              className="text-slate-400 hover:text-rose-400 p-1 transition-colors cursor-pointer"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
