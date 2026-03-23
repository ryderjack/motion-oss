"use client";

import { useState } from "react";
import {
  Trash2,
  RotateCcw,
  FileText,
  Table2,
  Kanban,
  Search,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  useTrashPages,
  useRestorePage,
  usePermanentDeletePage,
  useDeleteAllTrash,
  type TrashItem,
} from "@/hooks/use-pages";

function formatDeletedAt(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function PageIcon({ item }: { item: TrashItem }) {
  if (item.icon) return <span className="text-base">{item.icon}</span>;
  if (item.type === "DATABASE") {
    return item.viewMode === "board" ? (
      <Kanban className="h-4 w-4 text-muted-foreground" />
    ) : (
      <Table2 className="h-4 w-4 text-muted-foreground" />
    );
  }
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

function getChildren(items: TrashItem[], parentId: string) {
  return items.filter((p) => p.parentId === parentId);
}

function getRoots(items: TrashItem[]) {
  const ids = new Set(items.map((p) => p.id));
  return items.filter((p) => !p.parentId || !ids.has(p.parentId));
}

function matchesFilter(item: TrashItem, filter: string, allItems: TrashItem[]): boolean {
  if ((item.title || "Untitled").toLowerCase().includes(filter)) return true;
  return getChildren(allItems, item.id).some((c) => matchesFilter(c, filter, allItems));
}

interface TrashItemRowProps {
  item: TrashItem;
  allItems: TrashItem[];
  depth: number;
  isAdmin: boolean;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onPageSelect?: (pageId: string) => void;
  onCloseDialog: () => void;
  onRestore: (pageId: string) => void;
  onDelete: (pageId: string) => void;
  restorePending: boolean;
}

function TrashItemRow({
  item,
  allItems,
  depth,
  isAdmin,
  expanded,
  onToggle,
  onPageSelect,
  onCloseDialog,
  onRestore,
  onDelete,
  restorePending,
}: TrashItemRowProps) {
  const children = getChildren(allItems, item.id);
  const hasChildren = children.length > 0;
  const isExpanded = expanded.has(item.id);

  return (
    <>
      <div
        className="group flex items-center gap-1 px-3 py-1.5 hover:bg-muted/50 transition-colors cursor-pointer"
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
        onClick={() => {
          onPageSelect?.(item.id);
          onCloseDialog();
        }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle(item.id);
            }}
            className="shrink-0 p-0.5 rounded hover:bg-muted"
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 transition-transform text-muted-foreground",
                isExpanded && "rotate-90"
              )}
            />
          </button>
        ) : (
          <span className="w-4.5" />
        )}
        <PageIcon item={item} />
        <div className="flex-1 min-w-0 ml-1">
          <p className="text-sm truncate">{item.title || "Untitled"}</p>
        </div>
        <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap mr-1 hidden group-hover:hidden sm:inline">
          {formatDeletedAt(item.deletedAt)}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => {
              e.stopPropagation();
              onRestore(item.id);
            }}
            disabled={restorePending}
            title="Restore"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          {isAdmin && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item.id);
              }}
              title="Delete forever"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      {isExpanded &&
        children.map((child) => (
          <TrashItemRow
            key={child.id}
            item={child}
            allItems={allItems}
            depth={depth + 1}
            isAdmin={isAdmin}
            expanded={expanded}
            onToggle={onToggle}
            onPageSelect={onPageSelect}
            onCloseDialog={onCloseDialog}
            onRestore={onRestore}
            onDelete={onDelete}
            restorePending={restorePending}
          />
        ))}
    </>
  );
}

interface TrashDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  onPageSelect?: (pageId: string) => void;
  onRestore?: (pageId: string) => void;
}

export function TrashDialog({
  open,
  onOpenChange,
  isAdmin,
  onPageSelect,
  onRestore,
}: TrashDialogProps) {
  const { data: trashItems = [], isLoading } = useTrashPages();
  const restorePage = useRestorePage();
  const permanentDelete = usePermanentDeletePage();
  const deleteAllTrash = useDeleteAllTrash();
  const [filter, setFilter] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const lowerFilter = filter.toLowerCase();
  const visible = filter
    ? trashItems.filter((p) => matchesFilter(p, lowerFilter, trashItems))
    : trashItems;

  const roots = getRoots(visible);

  const confirmItem = confirmDeleteId
    ? trashItems.find((p) => p.id === confirmDeleteId)
    : null;

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleRestore(pageId: string) {
    const item = trashItems.find((p) => p.id === pageId);
    restorePage.mutate(
      { pageId, parentId: item?.parentId },
      { onSuccess: () => onRestore?.(pageId) }
    );
  }

  function handlePermanentDelete(pageId: string) {
    permanentDelete.mutate(
      { pageId },
      { onSuccess: () => setConfirmDeleteId(null) }
    );
  }

  if (confirmDeleteAll) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete all pages in trash?
            </DialogTitle>
            <DialogDescription>
              All <strong>{trashItems.length}</strong> page{trashItems.length !== 1 ? "s" : ""} in
              trash will be permanently deleted. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteAll(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deleteAllTrash.mutate(undefined, {
                  onSuccess: () => setConfirmDeleteAll(false),
                })
              }
              disabled={deleteAllTrash.isPending}
            >
              {deleteAllTrash.isPending ? "Deleting..." : "Delete all forever"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (confirmItem) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Permanently delete?
            </DialogTitle>
            <DialogDescription>
              <strong>{confirmItem.title || "Untitled"}</strong> will be deleted
              forever. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => handlePermanentDelete(confirmItem.id)}
              disabled={permanentDelete.isPending}
            >
              {permanentDelete.isPending ? "Deleting..." : "Delete forever"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4" />
            Trash
          </DialogTitle>
          <DialogDescription>
            {trashItems.length > 0
              ? `${trashItems.length} deleted page${trashItems.length !== 1 ? "s" : ""}`
              : "Deleted pages will appear here"}
          </DialogDescription>
        </DialogHeader>

        {trashItems.length > 3 && (
          <div className="px-4 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter deleted pages..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full rounded-md border bg-transparent py-1.5 pl-8 pr-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        )}

        <ScrollArea className="max-h-[400px] overflow-y-auto">
          {isLoading && (
            <div className="flex flex-col gap-2 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="h-4 w-4 rounded bg-muted" />
                  <div className="flex-1 h-4 rounded bg-muted" />
                </div>
              ))}
            </div>
          )}

          {!isLoading && roots.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Trash2 className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">
                {filter ? "No matching pages" : "Trash is empty"}
              </p>
            </div>
          )}

          {roots.map((item) => (
            <TrashItemRow
              key={item.id}
              item={item}
              allItems={visible}
              depth={0}
              isAdmin={isAdmin}
              expanded={expanded}
              onToggle={toggleExpand}
              onPageSelect={onPageSelect}
              onCloseDialog={() => onOpenChange(false)}
              onRestore={handleRestore}
              onDelete={setConfirmDeleteId}
              restorePending={restorePage.isPending}
            />
          ))}
        </ScrollArea>

        <div className="border-t px-4 py-2.5 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {isAdmin
              ? "As an admin, you can permanently delete pages."
              : "Only admins can permanently delete pages."}
          </p>
          {isAdmin && trashItems.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive text-xs h-7"
              onClick={() => setConfirmDeleteAll(true)}
            >
              Delete all
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
