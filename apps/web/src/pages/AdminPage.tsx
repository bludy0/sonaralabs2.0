import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

interface PlatformStats {
  totalUsers?: number;
  generations?: {
    total?: number;
    done?: number;
    failed?: number;
  };
  [key: string]: unknown;
}

interface DailyStatRow {
  _id: string;   // "2026-03-01"
  count: number;
  credits: number;
}

interface AdminUser {
  _id: string;
  email: string;
  role: "user" | "admin";
  creditBalance: number;
  storageUsed: number;
  createdAt: string;
}

function formatBytes(bytes: number): string {
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

interface StatCardProps {
  label: string;
  value: number | string;
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-100">{value}</p>
    </div>
  );
}

export default function AdminPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [daily, setDaily] = useState<DailyStatRow[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userPage, setUserPage] = useState(1);
  const [userPages, setUserPages] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statsLoading, setStatsLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);
  const [roleUpdating, setRoleUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput);
      setUserPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // Load platform stats and daily stats on mount
  useEffect(() => {
    async function loadStats() {
      setStatsLoading(true);
      setError(null);
      try {
        const [statsRes, dailyRes] = await Promise.all([
          api.get("/api/admin/stats"),
          api.get("/api/admin/stats/daily"),
        ]);
        setStats(statsRes.data?.data ?? statsRes.data ?? {});
        setDaily(dailyRes.data?.data ?? dailyRes.data ?? []);
      } catch {
        setError("Stats could not be loaded.");
      } finally {
        setStatsLoading(false);
      }
    }
    loadStats();
  }, []);

  // Load users when page or search changes
  const loadUsers = useCallback(async (page: number, q: string) => {
    setUsersLoading(true);
    try {
      const { data } = await api.get("/api/admin/users", {
        params: { page, search: q || undefined },
      });
      const payload = data?.data ?? data;
      setUsers(payload?.users ?? payload ?? []);
      setUserTotal(payload?.total ?? 0);
      setUserPages(payload?.pages ?? 1);
    } catch {
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers(userPage, search);
  }, [userPage, search, loadUsers]);

  async function handleRoleChange(userId: string, newRole: "user" | "admin") {
    setRoleUpdating(userId);
    try {
      await api.patch(`/api/admin/users/${userId}/role`, { role: newRole });
      setUsers(prev =>
        prev.map(u => (u._id === userId ? { ...u, role: newRole } : u))
      );
    } catch {
      alert("Role could not be updated.");
    } finally {
      setRoleUpdating(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <h1 className="text-2xl font-bold mb-6">Admin Panel</h1>

      {error && (
        <div className="mb-5 bg-red-900/40 border border-red-700 rounded px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Stats cards */}
      {statsLoading ? (
        <div className="text-gray-500 mb-8">Loading stats...</div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Users" value={stats.totalUsers ?? 0} />
          <StatCard label="Total Generations" value={stats.generations?.total ?? 0} />
          <StatCard label="Completed" value={stats.generations?.done ?? 0} />
          <StatCard label="Failed" value={stats.generations?.failed ?? 0} />
        </div>
      ) : null}

      {/* Daily stats table */}
      <section className="mb-8">
        <h2 className="text-base font-semibold mb-3 text-gray-300">
          Daily Stats (last 30 days)
        </h2>
        {daily.length === 0 ? (
          <p className="text-gray-500 text-sm">No data.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-left">
                  <th className="py-2 pr-8 font-medium">Date</th>
                  <th className="py-2 pr-8 font-medium text-right">Generations</th>
                  <th className="py-2 font-medium text-right">Credits Spent</th>
                </tr>
              </thead>
              <tbody>
                {daily.map(row => (
                  <tr
                    key={row._id}
                    className="border-b border-gray-800/50 hover:bg-gray-900 transition-colors"
                  >
                    <td className="py-2 pr-8 text-gray-300">{row._id}</td>
                    <td className="py-2 pr-8 text-right text-gray-200">{row.count}</td>
                    <td className="py-2 text-right text-gray-200">{row.credits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Users table */}
      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <h2 className="text-base font-semibold text-gray-300">
            Users{userTotal > 0 ? ` (${userTotal})` : ""}
          </h2>
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search by email..."
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 w-64"
          />
        </div>

        {usersLoading ? (
          <div className="text-gray-500 text-sm py-8 text-center">Loading users...</div>
        ) : users.length === 0 ? (
          <p className="text-gray-500 text-sm">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-left">
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 pr-4 font-medium">Role</th>
                  <th className="py-2 pr-4 font-medium text-right">Credits</th>
                  <th className="py-2 pr-4 font-medium text-right">Storage</th>
                  <th className="py-2 pr-4 font-medium">Registered</th>
                  <th className="py-2 font-medium">Change Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr
                    key={u._id}
                    className="border-b border-gray-800/50 hover:bg-gray-900 transition-colors"
                  >
                    <td className="py-2.5 pr-4 text-gray-200 max-w-[200px] truncate">
                      {u.email}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium ${
                          u.role === "admin"
                            ? "bg-indigo-800 text-indigo-200"
                            : "bg-gray-700 text-gray-300"
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-right text-gray-200">
                      {u.creditBalance}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-gray-400">
                      {formatBytes(u.storageUsed ?? 0)}
                    </td>
                    <td className="py-2.5 pr-4 text-gray-400">
                      {formatDate(u.createdAt)}
                    </td>
                    <td className="py-2.5">
                      <select
                        value={u.role}
                        disabled={roleUpdating === u._id}
                        onChange={e =>
                          handleRoleChange(u._id, e.target.value as "user" | "admin")
                        }
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                      {roleUpdating === u._id && (
                        <span className="ml-2 text-xs text-gray-500">Saving...</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {userPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={() => setUserPage(p => Math.max(1, p - 1))}
              disabled={userPage === 1 || usersLoading}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded text-sm transition-colors"
            >
              Previous
            </button>
            <span className="text-sm text-gray-400">
              Page {userPage} of {userPages}
            </span>
            <button
              onClick={() => setUserPage(p => Math.min(userPages, p + 1))}
              disabled={userPage === userPages || usersLoading}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded text-sm transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
