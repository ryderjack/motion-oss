"use client";

import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "./use-workspace";

export interface PageListItem {
  id: string;
  title: string;
  icon: string | null;
  type: "PAGE" | "DATABASE";
  viewMode: "table" | "board" | null;
  parentId: string | null;
  position: number;
  isFavorite: boolean;
  isPrivate: boolean;
  isLocked: boolean;
  createdBy: string | null;
  shareCount: number;
  guestCount: number;
  childCount: number;
}

export interface PageDetail {
  id: string;
  title: string;
  icon: string | null;
  coverImage: string | null;
  type: "PAGE" | "DATABASE";
  viewMode: "table" | "board" | null;
  parentId: string | null;
  workspaceId: string;
  position: number;
  isFavorite: boolean;
  isArchived: boolean;
  isPrivate: boolean;
  isLocked: boolean;
  createdBy: string | null;
  blocks: Array<{
    id: string;
    type: string;
    content: unknown;
    position: number;
  }>;
  properties: Array<{
    id: string;
    name: string;
    type: string;
    options: unknown;
    position: number;
  }>;
  rows: Array<{
    id: string;
    position: number;
    cells: Array<{
      id: string;
      propertyId: string;
      rowId: string;
      value: unknown;
    }>;
  }>;
  children: Array<{
    id: string;
    title: string;
    icon: string | null;
    type: "PAGE" | "DATABASE";
  }>;
}

export function usePages() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  return useQuery<PageListItem[]>({
    queryKey: ["pages", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const res = await fetch(`/api/pages?workspaceId=${workspaceId}`);
      if (!res.ok) throw new Error("Failed to fetch pages");
      return res.json();
    },
    enabled: !!workspaceId,
  });
}

export function useChildPages(expandedPageIds: Set<string>) {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const ids = Array.from(expandedPageIds);

  const queries = useQueries({
    queries: ids.map((parentId) => ({
      queryKey: ["pages", workspaceId, "children", parentId],
      queryFn: async () => {
        const res = await fetch(
          `/api/pages?workspaceId=${workspaceId}&parentId=${parentId}`
        );
        if (!res.ok) throw new Error("Failed to fetch children");
        return res.json() as Promise<PageListItem[]>;
      },
      enabled: !!workspaceId,
      staleTime: 30_000,
    })),
  });

  const childrenMap = new Map<string, PageListItem[]>();
  ids.forEach((id, i) => {
    if (queries[i].data) {
      childrenMap.set(id, queries[i].data);
    }
  });

  return childrenMap;
}

export function usePage(pageId: string | null) {
  return useQuery<PageDetail>({
    queryKey: ["page", pageId],
    queryFn: async () => {
      const res = await fetch(`/api/pages/${pageId}`);
      if (!res.ok) throw new Error("Failed to fetch page");
      return res.json();
    },
    enabled: !!pageId,
  });
}

const PAGE_EMOJIS = [
  "📝","📄","📋","📌","📎","📐","📊","📈","🗂","📁",
  "💡","🎯","🔖","🏷","✨","⚡","🔥","🌟","💫","🌈",
  "🚀","🎨","🧩","🔧","🛠","⚙️","🧪","🔬","📡","💻",
  "🌍","🌱","🍀","🌸","🌻","🎵","🎲","🏆","🎪","🎭",
  "📚","✏️","🖊","📮","📦","🧮","🔑","💎","🪄","🫧",
];

function getRandomPageEmoji(): string {
  return PAGE_EMOJIS[Math.floor(Math.random() * PAGE_EMOJIS.length)];
}

export function useCreatePage() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  return useMutation({
    mutationFn: async (data: {
      title?: string;
      type?: "PAGE" | "DATABASE";
      viewMode?: "table" | "board";
      parentId?: string;
      icon?: string;
      isPrivate?: boolean;
    }) => {
      const { viewMode, isPrivate, ...rest } = data;
      const icon = rest.icon ?? getRandomPageEmoji();
      const sendData = { workspaceId, ...rest, icon, view_mode: viewMode, is_private: isPrivate };
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sendData),
      });
      if (!res.ok) throw new Error("Failed to create page");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["pages"] });
      if (variables.parentId) {
        queryClient.invalidateQueries({
          queryKey: ["page", variables.parentId],
        });
      }
    },
  });
}

export function useUpdatePage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pageId,
      coverImage,
      isFavorite,
      isArchived,
      isPrivate,
      isLocked,
      parentId,
      ...rest
    }: {
      pageId: string;
      title?: string;
      icon?: string;
      coverImage?: string;
      isFavorite?: boolean;
      isArchived?: boolean;
      isPrivate?: boolean;
      isLocked?: boolean;
      parentId?: string | null;
      position?: number;
    }) => {
      const body: Record<string, unknown> = { ...rest };
      if (coverImage !== undefined) body.cover_image = coverImage;
      if (isFavorite !== undefined) body.is_favorite = isFavorite;
      if (isArchived !== undefined) body.is_archived = isArchived;
      if (isPrivate !== undefined) body.is_private = isPrivate;
      if (isLocked !== undefined) body.is_locked = isLocked;
      if (parentId !== undefined) body.parent_id = parentId;
      const res = await fetch(`/api/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update page");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["pages"] });
      queryClient.invalidateQueries({ queryKey: ["page", variables.pageId] });
      const cached = queryClient.getQueryData<PageDetail>(["page", variables.pageId]);
      if (cached?.parentId) {
        queryClient.invalidateQueries({
          queryKey: ["page", cached.parentId],
        });
      }
      if (variables.parentId) {
        queryClient.invalidateQueries({
          queryKey: ["page", variables.parentId],
        });
      }
    },
  });
}

export function useDeletePage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pageId,
    }: {
      pageId: string;
      parentId?: string | null;
    }) => {
      const res = await fetch(`/api/pages/${pageId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete page");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["pages"] });
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["page", variables.pageId] });
      if (variables.parentId) {
        queryClient.invalidateQueries({
          queryKey: ["page", variables.parentId],
        });
      }
    },
  });
}

export interface TrashItem {
  id: string;
  title: string;
  icon: string | null;
  type: "PAGE" | "DATABASE";
  viewMode: "table" | "board" | null;
  parentId: string | null;
  deletedAt: string;
  isPrivate: boolean;
  createdBy: string | null;
}

export function useTrashPages() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  return useQuery<TrashItem[]>({
    queryKey: ["trash", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const res = await fetch(`/api/trash?workspaceId=${workspaceId}`);
      if (!res.ok) throw new Error("Failed to fetch trash");
      return res.json();
    },
    enabled: !!workspaceId,
  });
}

export function useRestorePage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pageId }: { pageId: string; parentId?: string | null }) => {
      const res = await fetch(`/api/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_archived: false }),
      });
      if (!res.ok) throw new Error("Failed to restore page");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["pages"] });
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["page", variables.pageId] });
      if (variables.parentId) {
        queryClient.invalidateQueries({ queryKey: ["page", variables.parentId] });
      }
    },
  });
}

export function usePermanentDeletePage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pageId }: { pageId: string }) => {
      const res = await fetch(`/api/pages/${pageId}?permanent=true`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to permanently delete page");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.removeQueries({ queryKey: ["page", variables.pageId] });
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["pages"] });
    },
  });
}

export function useDeleteAllTrash() {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/trash?workspaceId=${workspaceId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete all trash");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["pages"] });
    },
  });
}

export function useSaveBlocks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pageId,
      blocks,
    }: {
      pageId: string;
      blocks: unknown[];
    }) => {
      const res = await fetch(`/api/pages/${pageId}/blocks`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks }),
      });
      if (!res.ok) throw new Error("Failed to save blocks");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["page", variables.pageId] });
    },
  });
}
