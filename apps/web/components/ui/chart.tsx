"use client";

import { createContext, useContext, useId, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { ResponsiveContainer } from "recharts";

import { cn } from "@/lib/utils";

export type ChartConfig = Record<string, { label: string; color: string }>;

const ChartContext = createContext<ChartConfig | null>(null);

export function ChartContainer({ config, children, className }: { config: ChartConfig; children: ReactElement; className?: string }) {
  const rawId = useId();
  const chartId = `chart-${rawId.replace(/:/g, "")}`;
  const variables = Object.fromEntries(Object.entries(config).map(([key, item]) => [`--color-${key}`, item.color])) as CSSProperties;

  return (
    <ChartContext.Provider value={config}>
      <div data-chart={chartId} className={cn("h-64 min-h-52 w-full text-xs", className)} style={variables}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          {children}
        </ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

export function ChartLegendList({ keys, className, config: suppliedConfig }: { keys: string[]; className?: string; config?: ChartConfig }) {
  const contextConfig = useContext(ChartContext);
  const config = suppliedConfig ?? contextConfig;

  if (!config) throw new Error("ChartLegendList needs a config prop or a ChartContainer parent.");

  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground", className)} aria-label="Legenda">
      {keys.map((key) => {
        const item = config[key];

        if (!item) return null;

        return (
          <li key={key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} aria-hidden="true" />
            {item.label}
          </li>
        );
      })}
    </ul>
  );
}

export function ChartAccessibleTable({ caption, columns, rows }: { caption: string; columns: Array<{ key: string; label: string }>; rows: Array<Record<string, ReactNode>> }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column.key}>{row[column.key]}</td>)}</tr>)}</tbody>
    </table>
  );
}
