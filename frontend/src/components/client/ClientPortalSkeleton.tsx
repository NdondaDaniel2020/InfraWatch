import React from "react";

/**
 * Esqueleto de carregamento com fidelidade estrutural 1:1 para o Portal do Cliente.
 * Espelha rigorosamente a anatomia do SlaKpiCards (banner executivo, gauge, 3 KPIs e botões de ação)
 * e do SanitizedServicesGrid (barra de filtros, 6 cards responsivos em 3 colunas e paginação),
 * eliminando saltos visuais e Cumulative Layout Shift (CLS).
 */
export const ClientPortalSkeleton: React.FC = () => {
  return (
    <div
      data-testid="state-skeleton-overlay"
      role="status"
      aria-label="Carregando dados executivos e serviços de telemetria..."
      aria-busy="true"
      className="flex flex-col gap-6 animate-pulse w-full select-none"
    >
      {/* ===================================================================== */}
      {/* 1. SKELETON DO BANNER EXECUTIVO DE SLA (SlaKpiCards)                  */}
      {/* ===================================================================== */}
      <section
        data-testid="sla-banner-skeleton"
        aria-hidden="true"
        className="rounded-3xl bg-[#0d1424] border border-white/10 p-6 lg:p-8 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-8 relative overflow-hidden shadow-2xl backdrop-blur-xl"
      >
        {/* Lado Esquerdo: Gauge Circular & Resumo Executivo */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 lg:gap-8 flex-1">
          {/* Gauge Circular */}
          <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
            <div className="w-32 h-32 rounded-full border-8 border-white/10 flex flex-col items-center justify-center">
              <div className="w-14 h-6 bg-white/15 rounded-md mb-1.5" />
              <div className="w-16 h-2 bg-white/5 rounded" />
            </div>
          </div>

          {/* Descrição Executiva */}
          <div className="flex flex-col gap-2.5 max-w-xl w-full">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="h-5 w-40 rounded-full bg-white/10 border border-white/10" />
              <div className="h-4 w-32 rounded bg-white/5" />
            </div>
            <div className="h-7 w-3/4 max-w-md bg-white/15 rounded-lg" />
            <div className="space-y-1.5 pt-1">
              <div className="h-3 w-full bg-white/5 rounded" />
              <div className="h-3 w-4/5 bg-white/5 rounded" />
            </div>
          </div>
        </div>

        {/* Lado Direito: KPIs & Ações Executivas */}
        <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-start sm:items-center lg:items-end xl:items-center gap-6 border-t lg:border-t-0 lg:border-l border-white/10 pt-6 lg:pt-0 lg:pl-8">
          {/* Pílulas de Métrica (Margem Downtime, MTTR Médio, Próxima Janela) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-3 w-full sm:w-auto">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-3.5 rounded-2xl bg-[#080c14] border border-white/5 flex flex-col w-full sm:w-28 xl:w-32"
              >
                <div className="h-3 w-16 bg-white/10 rounded mb-2" />
                <div className="h-6 w-20 bg-white/15 rounded mb-1.5" />
                <div className="h-2.5 w-14 bg-white/5 rounded" />
              </div>
            ))}
          </div>

          {/* Botões de Ação Executiva (Download PDF, Histórico de SLA) */}
          <div className="flex flex-row sm:flex-col xl:flex-col gap-2.5 w-full sm:w-auto shrink-0">
            <div className="h-10 w-full sm:w-44 rounded-xl bg-white/15 border border-white/10" />
            <div className="h-10 w-full sm:w-36 rounded-xl bg-white/5 border border-white/10" />
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 2. SKELETON DA GRADE DE SERVIÇOS CRÍTICOS (SanitizedServicesGrid)     */}
      {/* ===================================================================== */}
      <section
        data-testid="services-grid-skeleton"
        aria-hidden="true"
        className="flex flex-col gap-5"
      >
        {/* Cabeçalho com Totais */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 flex-wrap gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="h-5 w-64 bg-white/15 rounded" />
              <div className="h-5 w-28 bg-white/10 rounded-full" />
            </div>
            <div className="h-3 w-80 bg-white/5 rounded" />
          </div>
          <div className="h-3 w-36 bg-white/5 rounded" />
        </div>

        {/* Barra de Filtros e Busca Rápida */}
        <div className="flex items-center justify-between flex-wrap gap-3 p-3 bg-[#0d1424]/60 border border-white/10 rounded-2xl">
          <div className="h-9 flex-1 min-w-[240px] bg-[#080c14] border border-white/10 rounded-xl" />
          <div className="flex items-center gap-1.5 flex-wrap">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-8 w-20 sm:w-24 rounded-xl bg-white/5 border border-white/10"
              />
            ))}
          </div>
        </div>

        {/* Grid de Serviços (6 cards responsivos correspondentes ao PAGE_SIZE = 6) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              data-testid="service-card-skeleton"
              className="p-5 rounded-2xl bg-[#0d1424] border border-white/10 flex flex-col justify-between shadow-sm min-h-[220px]"
            >
              <div>
                {/* Topo do Card: Categoria, Nome e Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1.5">
                    <div className="h-2.5 w-16 bg-white/10 rounded" />
                    <div className="h-5 w-36 bg-white/15 rounded" />
                  </div>
                  <div className="h-6 w-24 rounded-full bg-white/10" />
                </div>

                {/* Métricas Rápidas: Tempo de Resposta e Vazão/Perda */}
                <div className="grid grid-cols-2 gap-3 my-4">
                  <div className="space-y-1">
                    <div className="h-2.5 w-24 bg-white/10 rounded" />
                    <div className="h-4 w-20 bg-white/15 rounded" />
                  </div>
                  <div className="space-y-1">
                    <div className="h-2.5 w-24 bg-white/10 rounded" />
                    <div className="h-4 w-16 bg-white/15 rounded" />
                  </div>
                </div>

                {/* Tags de Protocolo / Categoria */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <div className="h-5 w-12 rounded-lg bg-white/5 border border-white/5" />
                  <div className="h-5 w-14 rounded-lg bg-white/5 border border-white/5" />
                </div>
              </div>

              {/* Estabilidade 30 dias com Barra de Progresso */}
              <div className="pt-3 border-t border-white/5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="h-2.5 w-28 bg-white/10 rounded" />
                  <div className="h-3 w-10 bg-white/15 rounded" />
                </div>
                <div className="h-1.5 w-full bg-[#080c14] rounded-full overflow-hidden">
                  <div className="h-full w-4/5 bg-white/10 rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Controles de Paginação */}
        <div className="flex items-center justify-between pt-4 border-t border-white/10 flex-wrap gap-3">
          <div className="h-3 w-40 bg-white/5 rounded" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10" />
            <div className="w-8 h-8 rounded-xl bg-white/15 border border-white/10" />
            <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10" />
          </div>
        </div>
      </section>
    </div>
  );
};
