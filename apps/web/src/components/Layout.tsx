import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";

const navItems = [
  { to: "/generate",  label: "Generate",  icon: "♪" },
  { to: "/library",   label: "Library",   icon: "◉" },
  { to: "/studio",    label: "Studio",    icon: "◈" },
  { to: "/dashboard", label: "Dashboard", icon: "▦" },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      {/* ── SIDEBAR ────────────────────────────────────────────────────────── */}
      <aside className="w-56 flex flex-col bg-gray-900 border-r border-gray-800">
        {/* Logo */}
        <div className="px-5 py-6 border-b border-gray-800">
          <span className="text-xl font-bold tracking-tight text-white">
            Sonaralabs
          </span>
          <p className="text-xs text-gray-500 mt-0.5">AI Music Studio</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`
              }
            >
              <span className="text-base">{icon}</span>
              {label}
            </NavLink>
          ))}

          {user?.role === "admin" && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`
              }
            >
              <span className="text-base">⚙</span>
              Admin
            </NavLink>
          )}
        </nav>

        {/* Kredi bakiyesi + kullanıcı */}
        <div className="px-4 py-4 border-t border-gray-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Credits</span>
            <span
              data-testid="credit-balance"
              className="text-sm font-semibold text-indigo-400"
            >
              {user?.creditBalance ?? "—"}
            </span>
          </div>

          <div className="text-xs text-gray-500 truncate">{user?.email}</div>

          <button
            data-testid="logout-btn"
            onClick={handleLogout}
            className="w-full text-left text-xs text-gray-500 hover:text-red-400 transition-colors py-1"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ───────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
