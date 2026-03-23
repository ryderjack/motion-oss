"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useAddRow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pageId,
      cells,
    }: {
      pageId: string;
      cells?: Array<{ propertyId: string; value: unknown }>;
    }) => {
      const res = await fetch(`/api/databases/${pageId}/rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cells }),
      });
      if (!res.ok) throw new Error("Failed to add row");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["page", variables.pageId] });
      queryClient.invalidateQueries({ queryKey: ["pages"] });
    },
  });
}

export function useDeleteRow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pageId, rowId }: { pageId: string; rowId: string }) => {
      const res = await fetch(`/api/databases/${pageId}/rows`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowId }),
      });
      if (!res.ok) throw new Error("Failed to delete row");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["page", variables.pageId] });
      queryClient.invalidateQueries({ queryKey: ["pages"] });
      queryClient.invalidateQueries({ queryKey: ["trash"] });
    },
  });
}

export function useUpdateCell() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pageId,
      propertyId,
      rowId,
      value,
    }: {
      pageId: string;
      propertyId: string;
      rowId: string;
      value: unknown;
    }) => {
      const res = await fetch(`/api/databases/${pageId}/cells`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, rowId, value }),
      });
      if (!res.ok) throw new Error("Failed to update cell");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["page", variables.pageId] });
      queryClient.invalidateQueries({ queryKey: ["pages"] });
    },
  });
}

export function useAddProperty() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pageId,
      name,
      type,
      options,
    }: {
      pageId: string;
      name?: string;
      type?: string;
      options?: unknown;
    }) => {
      const res = await fetch(`/api/databases/${pageId}/properties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, options }),
      });
      if (!res.ok) throw new Error("Failed to add property");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["page", variables.pageId] });
    },
  });
}

export function useUpdateProperty() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pageId,
      id,
      name,
      type,
      options,
    }: {
      pageId: string;
      id: string;
      name?: string;
      type?: string;
      options?: unknown;
    }) => {
      const res = await fetch(`/api/databases/${pageId}/properties`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name, type, options }),
      });
      if (!res.ok) throw new Error("Failed to update property");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["page", variables.pageId] });
    },
  });
}

export function useReorderProperties() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pageId,
      order,
    }: {
      pageId: string;
      order: Array<{ id: string; position: number }>;
    }) => {
      const res = await fetch(`/api/databases/${pageId}/properties`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
      if (!res.ok) throw new Error("Failed to reorder properties");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["page", variables.pageId] });
    },
  });
}

export function useDeleteProperty() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pageId, id }: { pageId: string; id: string }) => {
      const res = await fetch(`/api/databases/${pageId}/properties`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Failed to delete property");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["page", variables.pageId] });
    },
  });
}
