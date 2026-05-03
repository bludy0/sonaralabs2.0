// frontend/src/lib/api.ts
import axios, { AxiosError } from "axios";

const BASE = import.meta.env.VITE_API_BASE_URL || "";

export const api = axios.create({
  baseURL: BASE,
  withCredentials: true,  // httpOnly cookie'ler için
  headers: { "Content-Type": "application/json" },
});

// ─── Response interceptor — access token expiry → refresh ────────────────────
let isRefreshing = false;
let failedQueue: Array<{ resolve: (v: any) => void; reject: (e: any) => void }> = [];

function processQueue(error: AxiosError | null) {
  failedQueue.forEach(p => error ? p.reject(error) : p.resolve(null));
  failedQueue = [];
}

api.interceptors.response.use(
  res => res,
  async (error: AxiosError) => {
    const originalReq = error.config as any;

    // 401 ve auth/refresh endpoint değilse refresh dene
    // _skipAuthRedirect: true ise (fetchMe gibi) sadece hata fırlat, redirect yapma
    if (originalReq._skipAuthRedirect) {
      return Promise.reject(error);
    }
    if (
      error.response?.status === 401 &&
      !originalReq._retry &&
      !originalReq.url?.includes("/api/auth/")
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => api(originalReq));
      }

      originalReq._retry = true;
      isRefreshing = true;

      try {
        await api.post("/api/auth/refresh");
        processQueue(null);
        return api(originalReq);
      } catch (refreshError) {
        processQueue(refreshError as AxiosError);
        // Refresh başarısız — public sayfalarda yönlendirme yapma
        const PUBLIC = ["/", "/login", "/register", "/verify-email", "/explore"];
        const isPublic =
          PUBLIC.includes(window.location.pathname) ||
          window.location.pathname.startsWith("/profile/") ||
          window.location.pathname.startsWith("/studio/share/");
        if (!isPublic) {
          window.location.href = "/login?reason=expired";
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
