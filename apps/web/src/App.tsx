import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "./store/useAuthStore";
import Layout from "./components/Layout";

// Pages (lazy-loaded)
import LoginPage    from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import GeneratePage from "./pages/GeneratePage";
import LibraryPage  from "./pages/LibraryPage";
import DashboardPage from "./pages/DashboardPage";
import AdminPage    from "./pages/AdminPage";
import StudioPage   from "./pages/StudioPage";

// ── PROTECTED ROUTE — auth yoksa /login'e yönlendir ──────────────────────────
function ProtectedRoute() {
  const user = useAuthStore(s => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

// ── ADMIN ROUTE — role !== "admin" ise /dashboard'a yönlendir ────────────────
function AdminRoute() {
  const user = useAuthStore(s => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

// ── APP ROOT ──────────────────────────────────────────────────────────────────
export default function App() {
  const { user, fetchMe } = useAuthStore();

  // Uygulama açılışında oturumu doğrula
  useEffect(() => {
    if (!user) fetchMe();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        {/* Korumasız route'lar */}
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Korumalı route'lar — Layout içinde */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/generate"  element={<GeneratePage />} />
            <Route path="/library"   element={<LibraryPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />

            {/* Admin route */}
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<AdminPage />} />
            </Route>
          </Route>

          {/* Studio — full-page, Layout dışında */}
          <Route path="/studio" element={<StudioPage />} />
        </Route>

        {/* Default yönlendirme */}
        <Route path="/" element={<Navigate to="/generate" replace />} />
        <Route path="*" element={<Navigate to="/generate" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
