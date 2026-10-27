import React, { useEffect, useRef, useState } from "react";
import { Bell, Check, CheckCheck, Info, Wrench, X } from "lucide-react";
import type { ClientNotification } from "../../mocks/clientPortalMocks";

export interface NotificationCenterProps {
  notifications: ClientNotification[];
  unreadCount: number;
  onMarkAllAsRead?: () => void;
  onSelectNotification?: (notification: ClientNotification) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  notifications,
  unreadCount,
  onMarkAllAsRead,
  onSelectNotification,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fecha com ESC e clique fora
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      {/* Botão de Sino com Badge */}
      <button
        type="button"
        data-testid="notification-bell-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={`Central de Notificações, ${unreadCount} não lidas`}
        className="relative p-2 rounded-xl bg-obsidian-900 hover:bg-obsidian-850 border border-obsidian-800 text-slate-300 hover:text-white transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-400"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span
            data-testid="notification-unread-badge"
            aria-live="polite"
            className="absolute -top-1 -right-1 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-mono font-bold text-white shadow-md animate-pulse"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Popover / Modal de Notificações */}
      {isOpen && (
        <>
          {/* Backdrop escurecido em telas mobile/pequenas */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] sm:hidden"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          <aside
            data-testid="notification-popover"
            role="dialog"
            aria-label="Notificações e Comunicados do NOC"
            className="fixed inset-x-3 top-16 sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 w-auto sm:w-[380px] md:w-[420px] max-w-[calc(100vw-1.5rem)] rounded-2xl bg-obsidian-950/98 sm:bg-obsidian-950 border border-obsidian-800 p-4 shadow-2xl z-[100] flex flex-col gap-3 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b border-obsidian-800/80 pb-3 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-bold text-white truncate">Comunicados Técnicos</span>
                {unreadCount > 0 && (
                  <span className="shrink-0 px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[10px] font-mono font-bold">
                    {unreadCount} não lidos
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    data-testid="mark-all-read-btn"
                    onClick={() => {
                      onMarkAllAsRead?.();
                    }}
                    className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                  >
                    <CheckCheck size={14} />
                    <span className="hidden xs:inline">Marcar lidas</span>
                  </button>
                )}

                <button
                  type="button"
                  data-testid="close-notification-popover"
                  onClick={() => setIsOpen(false)}
                  aria-label="Fechar notificações"
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-obsidian-850 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

          {/* Lista de Notificações */}
          <div className="flex flex-col gap-2.5 max-h-[360px] overflow-y-auto pr-1">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Nenhum comunicado no momento.
              </div>
            ) : (
              notifications.map((notif) => {
                const isResolved = notif.type === "resolved";
                const isMaintenance = notif.type === "maintenance";

                return (
                  <div
                    key={notif.id}
                    data-testid={`notification-item-${notif.id}`}
                    onClick={() => onSelectNotification?.(notif)}
                    className={`p-3 rounded-xl border flex flex-col gap-1.5 transition-colors cursor-pointer ${
                      notif.isRead
                        ? "bg-obsidian-900/60 border-obsidian-800/60 opacity-75 hover:opacity-100"
                        : "bg-obsidian-900 border-obsidian-800 hover:border-emerald-500/40"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-semibold text-[10px] ${
                          isResolved
                            ? "bg-emerald-500/10 text-emerald-400"
                            : isMaintenance
                            ? "bg-sky-500/10 text-sky-400"
                            : "bg-amber-500/10 text-amber-400"
                        }`}
                      >
                        {isResolved ? (
                          <Check size={11} />
                        ) : isMaintenance ? (
                          <Wrench size={11} />
                        ) : (
                          <Info size={11} />
                        )}
                        <span>{notif.type.toUpperCase()}</span>
                      </span>
                      <span className="text-slate-400">{notif.timestampWat}</span>
                    </div>

                    <h5 className="text-xs font-bold text-white m-0 leading-snug">
                      {notif.title}
                    </h5>

                    <p className="text-[11px] text-slate-300 m-0 leading-relaxed">
                      {notif.summary}
                    </p>

                    <div className="flex justify-between items-center text-[10px] font-mono pt-1 border-t border-obsidian-800/80 text-slate-400">
                      <span>Impacto SLA:</span>
                      <span className="font-semibold text-emerald-400">
                        {notif.impactSlaFormatted}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </>
    )}
    </div>
  );
};
