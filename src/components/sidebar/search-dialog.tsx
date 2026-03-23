"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  FileText,
  Database,
  User,
  Type,
  ChevronDown,
  X,
  Check,
} from "lucide-react";
import type { PageListItem } from "@/hooks/use-pages";
import { useMembers } from "@/hooks/use-members";

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: PageListItem[];
  onSelect: (pageId: string) => void;
}

export function SearchDialog({
  open,
  onOpenChange,
  pages,
  onSelect,
}: SearchDialogProps) {
  const { data: session } = useSession();
  const { data: members = [] } = useMembers();
  const [createdByFilter, setCreatedByFilter] = useState<string | null>(null);
  const [titleOnly, setTitleOnly] = useState(false);
  const [creatorMenuOpen, setCreatorMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const creatorMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setCreatedByFilter(null);
      setTitleOnly(false);
      setCreatorMenuOpen(false);
      setSearchQuery("");
    }
  }, [open]);

  useEffect(() => {
    if (!creatorMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        creatorMenuRef.current &&
        !creatorMenuRef.current.contains(e.target as Node)
      ) {
        setCreatorMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [creatorMenuOpen]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange]);

  const memberMap = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m) => {
      map.set(m.user.id, m.user.name || m.user.email);
    });
    return map;
  }, [members]);

  const displayedPages = useMemo(() => {
    let result = pages;

    if (createdByFilter) {
      result = result.filter((p) => p.createdBy === createdByFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((page) => {
        const title = (page.title || "Untitled").toLowerCase();
        if (title.includes(q)) return true;
        if (!titleOnly) {
          const typeName = page.type === "DATABASE" ? "database" : "page";
          if (typeName.includes(q)) return true;
        }
        return false;
      });
    }

    return result;
  }, [pages, createdByFilter, searchQuery, titleOnly, memberMap]);

  const selectedCreatorName = createdByFilter
    ? createdByFilter === session?.user?.id
      ? "me"
      : memberMap.get(createdByFilter) || "Unknown"
    : null;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder="Search pages..."
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <div ref={creatorMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setCreatorMenuOpen(!creatorMenuOpen)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors",
              createdByFilter
                ? "bg-primary/10 text-primary border-primary/20"
                : "bg-transparent text-muted-foreground border-border hover:bg-muted"
            )}
          >
            <User className="h-3 w-3" />
            {selectedCreatorName
              ? `By ${selectedCreatorName}`
              : "Created by"}
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                creatorMenuOpen && "rotate-180"
              )}
            />
          </button>
          {creatorMenuOpen && (
            <div className="absolute top-full left-0 z-10 mt-1 min-w-[160px] rounded-lg bg-popover p-1 shadow-md ring-1 ring-foreground/10">
              {createdByFilter && (
                <>
                  <button
                    type="button"
                    className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm hover:bg-accent hover:text-accent-foreground"
                    onClick={() => {
                      setCreatedByFilter(null);
                      setCreatorMenuOpen(false);
                    }}
                  >
                    <X className="h-4 w-4" />
                    Clear filter
                  </button>
                  <div className="-mx-1 my-1 h-px bg-border" />
                </>
              )}
              {session?.user?.id && (
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    setCreatedByFilter(session.user!.id as string);
                    setCreatorMenuOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "h-4 w-4",
                      createdByFilter !== (session.user!.id as string) && "invisible"
                    )}
                  />
                  Me
                </button>
              )}
              {members
                .filter((m) => m.user.id !== session?.user?.id)
                .map((member) => (
                  <button
                    type="button"
                    key={member.user.id}
                    className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm hover:bg-accent hover:text-accent-foreground"
                    onClick={() => {
                      setCreatedByFilter(member.user.id);
                      setCreatorMenuOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4",
                        createdByFilter !== member.user.id && "invisible"
                      )}
                    />
                    {member.user.name || member.user.email}
                  </button>
                ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setTitleOnly(!titleOnly)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors",
            titleOnly
              ? "bg-primary/10 text-primary border-primary/20"
              : "bg-transparent text-muted-foreground border-border hover:bg-muted"
          )}
        >
          <Type className="h-3 w-3" />
          Title only
        </button>
      </div>
      <CommandList>
        {displayedPages.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No pages found.
          </p>
        ) : (
        <CommandGroup heading="Pages">
          {displayedPages.map((page) => {
            const creatorName = page.createdBy
              ? memberMap.get(page.createdBy)
              : null;

            return (
              <CommandItem
                key={page.id}
                value={page.id}
                onSelect={() => onSelect(page.id)}
              >
                {page.icon ? (
                  <span className="mr-2">{page.icon}</span>
                ) : page.type === "DATABASE" ? (
                  <Database className="mr-2 h-4 w-4 text-muted-foreground" />
                ) : (
                  <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                )}
                <span className="flex-1 truncate">
                  {page.title || "Untitled"}
                </span>
                {creatorName && (
                  <span className="ml-2 text-xs text-muted-foreground truncate max-w-24">
                    {page.createdBy === session?.user?.id
                      ? "me"
                      : creatorName}
                  </span>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
