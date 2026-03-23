"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface CommentUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface Comment {
  id: string;
  page_id: string;
  user_id: string;
  content: string;
  quote: string | null;
  is_resolved: boolean;
  resolved_by: string | null;
  created_at: string;
  user: CommentUser;
  resolver: CommentUser | null;
}

export function useComments(pageId: string | null) {
  return useQuery<Comment[]>({
    queryKey: ["comments", pageId],
    queryFn: async () => {
      const res = await fetch(`/api/pages/${pageId}/comments`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
    enabled: !!pageId,
  });
}

export function useCreateComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      pageId,
      content,
      quote,
      mentionedUserIds,
    }: {
      id?: string;
      pageId: string;
      content: string;
      quote?: string;
      mentionedUserIds?: string[];
    }) => {
      const res = await fetch(`/api/pages/${pageId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, content, quote, mentionedUserIds }),
      });
      if (!res.ok) throw new Error("Failed to create comment");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["comments", variables.pageId],
      });
    },
  });
}

export function useResolveComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pageId,
      commentId,
    }: {
      pageId: string;
      commentId: string;
    }) => {
      const res = await fetch(`/api/pages/${pageId}/comments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId }),
      });
      if (!res.ok) throw new Error("Failed to resolve comment");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["comments", variables.pageId],
      });
    },
  });
}
