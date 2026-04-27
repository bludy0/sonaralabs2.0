import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../store/useAuthStore";
import { formatBytes, formatDate } from "../lib/format";

interface GenerationItem {
  _id: string;
  prompt?: string;
  status: "pending" | "processing" | "done" | "failed";
  provider?: string;
  duration?: number;
  createdAt: string;
}

interface CreditLog {
  _id: string;
  amount: number;
  type: "earn" | "spend" | "refund";
  reason: string;
  balanceAfter: number;
  createdAt: string;
}

interface DailyStatRow {
  _id: string;   // "2026-03-01"
  count: number;
  credits: number;
}

interface CreditPackage {
  id: string;
  credits: number;
  price: number;  // cents
  label: string;
}


const statusDotColor: Record<string, string> = {
  done: "var(--success)",
  failed: "var(--error)",
  processing: "var(--accent)",
  pending: "var(--text-3)",
};

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accentValue?: boolean;
}

function MetricCard({ label, value, sub, accentValue }: MetricCardProps) {
  return (
    <div className="rounded-lg p-5" style={{ background: "var(--bg-card)" }}>
      <p
        className="text-[10px] font-bold tracking-[0.25em] uppercase mb-2"
        style={{ color: "var(--text-3)" }}
      >
        {label}
      </p>
      <p
        className="text-2xl font-bold"
        style={{ color: accentValue ? "var(--accent)" : "var(--text-1)" }}
      >
        {value}
      </p>
      {sub && (
        <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const user = useAuthStore(s => s.user);
  const [searchParams, setSearchParams] = useSearchParams();

  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditLogs, setCreditLogs]       = useState<CreditLog[]>([]);
  const [historyItems, setHistoryItems]   = useState<GenerationItem[]>([]);
  const [historyTotal, setHistoryTotal]   = useState(0);
  const [dailyStats, setDailyStats]       = useState<DailyStatRow[]>([]);
  const [loading, setLoading]             = useState(true);
  const [packages, setPackages]           = useState<CreditPackage[]>([]);
  const [buyingId, setBuyingId]           = useState<string | null>(null);
  const [buyError, setBuyError]           = useState<string | null>(null);
  const [purchaseBanner, setPurchaseBanner] = useState<"success" | "cancelled" | null>(null);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    // Handle purchase redirect banner
    const purchase = searchParams.get("purchase");
    if (purchase === "success" || purchase === "cancelled") {
      setPurchaseBanner(purchase);
      // Remove param from URL without triggering a navigation
      const next = new URLSearchParams(searchParams);
      next.delete("purchase");
      setSearchParams(next, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [balanceRes, historyRes, logsRes, packagesRes] = await Promise.all([
          api.get("/api/credits/balance"),
          api.get("/api/generate/history"),
          api.get("/api/credits/history", { params: { limit: 10 } }),
          api.get("/api/credits/packages"),
        ]);

        const bal =
          balanceRes.data?.creditBalance ??
          balanceRes.data?.data?.creditBalance ??
          user?.creditBalance ??
          0;
        setCreditBalance(bal);

        const items: GenerationItem[] =
          historyRes.data?.items ?? historyRes.data?.data?.items ?? [];
        const total: number =
          historyRes.data?.total ?? historyRes.data?.data?.total ?? 0;
        setHistoryItems(items);
        setHistoryTotal(total);

        const logs: CreditLog[] =
          logsRes.data?.data?.items ?? logsRes.data?.items ?? [];
        setCreditLogs(logs);

        const pkgs: CreditPackage[] =
          packagesRes.data?.data ?? packagesRes.data ?? [];
        setPackages(pkgs);

        if (isAdmin) {
          const statsRes = await api.get("/api/admin/stats/daily");
          const rows: DailyStatRow[] =
            statsRes.data?.data ?? statsRes.data ?? [];
          setDailyStats(rows);
        }
      } catch {
        // partial failures are acceptable — leave defaults
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [isAdmin]);

  const doneCount = historyItems.filter(i => i.status === "done").length;
  const recentItems = historyItems.slice(0, 5);

  async function handleBuy(pkg: CreditPackage) {
    setBuyingId(pkg.id);
    setBuyError(null);
    try {
      const res = await api.post("/api/credits/purchase", {
        packageId: pkg.id,
        successUrl: `${window.location.origin}/dashboard?purchase=success`,
        cancelUrl:  `${window.location.origin}/dashboard?purchase=cancelled`,
      });
      const checkoutUrl: string = res.data?.data?.checkoutUrl ?? res.data?.checkoutUrl;
      if (checkoutUrl && checkoutUrl.startsWith("https://checkout.stripe.com/")) {
        window.location.href = checkoutUrl;
      } else {
        setBuyError("Could not open checkout. Please try again.");
      }
    } catch {
      setBuyError("Purchase failed. Please check your connection and try again.");
    } finally {
      setBuyingId(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-page)" }}>
        <p className="text-sm" style={{ color: "var(--text-3)" }}>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--bg-page)", color: "var(--text-1)" }}>
      {/* Page header */}
      <div className="mb-8">
        <p
          className="text-[10px] font-bold tracking-[0.25em] uppercase mb-2"
          style={{ color: "var(--text-3)" }}
        >
          SONARALABS / DASHBOARD
        </p>
        <h1
          className="text-2xl font-bold uppercase"
          style={{ color: "var(--text-1)", letterSpacing: "-0.01em" }}
        >
          Dashboard
        </h1>
      </div>

      {/* Purchase result banner */}
      {buyError && (
        <div
          className="mb-6 flex items-center justify-between rounded-lg px-4 py-3 text-sm"
          style={{ background: "color-mix(in srgb, var(--error) 8%, transparent)", color: "var(--error)" }}
        >
          <span>{buyError}</span>
          <button
            onClick={() => setBuyError(null)}
            className="ml-4 transition-colors"
            style={{ color: "var(--error)" }}
          >
            ✕
          </button>
        </div>
      )}
      {purchaseBanner === "success" && (
        <div
          className="mb-6 flex items-center justify-between rounded-lg px-4 py-3 text-sm"
          style={{ background: "color-mix(in srgb, var(--success) 8%, transparent)", color: "var(--success)" }}
        >
          <span>Purchase successful! Credits have been added to your account.</span>
          <button
            onClick={() => setPurchaseBanner(null)}
            className="ml-4 transition-colors"
            style={{ color: "var(--success)" }}
          >
            ✕
          </button>
        </div>
      )}
      {purchaseBanner === "cancelled" && (
        <div
          className="mb-6 flex items-center justify-between rounded-lg px-4 py-3 text-sm"
          style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)", color: "var(--accent)" }}
        >
          <span>Purchase cancelled. No charges were made.</span>
          <button
            onClick={() => setPurchaseBanner(null)}
            className="ml-4 transition-colors"
            style={{ color: "var(--accent)" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Credit Balance"
          value={creditBalance ?? user?.creditBalance ?? 0}
          sub="credits available"
          accentValue
        />
        <MetricCard
          label="Total Generations"
          value={historyTotal}
          sub="all time"
        />
        <MetricCard
          label="Completed"
          value={doneCount}
          sub={`of last ${historyItems.length} loaded`}
        />
        <MetricCard
          label="Storage Used"
          value={formatBytes(user?.storageUsed ?? 0)}
          sub="of 500 MB quota"
        />
      </div>

      {/* Recent activity */}
      <section className="mb-8">
        <p
          className="text-[10px] font-bold tracking-[0.25em] uppercase mb-4"
          style={{ color: "var(--text-3)" }}
        >
          Recent Activity
        </p>
        {recentItems.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-3)" }}>No generations yet.</p>
        ) : (
          <ul className="space-y-2">
            {recentItems.map(item => (
              <li
                key={item._id}
                className="flex items-center gap-3 rounded-lg px-4 py-3"
                style={{ background: "var(--bg-card)" }}
              >
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: statusDotColor[item.status] ?? "var(--text-3)" }}
                  />
                  <span
                    className="text-[9px] font-bold tracking-[0.15em] uppercase"
                    style={{ color: statusDotColor[item.status] ?? "var(--text-3)" }}
                  >
                    {item.status}
                  </span>
                </div>
                <p className="flex-1 text-sm truncate" style={{ color: "var(--text-2)" }}>
                  {item.prompt?.slice(0, 80) ?? "—"}
                </p>
                <span className="text-xs shrink-0" style={{ color: "var(--text-3)" }}>
                  {formatDate(item.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Credit history */}
      <section className="mb-8">
        <p
          className="text-[10px] font-bold tracking-[0.25em] uppercase mb-4"
          style={{ color: "var(--text-3)" }}
        >
          Credit History
        </p>
        {creditLogs.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-3)" }}>No transactions yet.</p>
        ) : (
          <div className="space-y-1.5">
            {/* Header row */}
            <div className="flex items-center gap-4 px-4 py-2">
              <span className="text-[9px] font-bold tracking-[0.15em] uppercase w-16 shrink-0" style={{ color: "var(--text-3)" }}>Type</span>
              <span className="text-[9px] font-bold tracking-[0.15em] uppercase flex-1" style={{ color: "var(--text-3)" }}>Reason</span>
              <span className="text-[9px] font-bold tracking-[0.15em] uppercase w-16 text-right shrink-0" style={{ color: "var(--text-3)" }}>Amount</span>
              <span className="text-[9px] font-bold tracking-[0.15em] uppercase w-20 text-right shrink-0" style={{ color: "var(--text-3)" }}>Balance After</span>
              <span className="text-[9px] font-bold tracking-[0.15em] uppercase w-24 text-right shrink-0" style={{ color: "var(--text-3)" }}>Date</span>
            </div>
            {creditLogs.map(log => (
              <div
                key={log._id}
                className="flex items-center gap-4 rounded-lg px-4 py-3"
                style={{ background: "var(--bg-card)" }}
              >
                <span
                  className="text-[9px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 rounded w-16 shrink-0 text-center"
                  style={
                    log.type === "earn"
                      ? { background: "color-mix(in srgb, var(--success) 10%, transparent)", color: "var(--success)" }
                      : log.type === "refund"
                      ? { background: "color-mix(in srgb, var(--info, #6496ff) 10%, transparent)", color: "var(--info, #6496ff)" }
                      : { background: "color-mix(in srgb, var(--error) 8%, transparent)", color: "var(--error)" }
                  }
                >
                  {log.type}
                </span>
                <span className="flex-1 text-xs truncate" style={{ color: "var(--text-2)" }}>{log.reason}</span>
                <span
                  className="text-sm font-bold font-mono w-16 text-right shrink-0"
                  style={{ color: log.type === "spend" ? "var(--error)" : "var(--success)" }}
                >
                  {log.type === "spend" ? "-" : "+"}{log.amount}
                </span>
                <span className="text-sm font-mono w-20 text-right shrink-0" style={{ color: "var(--text-1)" }}>
                  {log.balanceAfter}
                </span>
                <span className="text-xs w-24 text-right shrink-0" style={{ color: "var(--text-3)" }}>
                  {formatDate(log.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Buy Credits */}
      {packages.length > 0 && (
        <section className="mb-8">
          <p
            className="text-[10px] font-bold tracking-[0.25em] uppercase mb-4"
            style={{ color: "var(--text-3)" }}
          >
            Buy Credits
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {packages.map(pkg => (
              <div
                key={pkg.id}
                className="rounded-lg p-5 flex flex-col gap-3"
                style={{ background: "var(--bg-card)" }}
              >
                <div>
                  <p className="text-lg font-bold" style={{ color: "var(--text-1)" }}>{pkg.credits} Credits</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>{pkg.label}</p>
                </div>
                <p className="text-2xl font-semibold" style={{ color: "var(--accent)" }}>
                  ${(pkg.price / 100).toFixed(2)}
                </p>
                <button
                  onClick={() => handleBuy(pkg)}
                  disabled={buyingId !== null}
                  className="mt-auto w-full py-2 px-4 rounded-lg text-sm font-bold uppercase tracking-wider transition-colors disabled:opacity-40"
                  style={{
                    background: "var(--accent)",
                    color: "var(--accent-on)",
                    boxShadow: "0px 0px 20px color-mix(in srgb, var(--accent) 30%, transparent)",
                  }}
                >
                  {buyingId === pkg.id ? "Redirecting..." : "Buy"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Admin section — daily stats table */}
      {isAdmin && (
        <section>
          <p
            className="text-[10px] font-bold tracking-[0.25em] uppercase mb-4"
            style={{ color: "var(--text-3)" }}
          >
            Daily Stats (last 30 days)
          </p>
          {dailyStats.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-3)" }}>No data available.</p>
          ) : (
            <div className="space-y-1.5">
              {/* Header row */}
              <div className="flex items-center gap-4 px-4 py-2">
                <span className="text-[9px] font-bold tracking-[0.15em] uppercase flex-1" style={{ color: "var(--text-3)" }}>Date</span>
                <span className="text-[9px] font-bold tracking-[0.15em] uppercase w-28 text-right shrink-0" style={{ color: "var(--text-3)" }}>Generations</span>
                <span className="text-[9px] font-bold tracking-[0.15em] uppercase w-28 text-right shrink-0" style={{ color: "var(--text-3)" }}>Credits Spent</span>
              </div>
              {dailyStats.map(row => (
                <div
                  key={row._id}
                  className="flex items-center gap-4 rounded-lg px-4 py-3"
                  style={{ background: "var(--bg-card)" }}
                >
                  <span className="flex-1 text-sm" style={{ color: "var(--text-2)" }}>{row._id}</span>
                  <span className="text-sm w-28 text-right shrink-0" style={{ color: "var(--text-1)" }}>{row.count}</span>
                  <span className="text-sm w-28 text-right shrink-0" style={{ color: "var(--text-1)" }}>{row.credits}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
