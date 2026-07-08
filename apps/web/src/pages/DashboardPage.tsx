import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../store/useAuthStore";
import { formatBytes, formatDate } from "../lib/format";
import { useT } from "../store/useI18nStore";
import {
  TimeSeriesPanel,
  DistributionPanel,
  type Dimension,
} from "../components/dashboard/ChartPanel";
import DashboardSkeleton from "../components/dashboard/DashboardSkeleton";

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

interface GenStats {
  total: number;
  byStatus: Record<string, number>;
  byProvider: Record<string, number>;
  byType: Record<string, number>;
  topStyles: { _id: string; count: number }[];
  daily: DailyStatRow[];
  creditsSpent: number;
  totalDuration: number;
}

interface SocialStats {
  published: number;
  totalLikes: number;
  followers: number;
  following: number;
}

interface AdminStats {
  users: { total: number };
  generations: { total: number; done: number; failed: number; successRate: string };
  uploads: { total: number };
  providers: Record<string, number>;
  topStyles: { _id: string; count: number }[];
}

const statusDotColor: Record<string, string> = {
  done: "var(--success)",
  failed: "var(--error)",
  processing: "var(--accent)",
  pending: "var(--text-3)",
};

const EMPTY_GEN_STATS: GenStats = {
  total: 0, byStatus: {}, byProvider: {}, byType: {}, topStyles: [], daily: [],
  creditsSpent: 0, totalDuration: 0,
};

/** Convert a { key: count } map into recharts-friendly rows, capitalising labels. */
function mapToRows(map: Record<string, number>): { name: string; value: number }[] {
  return Object.entries(map).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
  }));
}

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      lang="en"
      className="text-[10px] font-bold tracking-[0.25em] uppercase mb-4"
      style={{ color: "var(--text-3)" }}
    >
      {children}
    </p>
  );
}

export default function DashboardPage() {
  const t = useT();
  const user = useAuthStore(s => s.user);
  const [searchParams, setSearchParams] = useSearchParams();

  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditLogs, setCreditLogs]       = useState<CreditLog[]>([]);
  const [historyItems, setHistoryItems]   = useState<GenerationItem[]>([]);
  const [historyTotal, setHistoryTotal]   = useState(0);
  const [genStats, setGenStats]           = useState<GenStats>(EMPTY_GEN_STATS);
  const [social, setSocial]               = useState<SocialStats>({ published: 0, totalLikes: 0, followers: 0, following: 0 });
  const [favorites, setFavorites]         = useState(0);
  const [collections, setCollections]     = useState(0);
  const [dailyStats, setDailyStats]       = useState<DailyStatRow[]>([]);
  const [adminStats, setAdminStats]       = useState<AdminStats | null>(null);
  const [loading, setLoading]             = useState(true);
  const [purchaseBanner, setPurchaseBanner] = useState<"success" | "cancelled" | null>(null);
  const [packages, setPackages]           = useState<CreditPackage[]>([]);
  const [packagesUnavailable, setPackagesUnavailable] = useState(false);
  const [purchasing, setPurchasing]       = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    const purchase = searchParams.get("purchase");
    if (purchase === "success" || purchase === "cancelled") {
      setPurchaseBanner(purchase as "success" | "cancelled");
      const next = new URLSearchParams(searchParams);
      next.delete("purchase");
      setSearchParams(next, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function load() {
      setLoading(true);

      const get = async <T,>(url: string, params?: object): Promise<T | null> => {
        try { return (await api.get(url, params ? { params } : undefined)).data; }
        catch { return null; }
      };

      const [
        balanceRes, historyRes, logsRes, statsRes,
        tracksRes, followersRes, followingRes, favRes, colRes,
      ] = await Promise.all([
        get<any>("/api/credits/balance"),
        get<any>("/api/generate/history"),
        get<any>("/api/credits/history", { limit: 100 }),
        get<any>("/api/generate/stats"),
        get<any>("/api/social/my-tracks"),
        get<any>("/api/social/followers"),
        get<any>("/api/social/following"),
        get<any>("/api/library", { favorites: "true", limit: 1 }),
        get<any>("/api/collections"),
      ]);

      setCreditBalance(
        balanceRes?.creditBalance ?? balanceRes?.data?.creditBalance ?? user?.creditBalance ?? 0,
      );

      setHistoryItems(historyRes?.items ?? historyRes?.data?.items ?? []);
      setHistoryTotal(historyRes?.total ?? historyRes?.data?.total ?? 0);

      setCreditLogs(logsRes?.data?.logs ?? logsRes?.data?.items ?? logsRes?.items ?? []);

      const gs = statsRes?.data ?? statsRes;
      if (gs && typeof gs === "object") setGenStats({ ...EMPTY_GEN_STATS, ...gs });

      const tracks: any[] = tracksRes?.data ?? tracksRes?.items ?? [];
      const followers: any[] = followersRes?.data ?? [];
      const following: any[] = followingRes?.data ?? [];
      setSocial({
        published: tracks.length,
        totalLikes: tracks.reduce((s, tr) => s + (tr.likeCount ?? 0), 0),
        followers: Array.isArray(followers) ? followers.length : 0,
        following: Array.isArray(following) ? following.length : 0,
      });

      setFavorites(favRes?.data?.total ?? favRes?.total ?? 0);
      const cols = colRes?.data?.items ?? colRes?.data ?? colRes?.items ?? [];
      setCollections(Array.isArray(cols) ? cols.length : 0);

      if (isAdmin) {
        const [dailyRes, adminRes] = await Promise.all([
          get<any>("/api/admin/stats/daily"),
          get<any>("/api/admin/stats"),
        ]);
        setDailyStats(dailyRes?.data ?? dailyRes ?? []);
        const a = adminRes?.data ?? adminRes;
        if (a) setAdminStats(a);
      }

      setLoading(false);
    }

    async function loadPackages() {
      try {
        const res = await api.get("/api/credits/packages");
        setPackages(res.data?.data ?? res.data?.packages ?? []);
      } catch (err: unknown) {
        if ((err as { response?: { status?: number } })?.response?.status === 503) {
          setPackagesUnavailable(true);
        }
      }
    }

    load();
    loadPackages();
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePurchase(packageId: string) {
    setPurchasing(packageId);
    setPurchaseError(null);
    try {
      const origin = window.location.origin;
      const res = await api.post("/api/credits/purchase", {
        packageId,
        successUrl: `${origin}/dashboard?purchase=success`,
        cancelUrl:  `${origin}/dashboard?purchase=cancelled`,
      });
      const checkoutUrl: string = res.data?.data?.checkoutUrl ?? res.data?.checkoutUrl;
      if (checkoutUrl) window.location.href = checkoutUrl;
      else setPurchaseError("Could not initiate checkout. Please try again.");
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setPurchaseError(status === 503 ? "Payment system is not available yet." : "Purchase failed. Please try again.");
    } finally {
      setPurchasing(null);
    }
  }

  /* ── Derived data for charts ─────────────────────────────────────────────── */

  const doneCount = genStats.byStatus.done ?? 0;
  const successRate = genStats.total > 0 ? Math.round((doneCount / genStats.total) * 100) : 0;
  const recentItems = historyItems.slice(0, 5);

  const userSeries = useMemo(
    () => genStats.daily.map(d => ({ date: d._id.slice(5), generations: d.count, credits: d.credits })),
    [genStats.daily],
  );

  const userDimensions: Dimension[] = useMemo(() => [
    { key: "status",   label: "Status",   data: mapToRows(genStats.byStatus) },
    { key: "provider", label: "Provider", data: mapToRows(genStats.byProvider) },
    { key: "type",     label: "Type",     data: mapToRows(genStats.byType) },
    { key: "style",    label: "Style",    data: genStats.topStyles.map(s => ({ name: s._id, value: s.count })) },
  ], [genStats]);

  const creditSummary = useMemo(() => {
    const acc = { earn: 0, spend: 0, refund: 0 };
    for (const l of creditLogs) {
      if (l.type === "earn")   acc.earn   += Math.abs(l.amount);
      if (l.type === "spend")  acc.spend  += Math.abs(l.amount);
      if (l.type === "refund") acc.refund += Math.abs(l.amount);
    }
    return acc;
  }, [creditLogs]);

  const adminSeries = useMemo(
    () => dailyStats.map(d => ({ date: d._id.slice(5), generations: d.count, credits: d.credits })),
    [dailyStats],
  );

  const adminDimensions: Dimension[] = useMemo(() => adminStats ? [
    { key: "provider", label: "Provider", data: mapToRows(adminStats.providers) },
    { key: "style",    label: "Top Styles", data: adminStats.topStyles.map(s => ({ name: s._id, value: s.count })) },
    { key: "outcome",  label: "Outcome", data: [
      { name: "Done",   value: adminStats.generations.done },
      { name: "Failed", value: adminStats.generations.failed },
    ] },
  ] : [], [adminStats]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--bg-page)", color: "var(--text-1)" }}>
      {/* Page header */}
      <div className="mb-8">
        <p className="text-[10px] font-bold tracking-[0.25em] uppercase mb-2" style={{ color: "var(--text-3)" }}>
          SONARALABS / DASHBOARD
        </p>
        <h1 className="text-2xl font-bold uppercase" style={{ color: "var(--text-1)", letterSpacing: "-0.01em" }}>
          Dashboard
        </h1>
      </div>

      {purchaseBanner === "success" && (
        <div className="mb-6 flex items-center justify-between rounded-lg px-4 py-3 text-sm"
          style={{ background: "color-mix(in srgb, var(--success) 8%, transparent)", color: "var(--success)" }}>
          <span>Purchase successful! Credits have been added to your account.</span>
          <button onClick={() => setPurchaseBanner(null)} className="ml-4" style={{ color: "var(--success)" }}>✕</button>
        </div>
      )}
      {purchaseBanner === "cancelled" && (
        <div className="mb-6 flex items-center justify-between rounded-lg px-4 py-3 text-sm"
          style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)", color: "var(--accent)" }}>
          <span>Purchase cancelled. No charges were made.</span>
          <button onClick={() => setPurchaseBanner(null)} className="ml-4" style={{ color: "var(--accent)" }}>✕</button>
        </div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard label={t.dashboard.creditBalance} value={creditBalance ?? user?.creditBalance ?? 0} sub={t.dashboard.credits} accentValue />
        <MetricCard label={t.dashboard.totalGen} value={genStats.total || historyTotal} sub="all time" />
        <MetricCard label={t.dashboard.completed} value={doneCount} sub={`${successRate}% success rate`} />
        <MetricCard label={t.dashboard.storage} value={formatBytes(user?.storageUsed ?? 0)} sub="of 500 MB quota" />
        <MetricCard label="Credits Spent" value={genStats.creditsSpent} sub="on generations" />
        <MetricCard label="Favorites" value={favorites} sub="saved tracks" />
        <MetricCard label="Collections" value={collections} sub="playlists" />
        <MetricCard label="Published" value={social.published} sub={`${social.totalLikes} likes`} />
      </div>

      {/* Interactive charts — user */}
      <section className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TimeSeriesPanel
          title="Generation Activity (30d)"
          data={userSeries}
          xKey="date"
          metrics={[
            { key: "generations", label: "Generations" },
            { key: "credits", label: "Credits" },
          ]}
          defaultType="area"
        />
        <DistributionPanel title="Breakdown" dimensions={userDimensions} defaultType="donut" />
      </section>

      {/* Social snapshot */}
      <section className="mb-8">
        <SectionLabel>Social</SectionLabel>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Followers" value={social.followers} />
          <MetricCard label="Following" value={social.following} />
          <MetricCard label="Published Tracks" value={social.published} />
          <MetricCard label="Total Likes" value={social.totalLikes} accentValue />
        </div>
      </section>

      {/* Recent activity */}
      <section className="mb-8">
        <SectionLabel>Recent Activity</SectionLabel>
        {recentItems.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-3)" }}>No generations yet.</p>
        ) : (
          <ul className="space-y-2">
            {recentItems.map(item => (
              <li key={item._id} className="flex items-center gap-3 rounded-lg px-4 py-3" style={{ background: "var(--bg-card)" }}>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusDotColor[item.status] ?? "var(--text-3)" }} />
                  <span className="text-[9px] font-bold tracking-[0.15em] uppercase" style={{ color: statusDotColor[item.status] ?? "var(--text-3)" }}>
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

      {/* Credit usage */}
      <section className="mb-8">
        <SectionLabel>Credit Usage</SectionLabel>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <MetricCard label="Earned" value={`+${creditSummary.earn}`} />
          <MetricCard label="Spent" value={`-${creditSummary.spend}`} />
          <MetricCard label="Refunded" value={`+${creditSummary.refund}`} />
        </div>
        {creditLogs.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-3)" }}>No transactions yet.</p>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center gap-4 px-4 py-2">
              <span lang="en" className="text-[9px] font-bold tracking-[0.15em] uppercase w-16 shrink-0" style={{ color: "var(--text-3)" }}>Type</span>
              <span lang="en" className="text-[9px] font-bold tracking-[0.15em] uppercase flex-1" style={{ color: "var(--text-3)" }}>Reason</span>
              <span lang="en" className="text-[9px] font-bold tracking-[0.15em] uppercase w-16 text-right shrink-0" style={{ color: "var(--text-3)" }}>Amount</span>
              <span lang="en" className="text-[9px] font-bold tracking-[0.15em] uppercase w-20 text-right shrink-0" style={{ color: "var(--text-3)" }}>Balance After</span>
              <span lang="en" className="text-[9px] font-bold tracking-[0.15em] uppercase w-24 text-right shrink-0" style={{ color: "var(--text-3)" }}>Date</span>
            </div>
            {creditLogs.slice(0, 10).map(log => (
              <div key={log._id} className="flex items-center gap-4 rounded-lg px-4 py-3" style={{ background: "var(--bg-card)" }}>
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
                <span className="text-sm font-bold font-mono w-16 text-right shrink-0" style={{ color: log.type === "spend" ? "var(--error)" : "var(--success)" }}>
                  {log.type === "spend" ? "-" : "+"}{log.amount}
                </span>
                <span className="text-sm font-mono w-20 text-right shrink-0" style={{ color: "var(--text-1)" }}>{log.balanceAfter}</span>
                <span className="text-xs w-24 text-right shrink-0" style={{ color: "var(--text-3)" }}>{formatDate(log.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Buy Credits */}
      <section className="mb-8">
        <SectionLabel>Buy Credits</SectionLabel>
        {purchaseError && (
          <div className="mb-4 flex items-center justify-between rounded-lg px-4 py-3 text-sm"
            style={{ background: "color-mix(in srgb, var(--error) 8%, transparent)", color: "var(--error)" }}>
            <span>{purchaseError}</span>
            <button onClick={() => setPurchaseError(null)} className="ml-4" style={{ color: "var(--error)" }}>✕</button>
          </div>
        )}
        {packagesUnavailable || packages.length === 0 ? (
          <div className="rounded-lg p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5"
            style={{ background: "var(--bg-card)", border: "1px solid color-mix(in srgb, var(--accent) 15%, transparent)" }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0"
              style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}>✦</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold mb-1" style={{ color: "var(--text-1)" }}>Credit purchases coming soon</p>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
                The payment system is not yet active. Contact us if you need credits.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {packages.map(pkg => {
              const isBuying = purchasing === pkg.id;
              const dollars = (pkg.price / 100).toFixed(2);
              return (
                <div key={pkg.id} className="rounded-lg p-5 flex flex-col gap-4"
                  style={{ background: "var(--bg-card)", border: "1px solid color-mix(in srgb, var(--accent) 12%, transparent)" }}>
                  <div>
                    <p className="text-2xl font-bold font-mono" style={{ color: "var(--accent)" }}>{pkg.credits}</p>
                    <p className="text-[10px] font-bold tracking-[0.2em] uppercase mt-0.5" style={{ color: "var(--text-3)" }}>credits</p>
                  </div>
                  <p className="text-xl font-bold" style={{ color: "var(--text-1)" }}>${dollars}</p>
                  <button
                    onClick={() => handlePurchase(pkg.id)}
                    disabled={!!purchasing}
                    className="w-full py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: isBuying ? "color-mix(in srgb, var(--accent) 60%, transparent)" : "var(--accent)",
                      color: "var(--accent-on)",
                      boxShadow: "0px 0px 16px color-mix(in srgb, var(--accent) 20%, transparent)",
                    }}
                  >
                    {isBuying ? "Redirecting…" : "Buy Now"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Admin section — platform analytics */}
      {isAdmin && (
        <section>
          <SectionLabel>Platform Analytics (Admin)</SectionLabel>

          {adminStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <MetricCard label="Total Users" value={adminStats.users.total} accentValue />
              <MetricCard label="Total Generations" value={adminStats.generations.total} />
              <MetricCard label="Success Rate" value={adminStats.generations.successRate} sub={`${adminStats.generations.failed} failed`} />
              <MetricCard label="Total Uploads" value={adminStats.uploads.total} />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TimeSeriesPanel
              title="Platform Activity (30d)"
              data={adminSeries}
              xKey="date"
              metrics={[
                { key: "generations", label: "Generations" },
                { key: "credits", label: "Credits" },
              ]}
              defaultType="bar"
            />
            {adminDimensions.length > 0 && (
              <DistributionPanel title="Platform Breakdown" dimensions={adminDimensions} defaultType="donut" />
            )}
          </div>
        </section>
      )}
    </div>
  );
}
