"use client";

import { ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface BreadcrumbsProps {
  pageId: string;
  pages?: Array<{
    id: string;
    title: string;
    parentId: string | null;
    icon: string | null;
  }>;
  onNavigate?: (pageId: string) => void;
}

interface BreadcrumbItem {
  id: string;
  title: string;
  icon: string | null;
  parentId: string | null;
}

export function Breadcrumbs({ pageId, onNavigate }: BreadcrumbsProps) {
  const { data: trail = [] } = useQuery<BreadcrumbItem[]>({
    queryKey: ["breadcrumbs", pageId],
    queryFn: async () => {
      const result: BreadcrumbItem[] = [];
      let currentId: string | null = pageId;
      while (currentId) {
        const res: Response = await fetch(`/api/pages/${currentId}`);
        if (!res.ok) break;
        const page: BreadcrumbItem = await res.json();
        result.unshift({
          id: page.id,
          title: page.title,
          icon: page.icon,
          parentId: page.parentId,
        });
        currentId = page.parentId;
      }
      return result;
    },
    staleTime: 30_000,
  });

  if (trail.length <= 1) return null;

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground">
      {trail.map((page, i) => (
        <span key={page.id} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
          <span
            className={
              i === trail.length - 1
                ? "text-foreground font-medium"
                : "hover:text-foreground cursor-pointer"
            }
            onClick={() => {
              if (i < trail.length - 1 && onNavigate) {
                onNavigate(page.id);
              }
            }}
          >
            {page.icon || ""} {page.title || "Untitled"}
          </span>
        </span>
      ))}
    </nav>
  );
}
