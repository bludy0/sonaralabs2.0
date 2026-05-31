import { useRef, useState, useCallback, useEffect } from "react";
import { NavLink, Link, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";
import { useT } from "../store/useI18nStore";
import { SonarLogo } from "./SonarLogo";

const SIDEBAR_MIN     = 52;   // sadece ikonlar
const SIDEBAR_DEFAULT = 220;
const SIDEBAR_MAX     = 340;
const SIDEBAR_ICON_ONLY_THRESHOLD = 130; // bu genişliğin altında label'lar kaybolur
const STORAGE_KEY = "sidebar-width";

export default function Layout() {
  const t = useT();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  // ── Sidebar genişliği ─────────────────────────────────────────────────────
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseInt(saved) : SIDEBAR_DEFAULT;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  const collapsed  = sidebarWidth <= SIDEBAR_ICON_ONLY_THRESHOLD;
  const isDragging = useRef(false);
  const startX     = useRef(0);
  const startWidth = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current     = e.clientX;
    startWidth.current = sidebarWidth;
    document.body.style.cursor    = "col-resize";
    document.body.style.userSelect = "none";
  }, [sidebarWidth]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isDragging.current) return;
      const delta = e.clientX - startX.current;
      const next  = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidth.current + delta));
      setSidebarWidth(next);
    }
    function onMouseUp() {
      if (!isDragging.current) return;
      isDragging.current             = false;
      document.body.style.cursor    = "";
      document.body.style.userSelect = "";
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup",   onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup",   onMouseUp);
    };
  }, []);

  const NAV_ITEMS = [
    { to: "/dashboard", label: t.nav.dashboard, icon: "dashboard"   },
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

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-page)", color: "var(--text-1)" }}>

      {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
      <aside
        style={{
          width: sidebarWidth,
          minWidth: sidebarWidth,
          background: "var(--bg-card)",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          transition: isDragging.current ? "none" : "width 0.15s ease",
          overflow: "hidden",
        }}
      >
        {/* Brand */}
        <Link to="/" style={{ textDecoration: "none" }}>
          <div
            style={{
              padding: collapsed ? "20px 0 16px" : "24px 16px 20px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              justifyContent: collapsed ? "center" : "flex-start",
              transition: "padding 0.15s, justify-content 0.15s",
              opacity: 0.9,
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "0.9")}
          >
            <SonarLogo
              size={32}
              variant={collapsed ? "icon" : "full"}
            />
          </div>
        </Link>

        <div style={{ margin: "0 16px", height: 1, background: "var(--bg-border)", flexShrink: 0 }} />

        {/* Nav */}
        <nav style={{ flex: 1, padding: "16px 12px 8px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
          {NAV_ITEMS.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: collapsed ? 0 : 12,
                justifyContent: collapsed ? "center" : "flex-start",
                padding: collapsed ? "10px 0" : "9px 12px",
                borderRadius: 8,
                background: isActive ? "var(--accent)" : "transparent",
                color:      isActive ? "var(--accent-on)" : "var(--text-2)",
                textDecoration: "none",
                fontSize: "var(--fs-xs)",
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                transition: "background 0.1s, color 0.1s",
                whiteSpace: "nowrap",
                overflow: "hidden",
              })}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "var(--fs-xl)", flexShrink: 0 }}>{icon}</span>
              {!collapsed && label}
            </NavLink>
          ))}

          {user?.role === "admin" && (
            <NavLink
              to="/admin"
              title={collapsed ? t.nav.admin : undefined}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: collapsed ? 0 : 12,
                justifyContent: collapsed ? "center" : "flex-start",
                padding: collapsed ? "10px 0" : "9px 12px",
                borderRadius: 8,
                background: isActive ? "var(--accent)" : "transparent",
                color:      isActive ? "var(--accent-on)" : "var(--text-2)",
                textDecoration: "none",
                fontSize: "var(--fs-xs)",
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                transition: "background 0.1s, color 0.1s",
                whiteSpace: "nowrap",
                overflow: "hidden",
              })}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "var(--fs-xl)", flexShrink: 0 }}>admin_panel_settings</span>
              {!collapsed && t.nav.admin}
            </NavLink>
          )}
        </nav>

        {/* ── ALT PANEL ───────────────────────────────────────────────────── */}
        <div style={{ padding: collapsed ? "12px 8px" : "12px 16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {!collapsed && (
            <div style={{ borderRadius: 8, padding: "10px 12px", background: "var(--bg-input)" }}>
              <p style={{ fontSize: "var(--fs-2xs)", fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--text-2)", marginBottom: 4 }}>
                {t.nav.credits}
              </p>
              <p data-testid="credit-balance" style={{ fontSize: "var(--fs-2xl)", fontWeight: 700, color: "var(--accent)" }}>
                {user?.creditBalance ?? "—"}
              </p>
            </div>
          )}

          {collapsed ? (
            /* Daraltılmış: sadece kredi sayısı + çıkış ikonu */
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: "var(--fs-md)", fontWeight: 700, color: "var(--accent)" }} data-testid="credit-balance">
                {user?.creditBalance ?? "—"}
              </span>
              <button
                data-testid="logout-btn"
                onClick={handleLogout}
                title={t.nav.signOut}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: 4 }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--error)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "var(--fs-lg)" }}>logout</span>
              </button>
            </div>
          ) : (
            <div style={{ paddingLeft: 4, display: "flex", flexDirection: "column", gap: 6 }}>
              <p style={{ fontSize: "var(--fs-xs)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-3)" }}>
                {user?.email}
              </p>
              <button
                data-testid="logout-btn"
                onClick={handleLogout}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: "var(--fs-xs)", fontWeight: 500, letterSpacing: "0.1em",
                  textTransform: "uppercase", color: "var(--text-3)",
                  textAlign: "left", padding: 0,
                }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--error)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
              >
                {t.nav.signOut}
              </button>
            </div>
          )}
        </div>

        {/* ── RESIZE HANDLE ────────────────────────────────────────────────── */}
        <div
          onMouseDown={onMouseDown}
          onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT)}
          title="Sürükle · Çift tıkla: sıfırla"
          style={{
            position: "absolute",
            top: 0, right: 0,
            width: 5,
            height: "100%",
            cursor: "col-resize",
            zIndex: 10,
            background: "transparent",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--accent)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        />
      </aside>

      {/* ── ANA İÇERİK ──────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto" style={{ background: "var(--bg-page)" }}>
        <Outlet />
      </main>
    </div>
  );
}
