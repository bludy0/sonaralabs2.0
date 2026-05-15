import { NavLink, Link, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";
import { useT } from "../store/useI18nStore";

export default function Layout() {
  const t = useT();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const NAV_ITEMS = [
    { to: "/generate", label: t.nav.generate, icon: "graphic_eq"    },
    { to: "/library",  label: t.nav.library,  icon: "library_music" },
    { to: "/studio",   label: t.nav.studio,   icon: "piano"         },
    { to: "/explore",  label: t.nav.explore,  icon: "explore"       },
    { to: "/feed",     label: t.nav.feed,     icon: "dynamic_feed"  },
    { to: "/settings", label: t.nav.settings, icon: "settings"      },
  ];

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  const navLinkBase = [
    "flex items-center gap-3 px-3 py-2.5 rounded-lg",
    "text-[11px] font-semibold tracking-[0.12em] uppercase",
    "transition-all duration-100",
  ].join(" ");

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-page)", color: "var(--text-1)" }}>

      {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
      <aside className="w-[220px] flex flex-col shrink-0" style={{ background: "var(--bg-card)" }}>

        {/* Brand */}
        <Link to="/" style={{ textDecoration: "none" }}>
          <div className="px-4 pt-6 pb-5 flex items-center gap-2.5 transition-opacity hover:opacity-75">
            <img src="/SONARALABS.png" alt="Sonaralabs" className="h-8 w-auto shrink-0" />
            <p className="text-[13px] font-black tracking-tight uppercase" style={{ color: "var(--text-1)" }}>
              Sonaralabs
            </p>
          </div>
        </Link>

        <div className="mx-5 h-px" style={{ background: "var(--bg-border)" }} />

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={navLinkBase}
              style={({ isActive }) => ({
                background: isActive ? "var(--accent)" : "transparent",
                color:      isActive ? "var(--accent-on)" : "var(--text-2)",
              })}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{icon}</span>
              {label}
            </NavLink>
          ))}

          {user?.role === "admin" && (
            <NavLink
              to="/admin"
              className={navLinkBase}
              style={({ isActive }) => ({
                background: isActive ? "var(--accent)" : "transparent",
                color:      isActive ? "var(--accent-on)" : "var(--text-2)",
              })}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>admin_panel_settings</span>
              {t.nav.admin}
            </NavLink>
          )}
        </nav>

        {/* ── ALT PANEL ───────────────────────────────────────────────────── */}
        <div className="px-4 pb-5 space-y-3">
          <div className="rounded-lg px-3 py-3" style={{ background: "var(--bg-input)" }}>
            <p className="text-[9px] font-semibold tracking-[0.2em] uppercase mb-1" style={{ color: "var(--text-2)" }}>
              {t.nav.credits}
            </p>
            <p data-testid="credit-balance" className="text-2xl font-bold" style={{ color: "var(--accent)" }}>
              {user?.creditBalance ?? "—"}
            </p>
          </div>

          <div className="px-1 space-y-1.5">
            <p className="text-[10px] truncate" style={{ color: "var(--text-3)" }}>{user?.email}</p>
            <button
              data-testid="logout-btn"
              onClick={handleLogout}
              className="text-[10px] font-medium tracking-widest uppercase transition-colors duration-100"
              style={{ color: "var(--text-3)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--error)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
            >
              {t.nav.signOut}
            </button>
          </div>
        </div>
      </aside>

      {/* ── ANA İÇERİK ──────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto" style={{ background: "var(--bg-page)" }}>
        <Outlet />
      </main>
    </div>
  );
}
