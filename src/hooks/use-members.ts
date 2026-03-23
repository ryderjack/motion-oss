"use client";

import { useQuery } from "@tanstack/react-query";
import { useWorkspaceStore } from "./use-workspace";

export interface Member {
  id: string;
  role: "ADMIN" | "EDITOR" | "VIEWER";
  user: { id: string; name: string | null; email: string; image: string | null };
}

export function useMembers() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  return useQuery<Member[]>({
    queryKey: ["members", workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/members?workspaceId=${workspaceId}`);
      if (!res.ok) throw new Error("Failed to fetch members");
      return res.json();
    },
    enabled: !!workspaceId,
  });
}
