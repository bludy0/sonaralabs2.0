import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

/* ──────────────────────────────────────────────────────────────────────────
 * Shared helpers
 * ────────────────────────────────────────────────────────────────────────── */

/** Resolve a CSS custom property to its computed value (recharts needs real colors). */
function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Category palette — accent first, then a balanced set that reads well on dark + light. */
function usePalette(): string[] {
  return useMemo(() => [
    cssVar("--accent", "#7c5cff"),
    cssVar("--success", "#3ecf8e"),
    "#f59e0b",
    "#ec4899",
    "#38bdf8",
    "#a78bfa",
    "#f43f5e",
    "#22d3ee",
  ], []);
}

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}

function Segmented<T extends string>({ value, options, onChange }: SegmentedProps<T>) {
  return (
    <div
      className="inline-flex rounded-lg p-0.5 gap-0.5"
      style={{ background: "color-mix(in srgb, var(--text-3) 12%, transparent)" }}
    >
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all"
            style={{
              background: active ? "var(--bg-card)" : "transparent",
              color: active ? "var(--text-1)" : "var(--text-3)",
              boxShadow: active ? "0 1px 2px rgba(0,0,0,0.18)" : "none",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function PanelShell({
  title, controls, children,
}: { title: string; controls: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg p-5" style={{ background: "var(--bg-card)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <p
          lang="en"
          className="text-[10px] font-bold tracking-[0.25em] uppercase"
          style={{ color: "var(--text-3)" }}
        >
          {title}
        </p>
        <div className="flex flex-wrap items-center gap-2">{controls}</div>
      </div>
      {children}
    </div>
  );
}

const tooltipStyle = {
  background: "var(--bg-page)",
  border: "1px solid color-mix(in srgb, var(--text-3) 25%, transparent)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--text-1)",
} as const;

function EmptyState() {
  return (
    <div className="h-64 flex items-center justify-center">
      <p className="text-sm" style={{ color: "var(--text-3)" }}>No data available yet.</p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Time-series panel — pick a metric + pick a chart type (bar / line / area)
 * ────────────────────────────────────────────────────────────────────────── */

export type TimeSeriesType = "bar" | "line" | "area";

export interface TimeSeriesMetric {
  key: string;
  label: string;
}

export interface TimeSeriesPanelProps {
  title: string;
  data: Record<string, string | number>[];
  xKey: string;
  metrics: TimeSeriesMetric[];
  defaultType?: TimeSeriesType;
  types?: TimeSeriesType[];
}

export function TimeSeriesPanel({
  title, data, xKey, metrics,
  defaultType = "bar",
  types = ["bar", "line", "area"],
}: TimeSeriesPanelProps) {
  const [type, setType] = useState<TimeSeriesType>(defaultType);
  const [metricKey, setMetricKey] = useState(metrics[0]?.key);
  const accent = cssVar("--accent", "#7c5cff");
  const grid = "color-mix(in srgb, var(--text-3) 14%, transparent)";

  const metric = metrics.find(m => m.key === metricKey) ?? metrics[0];
  const hasData = data.length > 0;

  const typeOptions = types.map(t => ({
    value: t,
    label: t === "bar" ? "Bar" : t === "line" ? "Line" : "Area",
  }));

  return (
    <PanelShell
      title={title}
      controls={
        <>
          {metrics.length > 1 && (
            <Segmented value={metricKey} options={metrics.map(m => ({ value: m.key, label: m.label }))} onChange={setMetricKey} />
          )}
          <Segmented value={type} options={typeOptions} onChange={setType} />
        </>
      }
    >
      {!hasData ? (
        <EmptyState />
      ) : (
        <ResponsiveContainer width="100%" height={256}>
          {type === "bar" ? (
            <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
              <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: "var(--text-3)" }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-3)" }} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "color-mix(in srgb, var(--accent) 10%, transparent)" }} />
              <Bar dataKey={metric.key} name={metric.label} fill={accent} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          ) : type === "line" ? (
            <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
              <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: "var(--text-3)" }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-3)" }} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey={metric.key} name={metric.label} stroke={accent} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            </LineChart>
          ) : (
            <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${metric.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={accent} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
              <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: "var(--text-3)" }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-3)" }} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey={metric.key} name={metric.label} stroke={accent} strokeWidth={2} fill={`url(#grad-${metric.key})`} isAnimationActive={false} />
            </AreaChart>
          )}
        </ResponsiveContainer>
      )}
    </PanelShell>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Distribution panel — pick a dimension + pick a chart type (donut / bar)
 * ────────────────────────────────────────────────────────────────────────── */

export type DistType = "donut" | "bar";

export interface Dimension {
  key: string;
  label: string;
  data: { name: string; value: number }[];
}

export interface DistributionPanelProps {
  title: string;
  dimensions: Dimension[];
  defaultType?: DistType;
}

export function DistributionPanel({ title, dimensions, defaultType = "donut" }: DistributionPanelProps) {
  const [type, setType] = useState<DistType>(defaultType);
  const [dimKey, setDimKey] = useState(dimensions[0]?.key);
  const palette = usePalette();
  const grid = "color-mix(in srgb, var(--text-3) 14%, transparent)";

  const dim = dimensions.find(d => d.key === dimKey) ?? dimensions[0];
  const rows = (dim?.data ?? []).filter(d => d.value > 0);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const hasData = rows.length > 0;

  return (
    <PanelShell
      title={title}
      controls={
        <>
          {dimensions.length > 1 && (
            <Segmented value={dimKey} options={dimensions.map(d => ({ value: d.key, label: d.label }))} onChange={setDimKey} />
          )}
          <Segmented
            value={type}
            options={[{ value: "donut" as DistType, label: "Donut" }, { value: "bar" as DistType, label: "Bar" }]}
            onChange={setType}
          />
        </>
      }
    >
      {!hasData ? (
        <EmptyState />
      ) : type === "donut" ? (
        <ResponsiveContainer width="100%" height={256}>
          <PieChart>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={92}
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
            >
              {rows.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v, n) => {
                const num = Number(v) || 0;
                return [`${num} (${total ? Math.round((num / total) * 100) : 0}%)`, String(n)];
              }}
            />
            <Legend
              verticalAlign="middle"
              align="right"
              layout="vertical"
              iconType="circle"
              wrapperStyle={{ fontSize: 12, color: "var(--text-2)" }}
            />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={256}>
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text-3)" }} tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--text-2)" }} tickLine={false} axisLine={false} width={88} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "color-mix(in srgb, var(--accent) 10%, transparent)" }} />
            <Bar dataKey="value" radius={[0, 3, 3, 0]} isAnimationActive={false}>
              {rows.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </PanelShell>
  );
}
