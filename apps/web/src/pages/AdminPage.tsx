import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { formatBytes, formatDate } from "../lib/format";
import { toast } from "../lib/toast";

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

interface AdminGeneration {
  _id: string;
  userId: string;
  prompt: string;
  provider: string;
  status: string;
  duration?: number;
  creditCost?: number;
  createdAt: string;
}

interface StatCardProps {
  label: string;
  value: number | string;
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="rounded-lg p-5" style={{ background: "var(--bg-card)" }}>
      <p
        className="text-[10px] font-bold tracking-[0.25em] uppercase mb-2"
        style={{ color: "var(--text-3)" }}
      >
        {label}
      </p>
      <p className="text-2xl font-bold" style={{ color: "var(--text-1)" }}>{value}</p>
    </div>
  );
}

type AdminTab = "users" | "generations";
type GenStatus = "all" | "pending" | "processing" | "done" | "failed";

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>("users");
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
  // Generations tab state
  const [generations, setGenerations] = useState<AdminGeneration[]>([]);
  const [genTotal, setGenTotal] = useState(0);
  const [genPage, setGenPage] = useState(1);
  const [genPages, setGenPages] = useState(1);
  const [genStatus, setGenStatus] = useState<GenStatus>("all");
  const [gensLoading, setGensLoading] = useState(false);

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

  const loadStats = useCallback(async () => {
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
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

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

  const loadGenerations = useCallback(async (page: number, status: GenStatus) => {
    setGensLoading(true);
    try {
      const params: Record<string, unknown> = { page };
      if (status !== "all") params.status = status;
      const { data } = await api.get("/api/admin/generations", { params });
      const payload = data?.data ?? data;
      setGenerations(payload?.items ?? []);
      setGenTotal(payload?.total ?? 0);
      setGenPages(payload?.pages ?? 1);
    } catch {
      toast("Generations could not be loaded.", "error");
    } finally {
      setGensLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "generations") loadGenerations(genPage, genStatus);
  }, [activeTab, genPage, genStatus, loadGenerations]);

  async function handleRoleChange(userId: string, newRole: "user" | "admin") {
    setRoleUpdating(userId);
    try {
      await api.patch(`/api/admin/users/${userId}/role`, { role: newRole });
      setUsers(prev =>
        prev.map(u => (u._id === userId ? { ...u, role: newRole } : u))
      );
    } catch {
      toast("Role could not be updated.", "error");
    } finally {
      setRoleUpdating(null);
    }
  }

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--bg-page)", color: "var(--text-1)" }}>
      {/* Page header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p
            className="text-[10px] font-bold tracking-[0.25em] uppercase mb-2"
            style={{ color: "var(--text-3)" }}
          >
            SONARALABS / ADMIN
          </p>
          <h1
            lang="en"
            className="text-2xl font-bold uppercase"
            style={{ color: "var(--text-1)", letterSpacing: "-0.01em" }}
          >
            Admin Panel
          </h1>
        </div>
        <button
          onClick={loadStats}
          disabled={statsLoading}
          className="px-4 py-2 rounded-lg text-xs font-bold tracking-widest uppercase transition-opacity disabled:opacity-40"
          style={{ background: "var(--bg-card)", color: "var(--text-2)" }}
        >
          {statsLoading ? "Refreshing…" : "↺ Refresh Stats"}
        </button>
      </div>

      {error && (
        <div
          className="mb-5 rounded px-4 py-3 text-sm"
          style={{ background: "color-mix(in srgb, var(--error) 8%, transparent)", color: "var(--error)" }}
        >
          {error}
        </div>
      )}

      {/* Stats cards */}
      {statsLoading ? (
        <div className="mb-8 text-sm" style={{ color: "var(--text-3)" }}>Loading stats...</div>
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
          lang="en"
          className="text-[10px] font-bold tracking-[0.25em] uppercase mb-4"
          style={{ color: "var(--text-3)" }}
        >
          Daily Stats (last 30 days)
        </p>
        {daily.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-3)" }}>No data.</p>
        ) : (() => {
          const maxCount = Math.max(...daily.map(r => r.count), 1);
          return (
            <div className="space-y-1.5">
              {daily.map(row => (
                <div
                  key={row._id}
                  className="flex items-center gap-3 rounded-lg px-4 py-2.5"
                  style={{ background: "var(--bg-card)" }}
                >
                  <span className="text-xs w-24 shrink-0" style={{ color: "var(--text-3)" }}>{row._id}</span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-input)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${(row.count / maxCount) * 100}%`, background: "var(--accent)" }}
                    />
                  </div>
                  <span className="text-xs w-8 text-right shrink-0 font-medium" style={{ color: "var(--text-1)" }}>{row.count}</span>
                  <span className="text-[10px] w-20 text-right shrink-0" style={{ color: "var(--text-3)" }}>{row.credits} cr</span>
                </div>
              ))}
            </div>
          );
        })()}
      </section>

      {/* Tab nav */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg w-fit" style={{ background: "var(--bg-card)" }}>
        {(["users", "generations"] as AdminTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-4 py-1.5 rounded-md text-xs font-bold tracking-widest uppercase transition-all duration-100"
            style={
              activeTab === tab
                ? { background: "var(--accent)", color: "var(--accent-on)" }
                : { color: "var(--text-3)" }
            }
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Users table */}
      <section style={{ display: activeTab === "users" ? undefined : "none" }}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <p
            className="text-[10px] font-bold tracking-[0.25em] uppercase"
            style={{ color: "var(--text-3)" }}
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
              background: "var(--bg-input)",
              color: "var(--text-1)",
              border: "none",
            }}
            onFocus={e => (e.currentTarget.style.boxShadow = "0 0 0 1px var(--accent)")}
            onBlur={e => (e.currentTarget.style.boxShadow = "none")}
          />
        </div>

        {usersLoading ? (
          <div className="text-sm py-8 text-center" style={{ color: "var(--text-3)" }}>Loading users...</div>
        ) : users.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-3)" }}>No users found.</p>
        ) : (
          <div className="space-y-1.5">
            {/* Header row */}
            <div className="flex items-center gap-4 px-4 py-2">
              <span lang="en" className="text-[9px] font-bold tracking-[0.15em] uppercase flex-1" style={{ color: "var(--text-3)" }}>Email</span>
              <span lang="en" className="text-[9px] font-bold tracking-[0.15em] uppercase w-16 shrink-0" style={{ color: "var(--text-3)" }}>Role</span>
              <span lang="en" className="text-[9px] font-bold tracking-[0.15em] uppercase w-16 text-right shrink-0" style={{ color: "var(--text-3)" }}>Credits</span>
              <span lang="en" className="text-[9px] font-bold tracking-[0.15em] uppercase w-20 text-right shrink-0" style={{ color: "var(--text-3)" }}>Storage</span>
              <span lang="en" className="text-[9px] font-bold tracking-[0.15em] uppercase w-24 shrink-0" style={{ color: "var(--text-3)" }}>Registered</span>
              <span lang="en" className="text-[9px] font-bold tracking-[0.15em] uppercase w-28 shrink-0" style={{ color: "var(--text-3)" }}>Change Role</span>
            </div>
            {users.map(u => (
              <div
                key={u._id}
                className="flex items-center gap-4 rounded-lg px-4 py-3"
                style={{ background: "var(--bg-card)" }}
              >
                <span className="flex-1 text-sm truncate" style={{ color: "var(--text-1)" }}>
                  {u.email}
                </span>
                <div className="w-16 shrink-0">
                  <span
                    className="text-[9px] font-bold tracking-[0.15em] uppercase px-2 py-0.5 rounded"
                    style={
                      u.role === "admin"
                        ? { background: "color-mix(in srgb, var(--accent) 10%, transparent)", color: "var(--accent)" }
                        : { background: "var(--bg-input)", color: "var(--text-3)" }
                    }
                  >
                    {u.role}
                  </span>
                </div>
                <span className="text-sm w-16 text-right shrink-0" style={{ color: "var(--text-1)" }}>
                  {u.creditBalance}
                </span>
                <span className="text-sm w-20 text-right shrink-0" style={{ color: "var(--text-3)" }}>
                  {formatBytes(u.storageUsed ?? 0)}
                </span>
                <span className="text-xs w-24 shrink-0" style={{ color: "var(--text-3)" }}>
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
                    style={{ background: "var(--bg-input)", color: "var(--text-2)", border: "none" }}
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                  {roleUpdating === u._id && (
                    <span className="text-xs" style={{ color: "var(--text-3)" }}>Saving...</span>
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
              style={{ background: "var(--bg-input)", color: "var(--text-2)" }}
            >
              Previous
            </button>
            <span className="text-sm" style={{ color: "var(--text-3)" }}>
              Page {userPage} of {userPages}
            </span>
            <button
              onClick={() => setUserPage(p => Math.min(userPages, p + 1))}
              disabled={userPage === userPages || usersLoading}
              className="px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-40"
              style={{ background: "var(--bg-input)", color: "var(--text-2)" }}
            >
              Next
            </button>
          </div>
        )}
      </section>

      {/* Generations table */}
      {activeTab === "generations" && (
        <section>
          {/* Status filter */}
          <div className="flex gap-1 mb-4 flex-wrap">
            {(["all", "pending", "processing", "done", "failed"] as GenStatus[]).map(s => (
              <button
                key={s}
                onClick={() => { setGenStatus(s); setGenPage(1); }}
                className="px-3 py-1 rounded-lg text-[10px] font-bold tracking-widest uppercase transition-all duration-100"
                style={
                  genStatus === s
                    ? { background: "var(--accent)", color: "var(--accent-on)" }
                    : { background: "var(--bg-card)", color: "var(--text-3)" }
                }
              >
                {s}
              </button>
            ))}
            <span className="ml-auto text-xs self-center" style={{ color: "var(--text-3)" }}>
              {genTotal} total
            </span>
          </div>

          {gensLoading ? (
            <div className="text-sm py-8 text-center" style={{ color: "var(--text-3)" }}>Loading...</div>
          ) : generations.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-3)" }}>No generations found.</p>
          ) : (
            <div className="space-y-1.5">
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-2">
                <span lang="en" className="text-[9px] font-bold tracking-[0.15em] uppercase flex-1" style={{ color: "var(--text-3)" }}>Prompt</span>
                <span lang="en" className="text-[9px] font-bold tracking-[0.15em] uppercase w-20 shrink-0" style={{ color: "var(--text-3)" }}>Provider</span>
                <span lang="en" className="text-[9px] font-bold tracking-[0.15em] uppercase w-20 shrink-0" style={{ color: "var(--text-3)" }}>Status</span>
                <span lang="en" className="text-[9px] font-bold tracking-[0.15em] uppercase w-12 text-right shrink-0" style={{ color: "var(--text-3)" }}>Cr</span>
                <span lang="en" className="text-[9px] font-bold tracking-[0.15em] uppercase w-24 shrink-0" style={{ color: "var(--text-3)" }}>Date</span>
              </div>
              {generations.map(g => (
                <div
                  key={g._id}
                  className="flex items-center gap-3 rounded-lg px-4 py-3"
                  style={{ background: "var(--bg-card)" }}
                >
                  <span className="flex-1 text-xs truncate" style={{ color: "var(--text-1)" }} title={g.prompt}>
                    {g.prompt}
                  </span>
                  <span className="text-[10px] w-20 shrink-0 font-medium" style={{ color: "var(--text-2)" }}>{g.provider}</span>
                  <span
                    className="text-[9px] w-20 shrink-0 font-bold tracking-wide uppercase px-2 py-0.5 rounded"
                    style={
                      g.status === "done"       ? { background: "color-mix(in srgb, var(--teal) 10%, transparent)", color: "var(--teal)" }
                      : g.status === "failed"   ? { background: "color-mix(in srgb, var(--error) 10%, transparent)", color: "var(--error)" }
                      : g.status === "processing" ? { background: "color-mix(in srgb, var(--accent) 10%, transparent)", color: "var(--accent)" }
                      : { background: "var(--bg-input)", color: "var(--text-3)" }
                    }
                  >
                    {g.status}
                  </span>
                  <span className="text-xs w-12 text-right shrink-0" style={{ color: "var(--text-3)" }}>{g.creditCost ?? "—"}</span>
                  <span className="text-xs w-24 shrink-0" style={{ color: "var(--text-3)" }}>{formatDate(g.createdAt)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {genPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => setGenPage(p => Math.max(1, p - 1))}
                disabled={genPage === 1 || gensLoading}
                className="px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-40"
                style={{ background: "var(--bg-input)", color: "var(--text-2)" }}
              >
                Previous
              </button>
              <span className="text-sm" style={{ color: "var(--text-3)" }}>
                Page {genPage} of {genPages}
              </span>
              <button
                onClick={() => setGenPage(p => Math.min(genPages, p + 1))}
                disabled={genPage === genPages || gensLoading}
                className="px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-40"
                style={{ background: "var(--bg-input)", color: "var(--text-2)" }}
              >
                Next
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
