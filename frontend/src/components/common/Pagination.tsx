import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
  testIdPrefix?: string;
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  itemLabel = "itens",
  testIdPrefix = "pagination",
  className = "",
}) => {
  if (totalItems <= 0) return null;

  const safeCurrentPage = Math.max(1, Math.min(currentPage, totalPages || 1));
  const startItem = totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, totalItems);

  return (
    <div
      data-testid={`${testIdPrefix}-container`}
      className={`px-4 py-3 border-t border-obsidian-800 bg-obsidian-950/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-slate-400 select-none ${className}`}
    >
      <div className="flex items-center gap-2">
        <span>
          Mostrando <strong className="text-white font-semibold">{startItem}</strong> a{" "}
          <strong className="text-white font-semibold">{endItem}</strong> de{" "}
          <strong className="text-white font-semibold">{totalItems}</strong> {itemLabel}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500 hidden md:inline">Exibir:</span>
            <select
              aria-label={`Quantidade de ${itemLabel} por página`}
              data-testid={`${testIdPrefix}-page-size-select`}
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="bg-obsidian-900 border border-obsidian-800 rounded-lg px-2 py-1 text-slate-300 text-xs focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} / pág
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid={`${testIdPrefix}-prev`}
            disabled={safeCurrentPage <= 1}
            onClick={() => onPageChange(safeCurrentPage - 1)}
            aria-label="Página anterior"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-obsidian-900 border border-obsidian-800 text-slate-300 hover:text-white hover:bg-obsidian-850 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={14} aria-hidden="true" />
            <span className="hidden sm:inline">Anterior</span>
          </button>

          <span className="px-1 text-slate-300">
            Página <strong className="text-white font-bold">{safeCurrentPage}</strong> de{" "}
            <strong className="text-white font-bold">{totalPages || 1}</strong>
          </span>

          <button
            type="button"
            data-testid={`${testIdPrefix}-next`}
            disabled={safeCurrentPage >= totalPages}
            onClick={() => onPageChange(safeCurrentPage + 1)}
            aria-label="Próxima página"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-obsidian-900 border border-obsidian-800 text-slate-300 hover:text-white hover:bg-obsidian-850 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <span className="hidden sm:inline">Próxima</span>
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};
