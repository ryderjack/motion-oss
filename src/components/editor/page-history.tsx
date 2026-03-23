"use client";

import { useState } from "react";
import { History, FileText, Type, Image, Move, Lock, Trash2, RotateCcw, Pencil, Plus, Minus, ArrowRightLeft, TableProperties } from "lucide-react";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePageHistory, type HistoryEntry } from "@/hooks/use-page-history";

const ACTION_CONFIG: Record<string, { label: string; icon: typeof History; color: string }> = {
  update_title: { label: "Updated title", icon: Type, color: "text-blue-500" },
  update_icon: { label: "Changed icon", icon: FileText, color: "text-amber-500" },
  update_cover: { label: "Changed cover", icon: Image, color: "text-purple-500" },
  update_blocks: { label: "Edited content", icon: Pencil, color: "text-green-500" },
  move_page: { label: "Moved page", icon: Move, color: "text-orange-500" },
  update_privacy: { label: "Changed access", icon: Lock, color: "text-rose-500" },
  archive: { label: "Archived page", icon: Trash2, color: "text-red-500" },
  trash: { label: "Moved to trash", icon: Trash2, color: "text-red-500" },
  restore: { label: "Restored page", icon: RotateCcw, color: "text-emerald-500" },
  delete: { label: "Deleted page", icon: Trash2, color: "text-red-500" },
  permanent_delete: { label: "Permanently deleted", icon: Trash2, color: "text-red-700 dark:text-red-400" },
  add_row: { label: "Added row", icon: Plus, color: "text-green-500" },
  delete_row: { label: "Deleted row", icon: Minus, color: "text-red-500" },
};

function getInitials(name: string | null, email: string) {
  return (name || email).slice(0, 2).toUpperCase();
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function formatFullDate(dateStr: string) {
  return new Date(dateStr).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ChangeDetail({ entry }: { entry: HistoryEntry }) {
  const { action, changes } = entry;

  if (action === "update_title") {
    return (
      <div className="mt-1.5 text-xs text-muted-foreground space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="line-through opacity-60 truncate max-w-[140px]">
            {String(changes.from || "Untitled")}
          </span>
          <span className="text-muted-foreground/40">&rarr;</span>
          <span className="font-medium text-foreground truncate max-w-[140px]">
            {String(changes.to || "Untitled")}
          </span>
        </div>
      </div>
    );
  }

  if (action === "update_icon") {
    return (
      <div className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1.5">
        <span className="text-base">{String(changes.from || "—")}</span>
        <span className="text-muted-foreground/40">&rarr;</span>
        <span className="text-base">{String(changes.to || "—")}</span>
      </div>
    );
  }

  if (action === "update_blocks") {
    const diffs = changes.diffs as Array<{
      kind: "added" | "removed" | "modified";
      type: string;
      text?: string;
      from?: string;
      to?: string;
    }> | undefined;

    if (!diffs || diffs.length === 0) {
      if (changes.blocksAdded || changes.blocksRemoved || changes.blocksModified) {
        const parts: string[] = [];
        if (changes.blocksAdded && Number(changes.blocksAdded) > 0)
          parts.push(`${changes.blocksAdded} added`);
        if (changes.blocksRemoved && Number(changes.blocksRemoved) > 0)
          parts.push(`${changes.blocksRemoved} removed`);
        if (parts.length === 0 && changes.blocksModified)
          parts.push(`${changes.blocksModified} blocks updated`);
        return parts.length > 0 ? (
          <div className="mt-1.5 text-xs text-muted-foreground">{parts.join(", ")}</div>
        ) : null;
      }
      return null;
    }

    const totalChanges = Number(changes.totalChanges) || diffs.length;

    return (
      <div className="mt-1.5 space-y-1">
        {diffs.map((diff, i) => (
          <div key={i} className="rounded border border-border/60 bg-muted/30 px-2 py-1 text-xs">
            <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
              {diff.kind === "added" && <Plus className="h-3 w-3 text-green-500" />}
              {diff.kind === "removed" && <Minus className="h-3 w-3 text-red-500" />}
              {diff.kind === "modified" && <ArrowRightLeft className="h-3 w-3 text-blue-500" />}
              <span className="capitalize">{diff.kind}</span>
              <span className="opacity-50">{diff.type}</span>
            </div>
            {diff.kind === "modified" && (
              <div className="space-y-0.5 pl-4">
                {diff.from && (
                  <div className="text-red-500/70 dark:text-red-400/70 line-through truncate">
                    {diff.from}
                  </div>
                )}
                {diff.to && (
                  <div className="text-green-600 dark:text-green-400 truncate">
                    {diff.to}
                  </div>
                )}
              </div>
            )}
            {diff.kind === "added" && diff.text && (
              <div className="pl-4 text-green-600 dark:text-green-400 truncate">
                {diff.text}
              </div>
            )}
            {diff.kind === "removed" && diff.text && (
              <div className="pl-4 text-red-500/70 dark:text-red-400/70 line-through truncate">
                {diff.text}
              </div>
            )}
          </div>
        ))}
        {totalChanges > diffs.length && (
          <div className="text-xs text-muted-foreground/60 pl-1">
            +{totalChanges - diffs.length} more changes
          </div>
        )}
      </div>
    );
  }

  if (action === "update_privacy") {
    return (
      <div className="mt-1.5 text-xs text-muted-foreground">
        {changes.to ? "Made private" : "Made shared"}
      </div>
    );
  }

  if (action === "add_row" || action === "delete_row") {
    const title = String(changes.rowTitle || "Untitled");
    return (
      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <TableProperties className="h-3 w-3 shrink-0" />
        <span className="truncate max-w-[200px] font-medium text-foreground/80">{title}</span>
      </div>
    );
  }

  return null;
}

function HistoryItem({ entry }: { entry: HistoryEntry }) {
  const config = ACTION_CONFIG[entry.action] || {
    label: entry.action,
    icon: History,
    color: "text-muted-foreground",
  };
  const Icon = config.icon;

  return (
    <div className="flex gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
      <div className="flex flex-col items-center gap-1 pt-0.5">
        <Avatar size="sm">
          {entry.user.image && <AvatarImage src={entry.user.image} />}
          <AvatarFallback>
            {getInitials(entry.user.name, entry.user.email)}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">
            {entry.user.name || entry.user.email}
          </span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="cursor-default">
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatTime(entry.createdAt)}
                </span>
              </TooltipTrigger>
              <TooltipContent>{formatFullDate(entry.createdAt)}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Icon className={`h-3.5 w-3.5 shrink-0 ${config.color}`} />
          <span className="text-xs text-muted-foreground">{config.label}</span>
        </div>
        <ChangeDetail entry={entry} />
      </div>
    </div>
  );
}

function groupEntriesByDate(entries: HistoryEntry[]) {
  const groups: { label: string; entries: HistoryEntry[] }[] = [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);

  for (const entry of entries) {
    const date = new Date(entry.createdAt);
    const entryDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    let label: string;
    if (entryDate.getTime() === today.getTime()) {
      label = "Today";
    } else if (entryDate.getTime() === yesterday.getTime()) {
      label = "Yesterday";
    } else {
      label = entryDate.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
    }

    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.entries.push(entry);
    } else {
      groups.push({ label, entries: [entry] });
    }
  }

  return groups;
}

interface PageHistoryProps {
  pageId: string;
}

export function PageHistory({ pageId }: PageHistoryProps) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = usePageHistory(pageId, open);

  const groups = data?.entries ? groupEntriesByDate(data.entries) : [];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" />
        }
      >
        <History className="h-4 w-4" />
        <span className="hidden sm:inline">History</span>
      </SheetTrigger>
      <SheetContent side="right" className="p-0 flex flex-col">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Page History
          </SheetTitle>
          <SheetDescription>
            {data?.total
              ? `${data.total} change${data.total !== 1 ? "s" : ""} recorded`
              : "Track who changed what and when"}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex flex-col gap-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="h-6 w-6 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 rounded bg-muted" />
                    <div className="h-3 w-32 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && groups.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <History className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">No history yet</p>
              <p className="text-xs mt-1">
                Changes will appear here as edits are made
              </p>
            </div>
          )}

          {groups.map((group) => (
            <div key={group.label}>
              <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm px-4 py-1.5 border-b">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {group.label}
                </span>
              </div>
              {group.entries.map((entry) => (
                <HistoryItem key={entry.id} entry={entry} />
              ))}
            </div>
          ))}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
