import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "./store/useAuthStore";
import Layout from "./components/Layout";
import { ThemeProvider } from "./components/ThemeProvider";
import { ToastContainer } from "./components/ToastContainer";

// Critical path — loaded eagerly (used on initial render)
import WelcomePage       from "./pages/WelcomePage";
import LoginPage         from "./pages/LoginPage";
import RegisterPage      from "./pages/RegisterPage";

// Deferred — lazy-loaded on first navigation
const VerifyEmailPage    = lazy(() => import("./pages/VerifyEmailPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage  = lazy(() => import("./pages/ResetPasswordPage"));
const GeneratePage       = lazy(() => import("./pages/GeneratePage"));
const LibraryPage        = lazy(() => import("./pages/LibraryPage"));
const DashboardPage      = lazy(() => import("./pages/DashboardPage"));
const AdminPage          = lazy(() => import("./pages/AdminPage"));
const StudioPage         = lazy(() => import("./pages/StudioPage"));
const ExplorePage        = lazy(() => import("./pages/ExplorePage"));
const ProfilePage        = lazy(() => import("./pages/ProfilePage"));
const FeedPage           = lazy(() => import("./pages/FeedPage"));
const SettingsPage       = lazy(() => import("./pages/SettingsPage"));

// ── PROTECTED ROUTE ───────────────────────────────────────────────────────────
function ProtectedRoute() {
  const user      = useAuthStore(s => s.user);
  const isLoading = useAuthStore(s => s.isLoading);
  if (isLoading) return null; // fetchMe() bitmeden karar verme
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

// ── ADMIN ROUTE ───────────────────────────────────────────────────────────────
function AdminRoute() {
  const user      = useAuthStore(s => s.user);
  const isLoading = useAuthStore(s => s.isLoading);
  if (isLoading) return null;
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
        <Suspense fallback={null}>
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
        </Suspense>
      </BrowserRouter>
    </ThemeProvider>
  );
}
