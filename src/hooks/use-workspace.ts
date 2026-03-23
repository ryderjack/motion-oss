import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WorkspaceState {
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      activeWorkspaceId: null,
      setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),
    }),
    { name: "motion-workspace" }
  )
);

interface UIState {
  showTemplates: boolean;
  setShowTemplates: (show: boolean) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  showTemplates: false,
  setShowTemplates: (show) => set({ showTemplates: show }),
}));
