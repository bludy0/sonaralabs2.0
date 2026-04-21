// frontend/src/store/useAuthStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "../lib/api";

interface User {
  userId: string;
  email: string;
  role: "user" | "admin";
  creditBalance: number;
  storageUsed: number;
  preferences: { accentColor: string };
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  // actions
  login:     (email: string, password: string) => Promise<void>;
  loginDemo: () => void;
  register:  (email: string, password: string) => Promise<void>;
  logout:    () => Promise<void>;
  logoutAll: () => Promise<void>;
  fetchMe:   () => Promise<void>;
  updateCredit:      (delta: number) => void;
  updatePreferences: (prefs: Partial<User["preferences"]>) => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,

      loginDemo: () => {
        set({
          user: {
            userId:        "demo-user",
            email:         "demo@sonaralabs.io",
            role:          "user",
            creditBalance: 999,
            storageUsed:   0,
            preferences:   { accentColor: "#7c6dfa" },
          },
        });
      },

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { data } = await api.post("/api/auth/login", { email, password });
          set({ user: data.data });
        } finally {
          set({ isLoading: false });
        }
      },

      register: async (email, password) => {
        set({ isLoading: true });
        try {
          const { data } = await api.post("/api/auth/register", { email, password });
          set({ user: data.data });
        } finally {
          set({ isLoading: false });
        }
      },

      logout: async () => {
        await api.post("/api/auth/logout").catch(() => {});
        set({ user: null });
      },

      logoutAll: async () => {
        await api.post("/api/auth/logout-all").catch(() => {});
        set({ user: null });
      },

      fetchMe: async () => {
        try {
          const { data } = await api.get("/api/users/me");
          set({ user: data.data });
        } catch {
          set({ user: null });
        }
      },

      // Optimistik güncelleme — kredisi düştükten sonra UI'ı anında günceller
      updateCredit: (delta: number) => {
        const { user } = get();
        if (user) set({ user: { ...user, creditBalance: user.creditBalance + delta } });
      },

      // Kullanıcı tercihlerini güncelle (accentColor vb.)
      updatePreferences: async (prefs) => {
        const { user } = get();
        if (!user) return;
        // Optimistic update
        set({ user: { ...user, preferences: { ...user.preferences, ...prefs } } });
        try {
          await api.patch("/api/users/me/preferences", prefs);
        } catch {
          // Revert on failure
          set({ user });
        }
      },
    }),
    {
      name: "sonaralabs-auth",
      partialize: (state) => ({ user: state.user }),
    }
  )
);
