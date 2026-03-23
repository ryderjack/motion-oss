"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEffect, useRef } from "react";

interface ThemeState {
  theme: "light" | "dark";
  toggleTheme: () => void;
  setTheme: (theme: "light" | "dark") => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "light",
      toggleTheme: () =>
        set((state) => ({
          theme: state.theme === "light" ? "dark" : "light",
        })),
      setTheme: (theme) => set({ theme }),
    }),
    { name: "motion-theme" }
  )
);

export function useThemeEffect() {
  const theme = useThemeStore((s) => s.theme);
  const initialised = useRef(false);

  useEffect(() => {
    if (!initialised.current) {
      initialised.current = true;
      const stored = localStorage.getItem("motion-theme");
      if (!stored) {
        const prefersDark =
          window.matchMedia("(prefers-color-scheme: dark)").matches;
        if (prefersDark) {
          useThemeStore.getState().setTheme("dark");
          return;
        }
      }
    }
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
}
