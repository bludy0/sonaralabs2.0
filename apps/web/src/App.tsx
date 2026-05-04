import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "./store/useAuthStore";
import Layout from "./components/Layout";
import { ThemeProvider } from "./components/ThemeProvider";
import { ToastContainer } from "./components/ToastContainer";

// Pages
import WelcomePage          from "./pages/WelcomePage";
import LoginPage             from "./pages/LoginPage";
import RegisterPage          from "./pages/RegisterPage";
import VerifyEmailPage       from "./pages/VerifyEmailPage";
import ForgotPasswordPage    from "./pages/ForgotPasswordPage";
import ResetPasswordPage     from "./pages/ResetPasswordPage";
import GeneratePage from "./pages/GeneratePage";
import LibraryPage  from "./pages/LibraryPage";
import DashboardPage from "./pages/DashboardPage";
import AdminPage    from "./pages/AdminPage";
import StudioPage   from "./pages/StudioPage";
import ExplorePage  from "./pages/ExplorePage";
import ProfilePage  from "./pages/ProfilePage";
import FeedPage     from "./pages/FeedPage";
import SettingsPage from "./pages/SettingsPage";

// ── PROTECTED ROUTE ───────────────────────────────────────────────────────────
function ProtectedRoute() {
  const user = useAuthStore(s => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

// ── ADMIN ROUTE ───────────────────────────────────────────────────────────────
function AdminRoute() {
  const user = useAuthStore(s => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

// ── APP ROOT ──────────────────────────────────────────────────────────────────
export default function App() {
  const { user, fetchMe } = useAuthStore();

  useEffect(() => {
    if (!user) fetchMe();
  }, []);

  return (
    <ThemeProvider>
      <ToastContainer />
      <BrowserRouter>
        <Routes>
          {/* Auth sayfaları */}
          <Route path="/login"            element={<LoginPage />} />
          <Route path="/register"         element={<RegisterPage />} />
          <Route path="/verify-email"     element={<VerifyEmailPage />} />
          <Route path="/forgot-password"  element={<ForgotPasswordPage />} />
          <Route path="/reset-password"   element={<ResetPasswordPage />} />

          {/* Public (auth gerekmez, Layout var) */}
          <Route element={<Layout />}>
            <Route path="/explore"           element={<ExplorePage />} />
            <Route path="/profile/:username" element={<ProfilePage />} />
          </Route>

          {/* Studio share — tam sayfa, auth yok */}
          <Route path="/studio/share/:token" element={<StudioPage />} />

          {/* Korumalı route'lar */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/generate"  element={<GeneratePage />} />
              <Route path="/library"   element={<LibraryPage />} />
              <Route path="/feed"      element={<FeedPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/settings"  element={<SettingsPage />} />

              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<AdminPage />} />
              </Route>
            </Route>

            {/* Studio — tam sayfa, Layout dışında */}
            <Route path="/studio" element={<StudioPage />} />
          </Route>

          <Route path="/" element={<WelcomePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
