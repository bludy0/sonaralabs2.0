import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuthStore } from "../store/useAuthStore";

interface GenerationItem {
  _id: string;
  prompt?: string;
  status: "pending" | "processing" | "done" | "failed";
  provider?: string;
  duration?: number;
  createdAt: string;
}

interface DailyStatRow {
  _id: string;   // "2026-03-01"
  count: number;
  credits: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const statusColor: Record<string, string> = {
  done: "bg-green-700 text-green-100",
  failed: "bg-red-800 text-red-100",
  processing: "bg-yellow-700 text-yellow-100",
  pending: "bg-gray-700 text-gray-200",
};

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
}

function MetricCard({ label, value, sub }: MetricCardProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-100">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const user = useAuthStore(s => s.user);

  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [historyItems, setHistoryItems] = useState<GenerationItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [dailyStats, setDailyStats] = useState<DailyStatRow[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [balanceRes, historyRes] = await Promise.all([
          api.get("/api/credits/balance"),
          api.get("/api/generate/history"),
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Credit Balance"
          value={creditBalance ?? user?.creditBalance ?? 0}
          sub="credits available"
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
        <h2 className="text-base font-semibold mb-3 text-gray-300">Recent Activity</h2>
        {recentItems.length === 0 ? (
          <p className="text-gray-500 text-sm">No generations yet.</p>
        ) : (
          <ul className="space-y-2">
            {recentItems.map(item => (
              <li
                key={item._id}
                className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3"
              >
                <span
                  className={`text-xs px-2 py-0.5 rounded shrink-0 ${
                    statusColor[item.status] ?? "bg-gray-700 text-gray-300"
                  }`}
                >
                  {item.status}
                </span>
                <p className="flex-1 text-sm text-gray-200 truncate">
                  {item.prompt?.slice(0, 80) ?? "—"}
                </p>
                <span className="text-xs text-gray-500 shrink-0">
                  {formatDate(item.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Admin section — daily stats table */}
      {isAdmin && (
        <section>
          <h2 className="text-base font-semibold mb-3 text-gray-300">
            Daily Stats (last 30 days)
          </h2>
          {dailyStats.length === 0 ? (
            <p className="text-gray-500 text-sm">No data available.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400 text-left">
                    <th className="py-2 pr-6 font-medium">Date</th>
                    <th className="py-2 pr-6 font-medium text-right">Generations</th>
                    <th className="py-2 font-medium text-right">Credits Spent</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyStats.map(row => (
                    <tr
                      key={row._id}
                      className="border-b border-gray-800/50 hover:bg-gray-900 transition-colors"
                    >
                      <td className="py-2 pr-6 text-gray-300">{row._id}</td>
                      <td className="py-2 pr-6 text-right text-gray-200">{row.count}</td>
                      <td className="py-2 text-right text-gray-200">{row.credits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
