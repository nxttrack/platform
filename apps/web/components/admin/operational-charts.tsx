"use client";

import { Bar, BarChart, CartesianGrid, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import type { ReactNode } from "react";

import { ChartAccessibleTable, ChartContainer, ChartLegendList, type ChartConfig } from "@/components/ui/chart";
import type { CapacityChartDatum, StatusChartDatum } from "@/lib/domain/admin-chart-data";

const capacityConfig = {
  bezet: { label: "Bezet", color: "var(--chart-1)" },
  vrij: { label: "Vrij", color: "var(--chart-2)" }
} satisfies ChartConfig;

export function CapacityChart({ data }: { data: CapacityChartDatum[] }) {
  if (data.length === 0) return <ChartEmptyState>Er is nog geen groepscapaciteit om te visualiseren.</ChartEmptyState>;

  return (
    <figure aria-labelledby="capacity-chart-title">
      <figcaption id="capacity-chart-title" className="mb-1 font-bold text-foreground">Bezetting per lesgroep</figcaption>
      <p className="mb-4 text-sm text-muted-foreground">Werkelijke groepsleden tegenover resterende capaciteit.</p>
      <ChartContainer config={capacityConfig} className="h-72">
        <BarChart accessibilityLayer data={data} margin={{ left: -16, right: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
          <XAxis dataKey="name" axisLine={false} tickLine={false} tickMargin={10} interval={0} fontSize={11} />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} fontSize={11} />
          <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={tooltipStyle} />
          <Bar dataKey="bezet" stackId="capacity" fill="var(--color-bezet)" radius={[0, 0, 4, 4]} isAnimationActive={false} />
          <Bar dataKey="vrij" stackId="capacity" fill="var(--color-vrij)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
      <ChartLegendList config={capacityConfig} keys={["bezet", "vrij"]} />
      <ChartAccessibleTable caption="Bezetting per lesgroep" columns={[{ key: "name", label: "Lesgroep" }, { key: "bezet", label: "Bezet" }, { key: "vrij", label: "Vrij" }]} rows={data} />
    </figure>
  );
}

export function StatusDonutChart({ data, title, description, valueLabel = "Aantal", valueFormat = "number" }: { data: StatusChartDatum[]; title: string; description: string; valueLabel?: string; valueFormat?: "currency" | "number" }) {
  if (data.length === 0) return <ChartEmptyState>Er is nog geen data voor {title.toLowerCase()}.</ChartEmptyState>;

  const config = Object.fromEntries(data.map((item) => [item.key, { label: item.name, color: item.fill }])) satisfies ChartConfig;
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const valueFormatter = valueFormat === "currency" ? formatEuro : formatNumber;

  return (
    <figure aria-label={title}>
      <figcaption className="mb-1 font-bold text-foreground">{title}</figcaption>
      <p className="mb-4 text-sm text-muted-foreground">{description}</p>
      <div className="relative">
        <ChartContainer config={config} className="h-64">
          <PieChart accessibilityLayer>
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => valueFormatter(Number(value))} />
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={54} outerRadius={88} paddingAngle={2} stroke="var(--card)" strokeWidth={2} isAnimationActive={false} />
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true"><span className="text-2xl font-bold text-foreground">{valueFormatter(total)}</span><span className="text-xs text-muted-foreground">Totaal</span></div>
      </div>
      <ChartLegendList config={config} keys={data.map((item) => item.key)} />
      <ChartAccessibleTable caption={title} columns={[{ key: "name", label: "Status" }, { key: "value", label: valueLabel }]} rows={data.map((item) => ({ name: item.name, value: valueFormatter(item.value) }))} />
    </figure>
  );
}

function formatEuro(value: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function ChartEmptyState({ children }: { children: ReactNode }) {
  return <div className="flex min-h-52 items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">{children}</div>;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 }).format(value);
}

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  boxShadow: "var(--shadow-soft)"
};
