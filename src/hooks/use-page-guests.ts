"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface PageGuest {
  id: string;
  email: string;
  permission: "VIEWER" | "EDITOR";
  token: string;
  created_at: string;
  invited_by: string;
}

export function usePageGuests(pageId: string | null) {
  return useQuery<PageGuest[]>({
    queryKey: ["page-guests", pageId],
    queryFn: async () => {
      const res = await fetch(`/api/pages/${pageId}/guests`);
      if (!res.ok) throw new Error("Failed to fetch guests");
      return res.json();
    },
    enabled: !!pageId,
  });
}

export function useAddPageGuest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pageId,
      email,
      permission = "VIEWER",
    }: {
      pageId: string;
      email: string;
      permission?: "VIEWER" | "EDITOR";
    }) => {
      const res = await fetch(`/api/pages/${pageId}/guests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, permission }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add guest");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["page-guests", variables.pageId],
      });
      queryClient.invalidateQueries({ queryKey: ["pages"] });
    },
  });
}

export function useRemovePageGuest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pageId,
      guestId,
    }: {
      pageId: string;
      guestId: string;
    }) => {
      const res = await fetch(`/api/pages/${pageId}/guests`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId }),
      });
      if (!res.ok) throw new Error("Failed to remove guest");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["page-guests", variables.pageId],
      });
      queryClient.invalidateQueries({ queryKey: ["pages"] });
    },
  });
}
