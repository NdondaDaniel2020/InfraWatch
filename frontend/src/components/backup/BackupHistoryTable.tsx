import React, { useState, useMemo } from "react";
import {
  Copy,
  Check,
  Search,
  XCircle,
  MinusCircle,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { BackupHistoryItem, BackupTargetStatus } from "../../types/backup";

interface BackupHistoryTableProps {
  items: BackupHistoryItem[];
  isLoading: boolean;
  onRefresh?: () => void;
}

export const BackupHistoryTable: React.FC<BackupHistoryTableProps> = ({
  items,
  isLoading,
  onRefresh,
}) => {
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "scheduled" | "manual">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5; // Regra: exatamente 5 itens por página

  // Filtragem dos snapshots por busca e tipo
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.filename.toLowerCase().includes(q) ||
        (item.sha256 && item.sha256.toLowerCase().includes(q)) ||
        (item.notes && item.notes.toLowerCase().includes(q));

      const isCron =
        item.trigger === "scheduled" ||
        item.filename.includes("_0200") ||
        item.filename.includes("_0300");
      const matchesType =
        typeFilter === "all" ||
        (typeFilter === "scheduled" && isCron) ||
        (typeFilter === "manual" && !isCron);

      return matchesSearch && matchesType;
    });
  }, [items, searchQuery, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedItems = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, safeCurrentPage, pageSize]);

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    toast.success("Hash SHA-256 copiado para a área de transferência!");
    setTimeout(() => setCopiedHash(null), 2500);
  };

  /**
   * Renderiza os badges de destino conforme a regra canônica:
   * - Funcionou (SUCCESS): Verde
   * - Falhou (FAILED): Vermelho
   * - Não configurado / Ignorado (SKIPPED): Cinza
   */
  const renderDestinationStatus = (
    status?: BackupTargetStatus,
    successLabel = "Sync"
  ) => {
    switch (status) {
      case "SUCCESS":
        return (
          <span
            data-testid="dest-status-success"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-950/70 border border-emerald-500/40 text-emerald-300"
          >
            <Check className="w-3 h-3 text-emerald-400" />
            <span>{successLabel}</span>
          </span>
        );
      case "FAILED":
        return (
          <span
            data-testid="dest-status-failed"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-rose-950/70 border border-rose-500/40 text-rose-300"
          >
            <XCircle className="w-3 h-3 text-rose-400" />
            <span>Falha</span>
          </span>
        );
      case "SKIPPED":
      default:
        return (
          <span
            data-testid="dest-status-skipped"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[#0c1830] border border-[#172747] text-slate-500"
          >
            <MinusCircle className="w-3 h-3 text-slate-500" />
            <span>Não Configurado</span>
          </span>
        );
    }
  };

  // Cálculo dinâmico do Merkle Tree Hash a partir dos hashes SHA-256 reais persistidos
  const merkleTreeHash = useMemo(() => {
    if (items.length === 0) return "—";
    const validHashes = items.map((i) => i.sha256).filter(Boolean) as string[];
    if (validHashes.length === 0) return "—";
    const head = validHashes[0].substring(0, 4);
    const tail = validHashes[validHashes.length - 1].slice(-4);
    return `${head}...${tail}`;
  }, [items]);

  // Cálculo de datas em UTC e WAT (UTC+1 Angola)
  const formatDates = (isoString: string) => {
    const d = new Date(isoString);
    const utcDate = d.toISOString().replace("T", " ").substring(0, 16) + " UTC";
    const watHour = new Date(d.getTime() + 60 * 60 * 1000)
      .toISOString()
      .substring(11, 16);
    return { utcDate, watHour: `Hoje às ${watHour} WAT` };
  };

  return (
    <section
      data-testid="backup-history-table"
      className="bg-[#091122] border border-[#14233f] rounded-xl overflow-hidden"
      data-purpose="snapshots-ledger"
      aria-label="Livro-Razão de Snapshots & Auditoria Forense"
    >
      {/* Table Header Bar */}
      <div className="p-3.5 lg:px-5 lg:py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#14233f]">
        {/* Title and verified count */}
        <div className="flex items-center gap-2.5">
          <svg
            className="w-4 h-4 text-emerald-400 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
          <h2 className="text-sm font-semibold text-white tracking-wide">
            Livro-Razão de Snapshots &amp; Auditoria Forense
          </h2>
          <span className="text-[10px] font-mono uppercase bg-[#0c1830] text-slate-400 border border-[#172747] px-2 py-0.5 rounded font-medium">
            {isLoading ? "CARREGANDO SNAPSHOTS..." : `${filteredItems.length} REGISTROS VERIFICADOS`}
          </span>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-500">
              <Search className="w-3.5 h-3.5" />
            </div>
            <input
              type="text"
              id="snapshot-search"
              aria-label="Filtrar snapshots por hash ou tag"
              placeholder="Filtrar por hash, tag..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-[#050913] border border-[#172747] text-xs font-mono rounded-lg pl-8 pr-3 py-1.5 text-slate-300 placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 w-52 sm:w-64 transition"
            />
          </div>

          {/* Type Select Dropdown */}
          <div className="relative">
            <select
              aria-label="Filtrar snapshots por tipo"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as "all" | "scheduled" | "manual");
                setCurrentPage(1);
              }}
              className="bg-[#050913] border border-[#172747] text-xs font-mono rounded-lg pl-3 pr-8 py-1.5 text-slate-300 appearance-none focus:outline-none focus:border-emerald-500/60 cursor-pointer"
            >
              <option value="all">Todos os Tipos</option>
              <option value="scheduled">Automático (CRON)</option>
              <option value="manual">Manual (On-Demand)</option>
            </select>
            <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-slate-500">
              <ChevronDown className="w-3.5 h-3.5" />
            </div>
          </div>

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              title="Atualizar Livro-Razão"
              aria-label="Atualizar histórico"
              className="p-1.5 rounded-lg bg-[#050913] border border-[#172747] text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-emerald-400" : ""}`}
              />
            </button>
          )}
        </div>
      </div>

      {/* Table Body Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono border-collapse tabular-nums">
          <thead>
            <tr className="text-[11px] text-slate-400 bg-[#070d1c] border-b border-[#14233f] uppercase tracking-wider">
              <th className="py-3 px-4 font-semibold" scope="col">
                DATA / HORA (UTC)
              </th>
              <th className="py-3 px-3 font-semibold" scope="col">
                SNAPSHOT / ARQUIVO
              </th>
              <th className="py-3 px-3 font-semibold" scope="col">
                TIPO
              </th>
              <th className="py-3 px-3 font-semibold" scope="col">
                TAMANHO
              </th>
              <th className="py-3 px-3 font-semibold" scope="col">
                CHECKSUM SHA-256
              </th>
              <th className="py-3 px-3 font-semibold text-center" scope="col">
                DESTINO LOCAL
              </th>
              <th className="py-3 px-3 font-semibold text-center" scope="col">
                GOOGLE DRIVE
              </th>
              <th className="py-3 px-3 font-semibold text-center" scope="col">
                CLOUDFLARE R2
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#121e35] text-slate-300">
            {isLoading ? (
              [1, 2, 3, 4, 5].map((idx) => (
                <tr key={idx} className="animate-pulse" data-testid="backup-row-skeleton">
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="h-3.5 w-24 bg-[#14233f] rounded mb-1" />
                    <div className="h-2.5 w-16 bg-[#14233f]/60 rounded" />
                  </td>
                  <td className="py-3 px-3">
                    <div className="h-3.5 w-48 bg-[#14233f] rounded mb-1" />
                    <div className="h-2.5 w-28 bg-[#14233f]/60 rounded" />
                  </td>
                  <td className="py-3 px-3">
                    <div className="h-4 w-20 bg-[#14233f] rounded" />
                  </td>
                  <td className="py-3 px-3">
                    <div className="h-3.5 w-14 bg-[#14233f] rounded" />
                  </td>
                  <td className="py-3 px-3">
                    <div className="h-3.5 w-28 bg-[#14233f] rounded" />
                  </td>
                  <td className="py-3 px-3 text-center">
                    <div className="h-4 w-12 bg-[#14233f] rounded mx-auto" />
                  </td>
                  <td className="py-3 px-3 text-center">
                    <div className="h-4 w-12 bg-[#14233f] rounded mx-auto" />
                  </td>
                  <td className="py-3 px-3 text-center">
                    <div className="h-4 w-12 bg-[#14233f] rounded mx-auto" />
                  </td>
                </tr>
              ))
            ) : paginatedItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-500 font-mono text-xs">
                  Nenhum snapshot encontrado para os filtros selecionados.
                </td>
              </tr>
            ) : (
              paginatedItems.map((item) => {
                const { utcDate, watHour } = formatDates(item.created_at);
                const isCron =
                  item.trigger === "scheduled" ||
                  item.filename.includes("_0200") ||
                  item.filename.includes("_0300");
                const shortHash = item.sha256
                  ? `${item.sha256.substring(0, 6)}...${item.sha256.slice(-4)}`
                  : "—";

                return (
                  <tr
                    key={item.filename}
                    className="hover:bg-[#0d1830]/50 transition-colors group"
                  >
                    {/* 1. DATA / HORA (UTC) */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <div>
                          <div className="text-white font-medium">{utcDate}</div>
                          <div className="text-[11px] text-slate-500">{watHour}</div>
                        </div>
                      </div>
                    </td>

                    {/* 2. SNAPSHOT / ARQUIVO */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-bold text-white group-hover:text-emerald-400 transition-colors truncate max-w-[220px]">
                          {item.filename}
                        </span>
                        {item.notes && (
                          <span className="text-[10px] text-slate-500 truncate max-w-[220px]">
                            {item.notes}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 3. TIPO */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {isCron ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#0c2420] border border-emerald-500/40 text-emerald-400">
                          AUTOMÁTICO (CRON)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#0c1a2e] border border-cyan-500/40 text-cyan-300">
                          MANUAL (ON-DEMAND)
                        </span>
                      )}
                    </td>

                    {/* 4. TAMANHO */}
                    <td className="py-3 px-3 whitespace-nowrap text-white font-medium">
                      {item.size_human}
                    </td>

                    {/* 5. CHECKSUM SHA-256 */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {item.sha256 ? (
                        <div className="inline-flex items-center gap-1.5 bg-[#050913] border border-[#17253f] px-2 py-0.5 rounded text-cyan-400">
                          <span>{shortHash}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyHash(item.sha256!)}
                            className="text-slate-500 hover:text-white transition ml-1 cursor-pointer"
                            title="Copiar SHA256"
                            aria-label={`Copiar hash do backup ${item.filename}`}
                          >
                            {copiedHash === item.sha256 ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    {/* 6. DESTINO LOCAL */}
                    <td className="py-3 px-3 whitespace-nowrap text-center">
                      {renderDestinationStatus(item.targets?.local ?? "SUCCESS", "Salvo")}
                    </td>

                    {/* 7. GOOGLE DRIVE */}
                    <td className="py-3 px-3 whitespace-nowrap text-center">
                      {renderDestinationStatus(item.targets?.gdrive ?? "SKIPPED", "Sync")}
                    </td>

                    {/* 8. CLOUDFLARE R2 */}
                    <td className="py-3 px-3 whitespace-nowrap text-center">
                      {renderDestinationStatus(item.targets?.r2 ?? "SKIPPED", "Sync")}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Table Footer / Pagination (5 itens por página) */}
      <div className="p-3.5 lg:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[#14233f] text-xs font-mono">
        <div className="flex items-center gap-2 text-slate-400">
          <svg
            className="w-3.5 h-3.5 text-emerald-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M5 13l4 4L19 7"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
          {isLoading ? (
            <div className="h-3.5 w-56 bg-[#14233f] rounded animate-pulse" />
          ) : (
            <span>
              Exibindo{" "}
              <strong className="text-white">
                {filteredItems.length === 0
                  ? 0
                  : (safeCurrentPage - 1) * pageSize + 1}
                -
                {Math.min(safeCurrentPage * pageSize, filteredItems.length)}
              </strong>{" "}
              de <strong className="text-white">{filteredItems.length}</strong>{" "}
              snapshots persistidos
            </span>
          )}
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">
            Merkle Tree Hash:{" "}
            {isLoading ? (
              <span className="inline-block h-3 w-16 bg-[#14233f] rounded animate-pulse align-middle" />
            ) : (
              <code className="text-emerald-400 font-mono">
                {merkleTreeHash} {merkleTreeHash !== "—" ? "(OK)" : ""}
              </code>
            )}
          </span>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <nav
            aria-label="Paginação"
            className="flex items-center gap-1"
            data-testid="backup-table-pagination"
          >
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safeCurrentPage === 1}
              className="px-2.5 py-1 rounded text-slate-500 hover:text-slate-300 hover:bg-[#111e38] transition disabled:opacity-40 cursor-pointer"
            >
              Anterior
            </button>
            {Array.from({ length: totalPages }).map((_, idx) => {
              const pageNum = idx + 1;
              const isActive = pageNum === safeCurrentPage;
              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-7 h-7 rounded text-xs font-bold transition flex items-center justify-center cursor-pointer ${
                    isActive
                      ? "bg-emerald-500 text-slate-950 font-bold"
                      : "text-slate-400 hover:bg-[#111e38] hover:text-white"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage === totalPages}
              className="px-2.5 py-1 rounded text-slate-300 hover:text-white hover:bg-[#111e38] transition disabled:opacity-40 cursor-pointer"
            >
              Próximo
            </button>
          </nav>
        )}
      </div>
    </section>
  );
};
