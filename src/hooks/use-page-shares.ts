"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface PageShare {
  id: string;
  user_id: string;
  permission: "VIEWER" | "EDITOR";
  created_at: string;
  user: { id: string; name: string | null; email: string; image: string | null };
}

export function usePageShares(pageId: string | null) {
  return useQuery<PageShare[]>({
    queryKey: ["page-shares", pageId],
    queryFn: async () => {
      const res = await fetch(`/api/pages/${pageId}/shares`);
      if (!res.ok) throw new Error("Failed to fetch shares");
      return res.json();
    },
    enabled: !!pageId,
  });
}

export function useAddPageShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pageId,
      userId,
      permission = "VIEWER",
    }: {
      pageId: string;
      userId: string;
      permission?: "VIEWER" | "EDITOR";
    }) => {
      const res = await fetch(`/api/pages/${pageId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, permission }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to share page");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["page-shares", variables.pageId] });
      queryClient.invalidateQueries({ queryKey: ["page", variables.pageId] });
      queryClient.invalidateQueries({ queryKey: ["pages"] });
    },
  });
}

export function useUpdatePageShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pageId,
      shareId,
      permission,
    }: {
      pageId: string;
      shareId: string;
      permission: "VIEWER" | "EDITOR";
    }) => {
      const res = await fetch(`/api/pages/${pageId}/shares`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareId, permission }),
      });
      if (!res.ok) throw new Error("Failed to update share");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["page-shares", variables.pageId] });
    },
  });
}

export function useRemovePageShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pageId,
      shareId,
    }: {
      pageId: string;
      shareId: string;
    }) => {
      const res = await fetch(`/api/pages/${pageId}/shares`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareId }),
      });
      if (!res.ok) throw new Error("Failed to remove share");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["page-shares", variables.pageId] });
      queryClient.invalidateQueries({ queryKey: ["page", variables.pageId] });
      queryClient.invalidateQueries({ queryKey: ["pages"] });
    },
  });
}
