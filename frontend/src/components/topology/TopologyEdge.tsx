import React, { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getBezierPath,
} from "@xyflow/react";
import { TopologyEdgeData } from "../../types/topology";
import { AlertCircle } from "lucide-react";

export const TopologyEdge = memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
  }: EdgeProps) => {
    const edgeData = data as unknown as TopologyEdgeData | undefined;

    const [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });

    const getEdgeColor = () => {
      if (edgeData?.status === "broken") return "#f43f5e";
      if (edgeData?.status === "degraded") return "#f59e0b";
      return "#10b981";
    };

    const getEdgeClasses = () => {
      if (edgeData?.status === "broken") {
        return "stroke-rose-500 animate-pulse";
      }
      if (edgeData?.status === "degraded") {
        return "stroke-amber-400";
      }
      return "stroke-emerald-500";
    };

    const isBroken = edgeData?.status === "broken";
    const isDegraded = edgeData?.status === "degraded";

    return (
      <>
        <BaseEdge
          id={id}
          path={edgePath}
          className={`${getEdgeClasses()} transition-all`}
          style={{
            stroke: getEdgeColor(),
            strokeWidth: isBroken ? 2.5 : 2,
            strokeDasharray: isBroken ? "8 6" : isDegraded ? "6 5" : "7 5",
          }}
        />

        {/* Badge Flutuante de Métricas de Enlace */}
        {edgeData && (
          <EdgeLabelRenderer>
            <div
              style={{
                position: "absolute",
                transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                pointerEvents: "all",
              }}
              className="nodrag nopan z-20"
            >
              <div
                className={`px-2 py-0.5 rounded shadow text-[10px] font-mono tabular-nums flex items-center gap-1.5 backdrop-blur-sm border ${
                  isBroken
                    ? "bg-obsidian-950/95 border-rose-500/60 text-rose-400 font-bold"
                    : isDegraded
                    ? "bg-obsidian-950/95 border-amber-500/50 text-amber-400 font-semibold"
                    : "bg-obsidian-950/95 border-emerald-500/40 text-emerald-400"
                }`}
              >
                {isBroken ? (
                  <>
                    <AlertCircle size={12} className="text-rose-400 animate-pulse" />
                    <span>{edgeData.statusText || "FIBRA ROMPIDA (0 bps)"}</span>
                  </>
                ) : (
                  <>
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isDegraded ? "bg-amber-400" : "bg-emerald-400 animate-pulse"
                      }`}
                    />
                    <span>{edgeData.statusText || `${edgeData.latencyMs}ms | ${edgeData.bandwidth}`}</span>
                  </>
                )}
              </div>
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  }
);

TopologyEdge.displayName = "TopologyEdge";
