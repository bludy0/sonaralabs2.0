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
  done: "#6ec96e",
  failed: "#ff7351",
  processing: "#ffdd73",
  pending: "#484848",
};

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accentValue?: boolean;
}

function MetricCard({ label, value, sub, accentValue }: MetricCardProps) {
  return (
    <div className="rounded-lg p-5" style={{ background: "#131313" }}>
      <p
        className="text-[10px] font-bold tracking-[0.25em] uppercase mb-2"
        style={{ color: "#484848" }}
      >
        {label}
      </p>
      <p
        className="text-2xl font-bold"
        style={{ color: accentValue ? "#ffdd73" : "#ffffff" }}
      >
        {value}
      </p>
      {sub && (
        <p className="text-xs mt-1" style={{ color: "#484848" }}>
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0e0e0e" }}>
        <p className="text-sm" style={{ color: "#484848" }}>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ background: "#0e0e0e", color: "#ffffff" }}>
      {/* Page header */}
      <div className="mb-8">
        <p
          className="text-[10px] font-bold tracking-[0.25em] uppercase mb-2"
          style={{ color: "#484848" }}
        >
          SONARALABS / DASHBOARD
        </p>
        <h1
          className="text-2xl font-bold uppercase"
          style={{ color: "#ffffff", letterSpacing: "-0.01em" }}
        >
          Dashboard
        </h1>
      </div>

      {/* Purchase result banner */}
      {buyError && (
        <div
          className="mb-6 flex items-center justify-between rounded-lg px-4 py-3 text-sm"
          style={{ background: "rgba(255,115,81,0.08)", color: "#ff7351" }}
        >
          <span>{buyError}</span>
          <button
            onClick={() => setBuyError(null)}
            className="ml-4 transition-colors"
            style={{ color: "#ff7351" }}
          >
            ✕
          </button>
        </div>
      )}
      {purchaseBanner === "success" && (
        <div
          className="mb-6 flex items-center justify-between rounded-lg px-4 py-3 text-sm"
          style={{ background: "rgba(110,201,110,0.08)", color: "#6ec96e" }}
        >
          <span>Purchase successful! Credits have been added to your account.</span>
          <button
            onClick={() => setPurchaseBanner(null)}
            className="ml-4 transition-colors"
            style={{ color: "#6ec96e" }}
          >
            ✕
          </button>
        </div>
      )}
      {purchaseBanner === "cancelled" && (
        <div
          className="mb-6 flex items-center justify-between rounded-lg px-4 py-3 text-sm"
          style={{ background: "rgba(255,221,115,0.08)", color: "#ffdd73" }}
        >
          <span>Purchase cancelled. No charges were made.</span>
          <button
            onClick={() => setPurchaseBanner(null)}
            className="ml-4 transition-colors"
            style={{ color: "#ffdd73" }}
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
          style={{ color: "#484848" }}
        >
          Recent Activity
        </p>
        {recentItems.length === 0 ? (
          <p className="text-sm" style={{ color: "#484848" }}>No generations yet.</p>
        ) : (
          <ul className="space-y-2">
            {recentItems.map(item => (
              <li
                key={item._id}
                className="flex items-center gap-3 rounded-lg px-4 py-3"
                style={{ background: "#131313" }}
              >
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: statusDotColor[item.status] ?? "#484848" }}
                  />
                  <span
                    className="text-[9px] font-bold tracking-[0.15em] uppercase"
                    style={{ color: statusDotColor[item.status] ?? "#484848" }}
                  >
                    {item.status}
                  </span>
                </div>
                <p className="flex-1 text-sm truncate" style={{ color: "#ababab" }}>
                  {item.prompt?.slice(0, 80) ?? "—"}
                </p>
                <span className="text-xs shrink-0" style={{ color: "#484848" }}>
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
          style={{ color: "#484848" }}
        >
          Credit History
        </p>
        {creditLogs.length === 0 ? (
          <p className="text-sm" style={{ color: "#484848" }}>No transactions yet.</p>
        ) : (
          <div className="space-y-1.5">
            {/* Header row */}
            <div className="flex items-center gap-4 px-4 py-2">
              <span className="text-[9px] font-bold tracking-[0.15em] uppercase w-16 shrink-0" style={{ color: "#484848" }}>Type</span>
              <span className="text-[9px] font-bold tracking-[0.15em] uppercase flex-1" style={{ color: "#484848" }}>Reason</span>
              <span className="text-[9px] font-bold tracking-[0.15em] uppercase w-16 text-right shrink-0" style={{ color: "#484848" }}>Amount</span>
              <span className="text-[9px] font-bold tracking-[0.15em] uppercase w-20 text-right shrink-0" style={{ color: "#484848" }}>Balance After</span>
              <span className="text-[9px] font-bold tracking-[0.15em] uppercase w-24 text-right shrink-0" style={{ color: "#484848" }}>Date</span>
            </div>
            {creditLogs.map(log => (
              <div
                key={log._id}
                className="flex items-center gap-4 rounded-lg px-4 py-3"
                style={{ background: "#131313" }}
              >
                <span
                  className="text-[9px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 rounded w-16 shrink-0 text-center"
                  style={
                    log.type === "earn"
                      ? { background: "rgba(110,201,110,0.1)", color: "#6ec96e" }
                      : log.type === "refund"
                      ? { background: "rgba(100,150,255,0.1)", color: "#6496ff" }
                      : { background: "rgba(255,115,81,0.08)", color: "#ff7351" }
                  }
                >
                  {log.type}
                </span>
                <span className="flex-1 text-xs truncate" style={{ color: "#ababab" }}>{log.reason}</span>
                <span
                  className="text-sm font-bold font-mono w-16 text-right shrink-0"
                  style={{ color: log.type === "spend" ? "#ff7351" : "#6ec96e" }}
                >
                  {log.type === "spend" ? "-" : "+"}{log.amount}
                </span>
                <span className="text-sm font-mono w-20 text-right shrink-0" style={{ color: "#ffffff" }}>
                  {log.balanceAfter}
                </span>
                <span className="text-xs w-24 text-right shrink-0" style={{ color: "#484848" }}>
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
            style={{ color: "#484848" }}
          >
            Buy Credits
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {packages.map(pkg => (
              <div
                key={pkg.id}
                className="rounded-lg p-5 flex flex-col gap-3"
                style={{ background: "#131313" }}
              >
                <div>
                  <p className="text-lg font-bold" style={{ color: "#ffffff" }}>{pkg.credits} Credits</p>
                  <p className="text-xs mt-0.5" style={{ color: "#484848" }}>{pkg.label}</p>
                </div>
                <p className="text-2xl font-semibold" style={{ color: "#ffdd73" }}>
                  ${(pkg.price / 100).toFixed(2)}
                </p>
                <button
                  onClick={() => handleBuy(pkg)}
                  disabled={buyingId !== null}
                  className="mt-auto w-full py-2 px-4 rounded-lg text-sm font-bold uppercase tracking-wider transition-colors disabled:opacity-40"
                  style={{
                    background: "#ffdd73",
                    color: "#624e00",
                    boxShadow: "0px 0px 20px rgba(250,204,21,0.3)",
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
            style={{ color: "#484848" }}
          >
            Daily Stats (last 30 days)
          </p>
          {dailyStats.length === 0 ? (
            <p className="text-sm" style={{ color: "#484848" }}>No data available.</p>
          ) : (
            <div className="space-y-1.5">
              {/* Header row */}
              <div className="flex items-center gap-4 px-4 py-2">
                <span className="text-[9px] font-bold tracking-[0.15em] uppercase flex-1" style={{ color: "#484848" }}>Date</span>
                <span className="text-[9px] font-bold tracking-[0.15em] uppercase w-28 text-right shrink-0" style={{ color: "#484848" }}>Generations</span>
                <span className="text-[9px] font-bold tracking-[0.15em] uppercase w-28 text-right shrink-0" style={{ color: "#484848" }}>Credits Spent</span>
              </div>
              {dailyStats.map(row => (
                <div
                  key={row._id}
                  className="flex items-center gap-4 rounded-lg px-4 py-3"
                  style={{ background: "#131313" }}
                >
                  <span className="flex-1 text-sm" style={{ color: "#ababab" }}>{row._id}</span>
                  <span className="text-sm w-28 text-right shrink-0" style={{ color: "#ffffff" }}>{row.count}</span>
                  <span className="text-sm w-28 text-right shrink-0" style={{ color: "#ffffff" }}>{row.credits}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
