"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/sidebar/sidebar";
import {
  PageEditor,
  PageEditorSkeleton,
  EditorErrorBoundary,
} from "@/components/editor/page-editor";
import { DatabaseView } from "@/components/database/database-view";
import { TemplateGallery } from "@/components/templates/template-gallery";
import { useWorkspaceStore, useUIStore } from "@/hooks/use-workspace";
import { usePage, useCreatePage } from "@/hooks/use-pages";
import { FileText, Plus, Table2, Kanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface WorkspaceViewProps {
  pageId?: string;
}

export function WorkspaceView({ pageId: initialPageId }: WorkspaceViewProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { activeWorkspaceId, setActiveWorkspaceId } = useWorkspaceStore();
  const { showTemplates, setShowTemplates } = useUIStore();
  const [activePageId, setActivePageId] = useState<string | null>(
    initialPageId ?? null
  );
  const createPage = useCreatePage();

  useEffect(() => {
    setActivePageId(initialPageId ?? null);
    if (initialPageId) {
      setShowTemplates(false);
    }
  }, [initialPageId, setShowTemplates]);

  const handlePageSelect = useCallback(
    (pageId: string) => {
      setActivePageId(pageId);
      setShowTemplates(false);
      router.push(`/${pageId}`, { scroll: false });
    },
    [router, setShowTemplates]
  );

  const handleTemplatesClick = useCallback(() => {
    setShowTemplates(true);
    setActivePageId(null);
    router.push("/", { scroll: false });
  }, [router, setShowTemplates]);

  const { data: workspaces = [], isLoading: workspacesLoading } = useQuery<
    Workspace[]
  >({
    queryKey: ["workspaces"],
    queryFn: async () => {
      const res = await fetch("/api/workspaces");
      if (!res.ok) throw new Error("Failed to fetch workspaces");
      return res.json();
    },
    enabled: status === "authenticated",
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (workspaces.length > 0) {
      const valid = workspaces.some((w) => w.id === activeWorkspaceId);
      if (!activeWorkspaceId || !valid) {
        setActiveWorkspaceId(workspaces[0].id);
      }
    }
  }, [workspaces, activeWorkspaceId, setActiveWorkspaceId]);

  const { data: activePage, isLoading: pageLoading } = usePage(activePageId);

  if (status === "loading" || workspacesLoading) {
    return (
      <div className="flex h-screen">
        <div className="w-60 border-r bg-sidebar p-4 space-y-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-24 mt-4" />
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-12 w-64 mb-4" />
          <Skeleton className="h-5 w-full mb-2" />
          <Skeleton className="h-5 w-4/5" />
        </div>
      </div>
    );
  }

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        workspaceName={activeWorkspace?.name || "Workspace"}
        workspaceRole={activeWorkspace?.role}
        activePage={activePageId}
        onPageSelect={handlePageSelect}
        onTemplatesClick={handleTemplatesClick}
      />

      {showTemplates ? (
        <TemplateGallery />
      ) : activePage ? (
        activePage.type === "DATABASE" ? (
          <DatabaseView
            page={activePage}
            onPageSelect={handlePageSelect}
            isAdmin={activeWorkspace?.role === "ADMIN"}
          />
        ) : (
          <EditorErrorBoundary
            key={activePage.id}
            fallbackPage={{
              page: activePage,
              onPageSelect: handlePageSelect,
              isAdmin: activeWorkspace?.role === "ADMIN",
            }}
          >
            <PageEditor
              page={activePage}
              onPageSelect={handlePageSelect}
              isAdmin={activeWorkspace?.role === "ADMIN"}
            />
          </EditorErrorBoundary>
        )
      ) : pageLoading && activePageId ? (
        <PageEditorSkeleton />
      ) : (
        <div className="flex-1 flex items-center justify-center bg-background">
          <div className="text-center">
            <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
            <h2 className="text-xl font-semibold mb-2">Hey {session?.user?.name?.split(" ")[0]} 👋</h2>
            <p className="text-muted-foreground mb-6">
              Select a page from the sidebar or create a new one
            </p>
            <div className="flex gap-3 justify-center">
              <Button
                onClick={async () => {
                  const page = await createPage.mutateAsync({ type: "PAGE" });
                  handlePageSelect(page.id);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                New Page
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  const page = await createPage.mutateAsync({
                    type: "DATABASE",
                    viewMode: "table",
                  });
                  handlePageSelect(page.id);
                }}
              >
                <Table2 className="h-4 w-4 mr-2" />
                New Table
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  const page = await createPage.mutateAsync({
                    type: "DATABASE",
                    viewMode: "board",
                  });
                  handlePageSelect(page.id);
                }}
              >
                <Kanban className="h-4 w-4 mr-2" />
                New Board
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
