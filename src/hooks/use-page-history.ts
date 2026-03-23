"use client";

import { useQuery } from "@tanstack/react-query";

export interface HistoryUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface HistoryEntry {
  id: string;
  pageId: string;
  action: string;
  changes: Record<string, unknown>;
  createdAt: string;
  user: HistoryUser;
}

export function usePageHistory(pageId: string | null, enabled = false) {
  return useQuery<{ entries: HistoryEntry[]; total: number }>({
    queryKey: ["page-history", pageId],
    queryFn: async () => {
      const res = await fetch(`/api/pages/${pageId}/history?limit=50`);
      if (!res.ok) throw new Error("Failed to fetch page history");
      return res.json();
    },
    enabled: !!pageId && enabled,
    staleTime: 0,
    refetchOnMount: "always",
  });
}
