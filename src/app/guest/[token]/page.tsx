"use client";

import { use, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import "@blocknote/mantine/style.css";
import "@/components/editor/blocknote-overrides.css";
import { Skeleton } from "@/components/ui/skeleton";
import { useThemeStore } from "@/hooks/use-theme";
import { FileWarning, ExternalLink, Search, ArrowUpDown, X, CheckSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface GuestProperty {
  id: string;
  name: string;
  type: string;
  options: unknown;
  position: number;
}

interface GuestCell {
  id: string;
  propertyId: string;
  rowId: string;
  value: unknown;
}

interface GuestRow {
  id: string;
  position: number;
  cells: GuestCell[];
}

interface GuestPage {
  id: string;
  title: string;
  icon: string | null;
  coverImage: string | null;
  type: string;
  viewMode?: string | null;
  permission: string;
  guestEmail: string;
  blocks: Array<{
    id: string;
    type: string;
    content: unknown;
    position: number;
  }>;
  properties: GuestProperty[];
  rows: GuestRow[];
  children: Array<{
    id: string;
    title: string;
    icon: string | null;
    type: string;
  }>;
}

const SELECT_COLORS: Record<string, string> = {
  gray: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  purple: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  pink: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

const COLUMN_COLORS: Record<string, string> = {
  gray: "border-t-gray-400",
  blue: "border-t-blue-500",
  green: "border-t-green-500",
  red: "border-t-red-500",
  yellow: "border-t-yellow-500",
  purple: "border-t-purple-500",
  pink: "border-t-pink-500",
  orange: "border-t-orange-500",
};

function useGuestPage(token: string) {
  return useQuery<GuestPage>({
    queryKey: ["guest-page", token],
    queryFn: async () => {
      const res = await fetch(`/api/guest/${token}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load page");
      }
      return res.json();
    },
  });
}

export default function GuestPageRoute({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const { data: page, isLoading, error } = useGuestPage(token);
  const theme = useThemeStore((s) => s.theme);

  if (isLoading) return <GuestPageSkeleton />;

  if (error || !page) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
        <FileWarning className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h1 className="text-xl font-semibold mb-2">Page not available</h1>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          {error?.message || "This shared page link is invalid or has expired."}
        </p>
      </div>
    );
  }

  const isDatabase = page.type === "DATABASE";

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className={`${isDatabase ? "max-w-5xl" : "max-w-3xl"} mx-auto px-6 py-3 flex items-center justify-between`}>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ExternalLink className="h-4 w-4" />
            <span>Shared with {page.guestEmail}</span>
          </div>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
            {page.permission === "EDITOR" ? "Can edit" : "View only"}
          </span>
        </div>
      </div>
      <div className={`${isDatabase ? "max-w-5xl" : "max-w-3xl"} mx-auto px-6 py-8`}>
        {page.coverImage && (
          <div className="relative h-48 -mx-6 -mt-4 mb-4 rounded-b-lg overflow-hidden">
            <img
              src={page.coverImage}
              alt="Cover"
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex items-center gap-2 mb-4">
          {page.icon && (
            <span className="text-4xl">{page.icon}</span>
          )}
        </div>

        <h1 className="text-4xl font-bold mb-6">
          {page.title || "Untitled"}
        </h1>

        {isDatabase ? (
          <GuestDatabaseView page={page} />
        ) : (
          <GuestBlockNoteView page={page} theme={theme} />
        )}
      </div>
    </div>
  );
}

function GuestDatabaseView({ page }: { page: GuestPage }) {
  const isBoard = page.viewMode === "board";
  const selectProperty = page.properties.find((p) => p.type === "select");

  if (isBoard && selectProperty) {
    return <GuestKanbanView page={page} groupByProperty={selectProperty} />;
  }

  return <GuestTableView page={page} />;
}

function GuestTableView({ page }: { page: GuestPage }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function getCellValue(rowId: string, propertyId: string): unknown {
    const cell = page.rows
      .find((r) => r.id === rowId)
      ?.cells.find((c) => c.propertyId === propertyId);
    return cell?.value ?? null;
  }

  function handleSort(propertyId: string) {
    if (sortBy === propertyId) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(propertyId);
      setSortDir("asc");
    }
  }

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return page.rows;
    const q = searchQuery.toLowerCase();
    return page.rows.filter((row) =>
      page.properties.some((prop) => {
        const val = row.cells.find((c) => c.propertyId === prop.id)?.value;
        if (typeof val === "string") return val.toLowerCase().includes(q);
        if (typeof val === "number") return String(val).includes(q);
        return false;
      })
    );
  }, [page.rows, page.properties, searchQuery]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      if (!sortBy) return a.position - b.position;
      const aVal = getCellValue(a.id, sortBy);
      const bVal = getCellValue(b.id, sortBy);
      const aStr = typeof aVal === "string" ? aVal : JSON.stringify(aVal ?? "");
      const bStr = typeof bVal === "string" ? bVal : JSON.stringify(bVal ?? "");
      return sortDir === "asc"
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredRows, sortBy, sortDir]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search rows..."
            className="h-8 pl-8 pr-8 text-sm"
          />
          {searchQuery && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums shrink-0">
          {searchQuery.trim()
            ? `${sortedRows.length} of ${page.rows.length}`
            : page.rows.length}{" "}
          row{page.rows.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="rounded-lg border text-sm">
        <div className="flex border-b">
          {page.properties.map((prop) => (
            <div
              key={prop.id}
              className="flex-1 min-w-[150px] h-10 px-3 flex items-center font-medium text-foreground select-none whitespace-nowrap cursor-pointer hover:bg-muted/50"
              onClick={() => handleSort(prop.id)}
            >
              <span className="flex items-center gap-1">
                {prop.name}
                <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
              </span>
            </div>
          ))}
        </div>

        <div>
          {sortedRows.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {searchQuery.trim() ? "No matching rows." : "No rows."}
            </div>
          ) : (
            sortedRows.map((row) => (
              <div
                key={row.id}
                className="flex border-b last:border-b-0 transition-colors hover:bg-muted/50"
              >
                {page.properties.map((prop) => (
                  <div key={prop.id} className="flex-1 min-w-[150px] p-1">
                    <ReadOnlyCell
                      property={prop}
                      value={getCellValue(row.id, prop.id)}
                    />
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function GuestKanbanView({ page, groupByProperty }: { page: GuestPage; groupByProperty: GuestProperty }) {
  const options = (
    groupByProperty.options as { options?: Array<{ value: string; color: string }> }
  )?.options || [];

  const titleProperty = page.properties.find((p) => p.type === "text");

  function getRowsForColumn(columnValue: string) {
    return page.rows.filter((row) => {
      const cell = row.cells.find((c) => c.propertyId === groupByProperty.id);
      return cell?.value === columnValue;
    });
  }

  function getUngroupedRows() {
    return page.rows.filter((row) => {
      const cell = row.cells.find((c) => c.propertyId === groupByProperty.id);
      return !cell?.value || !options.some((o) => o.value === cell.value);
    });
  }

  function getRowTitle(row: GuestRow) {
    if (!titleProperty) return "Untitled";
    const cell = row.cells.find((c) => c.propertyId === titleProperty.id);
    return (typeof cell?.value === "string" ? cell.value : "") || "Untitled";
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {options.map((option) => {
        const rows = getRowsForColumn(option.value);
        return (
          <div
            key={option.value}
            className={`shrink-0 w-72 rounded-lg border border-t-4 bg-muted/30 flex flex-col ${
              COLUMN_COLORS[option.color] || COLUMN_COLORS.gray
            }`}
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <Badge
                variant="secondary"
                className={SELECT_COLORS[option.color] || SELECT_COLORS.gray}
              >
                {option.value}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {rows.length}
              </span>
            </div>

            <div className="min-h-[60px] px-2 pb-2 space-y-2 flex-1">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="rounded-md border bg-card p-3 shadow-sm"
                >
                  <p className="font-medium text-sm truncate">
                    {getRowTitle(row)}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {page.properties
                      .filter(
                        (p) =>
                          p.id !== groupByProperty.id &&
                          p.id !== titleProperty?.id
                      )
                      .map((prop) => {
                        const cell = row.cells.find(
                          (c) => c.propertyId === prop.id
                        );
                        if (!cell?.value) return null;

                        if (prop.type === "select") {
                          const opts = (prop.options as { options?: Array<{ value: string; color: string }> })?.options;
                          const opt = opts?.find((o) => o.value === cell.value);
                          if (opt) {
                            return (
                              <Badge
                                key={prop.id}
                                variant="secondary"
                                className={`text-xs ${SELECT_COLORS[opt.color] || SELECT_COLORS.gray}`}
                              >
                                {opt.value}
                              </Badge>
                            );
                          }
                        }

                        if (prop.type === "checkbox") {
                          return cell.value === true ? (
                            <CheckSquare key={prop.id} className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : null;
                        }

                        return (
                          <span
                            key={prop.id}
                            className="text-xs text-muted-foreground"
                          >
                            {String(cell.value)}
                          </span>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {getUngroupedRows().length > 0 && (
        <div className="shrink-0 w-72 rounded-lg border bg-muted/30 flex flex-col">
          <div className="px-3 py-2">
            <span className="text-sm font-medium text-muted-foreground">
              No status
            </span>
            <span className="ml-2 text-xs text-muted-foreground">
              {getUngroupedRows().length}
            </span>
          </div>
          <div className="min-h-[60px] px-2 pb-2 space-y-2 flex-1">
            {getUngroupedRows().map((row) => (
              <div
                key={row.id}
                className="rounded-md border bg-card p-3 shadow-sm"
              >
                <p className="font-medium text-sm">
                  {getRowTitle(row)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReadOnlyCell({ property, value }: { property: GuestProperty; value: unknown }) {
  const options = (property.options as { options?: Array<{ value: string; color: string }> })?.options;

  switch (property.type) {
    case "select": {
      const selectedOpt = options?.find((o) => o.value === value);
      if (!selectedOpt) return <div className="h-8 flex items-center px-3" />;
      return (
        <div className="h-8 flex items-center px-3">
          <Badge
            variant="secondary"
            className={SELECT_COLORS[selectedOpt.color] || SELECT_COLORS.gray}
          >
            {selectedOpt.value}
          </Badge>
        </div>
      );
    }
    case "checkbox":
      return (
        <div className="h-8 flex items-center justify-center">
          <div className={`h-4 w-4 rounded border ${value === true ? "bg-primary border-primary" : "border-muted-foreground/30"} flex items-center justify-center`}>
            {value === true && <CheckSquare className="h-3 w-3 text-primary-foreground" />}
          </div>
        </div>
      );
    case "url":
      return (
        <div className="h-8 flex items-center px-3">
          {typeof value === "string" && value ? (
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 dark:text-blue-400 underline truncate text-sm"
            >
              {value}
            </a>
          ) : null}
        </div>
      );
    default:
      return (
        <div className="h-8 flex items-center px-3 text-sm">
          {value != null ? String(value) : ""}
        </div>
      );
  }
}

function GuestBlockNoteView({ page, theme }: { page: GuestPage; theme: "light" | "dark" }) {
  const initialContent = useMemo(() => {
    if (page.blocks.length === 0) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blocks = page.blocks
      .map((b) => b.content as object)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((b: any) => b && typeof b === "object" && typeof b.type === "string");
    return blocks.length > 0 ? blocks : undefined;
  }, [page.blocks]);

  const editor = useCreateBlockNote({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialContent: initialContent as any,
  });

  return (
    <div className="min-h-[300px]">
      <BlockNoteView
        editor={editor}
        theme={theme}
        editable={false}
      />
    </div>
  );
}

function GuestPageSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-background">
        <div className="max-w-3xl mx-auto px-6 py-3">
          <Skeleton className="h-5 w-48" />
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <Skeleton className="h-10 w-10 rounded mb-4" />
        <Skeleton className="h-12 w-96 mb-8" />
        <div className="space-y-3">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-5 w-3/5" />
        </div>
      </div>
    </div>
  );
}
