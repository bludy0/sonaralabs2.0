import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { formatBytes, formatDate } from "../lib/format";

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


interface StatCardProps {
  label: string;
  value: number | string;
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="rounded-lg p-5" style={{ background: "#131313" }}>
      <p
        className="text-[10px] font-bold tracking-[0.25em] uppercase mb-2"
        style={{ color: "#484848" }}
      >
        {label}
      </p>
      <p className="text-2xl font-bold" style={{ color: "#ffffff" }}>{value}</p>
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
    <div className="min-h-screen p-6" style={{ background: "#0e0e0e", color: "#ffffff" }}>
      {/* Page header */}
      <div className="mb-8">
        <p
          className="text-[10px] font-bold tracking-[0.25em] uppercase mb-2"
          style={{ color: "#484848" }}
        >
          SONARALABS / ADMIN
        </p>
        <h1
          className="text-2xl font-bold uppercase"
          style={{ color: "#ffffff", letterSpacing: "-0.01em" }}
        >
          Admin Panel
        </h1>
      </div>

      {error && (
        <div
          className="mb-5 rounded px-4 py-3 text-sm"
          style={{ background: "rgba(255,115,81,0.08)", color: "#ff7351" }}
        >
          {error}
        </div>
      )}

      {/* Stats cards */}
      {statsLoading ? (
        <div className="mb-8 text-sm" style={{ color: "#484848" }}>Loading stats...</div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Users" value={stats.totalUsers ?? 0} />
          <StatCard label="Total Generations" value={stats.generations?.total ?? 0} />
          <StatCard label="Completed" value={stats.generations?.done ?? 0} />
          <StatCard label="Failed" value={stats.generations?.failed ?? 0} />
        </div>
      ) : null}

      {/* Daily stats */}
      <section className="mb-8">
        <p
          className="text-[10px] font-bold tracking-[0.25em] uppercase mb-4"
          style={{ color: "#484848" }}
        >
          Daily Stats (last 30 days)
        </p>
        {daily.length === 0 ? (
          <p className="text-sm" style={{ color: "#484848" }}>No data.</p>
        ) : (
          <div className="space-y-1.5">
            {/* Header row */}
            <div className="flex items-center gap-4 px-4 py-2">
              <span className="text-[9px] font-bold tracking-[0.15em] uppercase flex-1" style={{ color: "#484848" }}>Date</span>
              <span className="text-[9px] font-bold tracking-[0.15em] uppercase w-28 text-right shrink-0" style={{ color: "#484848" }}>Generations</span>
              <span className="text-[9px] font-bold tracking-[0.15em] uppercase w-28 text-right shrink-0" style={{ color: "#484848" }}>Credits Spent</span>
            </div>
            {daily.map(row => (
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

      {/* Users table */}
      <section>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <p
            className="text-[10px] font-bold tracking-[0.25em] uppercase"
            style={{ color: "#484848" }}
          >
            Users{userTotal > 0 ? ` (${userTotal})` : ""}
          </p>
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search by email..."
            className="rounded-lg px-3 py-2 text-sm focus:outline-none w-64"
            style={{
              background: "#1f2937",
              color: "#ffffff",
              border: "none",
            }}
            onFocus={e => (e.currentTarget.style.boxShadow = "0 0 0 1px #ffdd73")}
            onBlur={e => (e.currentTarget.style.boxShadow = "none")}
          />
        </div>

        {usersLoading ? (
          <div className="text-sm py-8 text-center" style={{ color: "#484848" }}>Loading users...</div>
        ) : users.length === 0 ? (
          <p className="text-sm" style={{ color: "#484848" }}>No users found.</p>
        ) : (
          <div className="space-y-1.5">
            {/* Header row */}
            <div className="flex items-center gap-4 px-4 py-2">
              <span className="text-[9px] font-bold tracking-[0.15em] uppercase flex-1" style={{ color: "#484848" }}>Email</span>
              <span className="text-[9px] font-bold tracking-[0.15em] uppercase w-16 shrink-0" style={{ color: "#484848" }}>Role</span>
              <span className="text-[9px] font-bold tracking-[0.15em] uppercase w-16 text-right shrink-0" style={{ color: "#484848" }}>Credits</span>
              <span className="text-[9px] font-bold tracking-[0.15em] uppercase w-20 text-right shrink-0" style={{ color: "#484848" }}>Storage</span>
              <span className="text-[9px] font-bold tracking-[0.15em] uppercase w-24 shrink-0" style={{ color: "#484848" }}>Registered</span>
              <span className="text-[9px] font-bold tracking-[0.15em] uppercase w-28 shrink-0" style={{ color: "#484848" }}>Change Role</span>
            </div>
            {users.map(u => (
              <div
                key={u._id}
                className="flex items-center gap-4 rounded-lg px-4 py-3"
                style={{ background: "#131313" }}
              >
                <span className="flex-1 text-sm truncate" style={{ color: "#ffffff" }}>
                  {u.email}
                </span>
                <div className="w-16 shrink-0">
                  <span
                    className="text-[9px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 rounded"
                    style={
                      u.role === "admin"
                        ? { background: "rgba(255,221,115,0.1)", color: "#ffdd73" }
                        : { background: "#1f2937", color: "#484848" }
                    }
                  >
                    {u.role}
                  </span>
                </div>
                <span className="text-sm w-16 text-right shrink-0" style={{ color: "#ffffff" }}>
                  {u.creditBalance}
                </span>
                <span className="text-sm w-20 text-right shrink-0" style={{ color: "#484848" }}>
                  {formatBytes(u.storageUsed ?? 0)}
                </span>
                <span className="text-xs w-24 shrink-0" style={{ color: "#484848" }}>
                  {formatDate(u.createdAt)}
                </span>
                <div className="w-28 shrink-0 flex items-center gap-2">
                  <select
                    value={u.role}
                    disabled={roleUpdating === u._id}
                    onChange={e =>
                      handleRoleChange(u._id, e.target.value as "user" | "admin")
                    }
                    className="rounded-lg px-2 py-1 text-sm focus:outline-none disabled:opacity-50"
                    style={{ background: "#1f2937", color: "#ababab", border: "none" }}
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                  {roleUpdating === u._id && (
                    <span className="text-xs" style={{ color: "#484848" }}>Saving...</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {userPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={() => setUserPage(p => Math.max(1, p - 1))}
              disabled={userPage === 1 || usersLoading}
              className="px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-40"
              style={{ background: "#1f2937", color: "#ababab" }}
            >
              Previous
            </button>
            <span className="text-sm" style={{ color: "#484848" }}>
              Page {userPage} of {userPages}
            </span>
            <button
              onClick={() => setUserPage(p => Math.min(userPages, p + 1))}
              disabled={userPage === userPages || usersLoading}
              className="px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-40"
              style={{ background: "#1f2937", color: "#ababab" }}
            >
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
