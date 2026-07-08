function SkeletonBlock({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`animate-pulse rounded-lg ${className}`}
      style={{ background: "var(--bg-input)", ...style }}
    />
  );
}

function SkeletonMetricCard() {
  return (
    <div className="rounded-lg p-5" style={{ background: "var(--bg-card)" }}>
      <SkeletonBlock className="h-2 w-24 mb-4" />
      <SkeletonBlock className="h-7 w-16" />
    </div>
  );
}

function SkeletonChartPanel() {
  return (
    <div className="rounded-lg p-5 min-h-[280px] flex flex-col" style={{ background: "var(--bg-card)" }}>
      <SkeletonBlock className="h-3 w-40 mb-6" />
      <div className="flex-1 flex items-end gap-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <SkeletonBlock
            key={i}
            className="flex-1"
            style={{ height: `${20 + Math.random() * 60}%`, opacity: 0.6 + Math.random() * 0.3 }}
          />
        ))}
      </div>
    </div>
  );
}

function SkeletonListRow() {
  return (
    <div className="flex items-center gap-3 rounded-lg px-4 py-3" style={{ background: "var(--bg-card)" }}>
      <SkeletonBlock className="h-2 w-2 rounded-full shrink-0" />
      <SkeletonBlock className="h-3 w-14 shrink-0" />
      <SkeletonBlock className="h-3 flex-1" />
      <SkeletonBlock className="h-3 w-20 shrink-0" />
    </div>
  );
}

function SkeletonCreditCard() {
  return (
    <div className="rounded-lg p-5 flex flex-col gap-4" style={{ background: "var(--bg-card)" }}>
      <div>
        <SkeletonBlock className="h-7 w-16 mb-2" />
        <SkeletonBlock className="h-2 w-16" />
      </div>
      <SkeletonBlock className="h-6 w-20" />
      <SkeletonBlock className="h-10 w-full" />
    </div>
  );
}

export default function DashboardSkeleton() {
  return (
    <div className="min-h-screen p-6" style={{ background: "var(--bg-page)", color: "var(--text-1)" }}>
      {/* Page header */}
      <div className="mb-8 space-y-2">
        <SkeletonBlock className="h-2 w-40" />
        <SkeletonBlock className="h-7 w-48" />
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonMetricCard key={i} />
        ))}
      </div>

      {/* Charts */}
      <section className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SkeletonChartPanel />
        <SkeletonChartPanel />
      </section>

      {/* Social snapshot */}
      <section className="mb-8">
        <SkeletonBlock className="h-2 w-16 mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonMetricCard key={i} />
          ))}
        </div>
      </section>

      {/* Recent activity */}
      <section className="mb-8">
        <SkeletonBlock className="h-2 w-28 mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonListRow key={i} />
          ))}
        </div>
      </section>

      {/* Credit usage */}
      <section className="mb-8">
        <SkeletonBlock className="h-2 w-24 mb-4" />
        <div className="grid grid-cols-3 gap-4 mb-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonMetricCard key={i} />
          ))}
        </div>
        <div className="space-y-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonListRow key={i} />
          ))}
        </div>
      </section>

      {/* Buy credits */}
      <section className="mb-8">
        <SkeletonBlock className="h-2 w-20 mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCreditCard key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
