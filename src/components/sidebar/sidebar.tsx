"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import {
  ChevronRight,
  FileText,
  Table2,
  Kanban,
  Plus,
  Star,
  MoreHorizontal,
  Search,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  Trash2,
    Copy,
    LayoutTemplate,
    Moon,
    Sun,
    Lock,
    Bell,
    Users,
    CornerLeftUp,
    User,
  } from "lucide-react";
import { useThemeStore } from "@/hooks/use-theme";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  usePages,
  useChildPages,
  useCreatePage,
  useUpdatePage,
  useDeletePage,
  useTrashPages,
  type PageListItem,
} from "@/hooks/use-pages";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useMembers } from "@/hooks/use-members";
import { SearchDialog } from "./search-dialog";
import { TrashDialog } from "./trash-dialog";
import { NotificationPopover } from "@/components/notifications/notification-popover";
import { useUnreadCount } from "@/hooks/use-notifications";

interface SidebarProps {
  workspaceName: string;
  workspaceRole?: string;
  activePage: string | null;
  onPageSelect: (pageId: string) => void;
  onTemplatesClick: () => void;
}

export function Sidebar({
  workspaceName,
  workspaceRole,
  activePage,
  onPageSelect,
  onTemplatesClick,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const { data: pages = [] } = usePages();
  const { data: trashItems = [] } = useTrashPages();
  const childrenMap = useChildPages(expandedPages);
  const createPage = useCreatePage();
  const updatePage = useUpdatePage();
  const deletePage = useDeletePage();
  const router = useRouter();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const { theme, toggleTheme } = useThemeStore();
  const unreadCount = useUnreadCount();
  const { data: members = [] } = useMembers();
  const currentUser = members.find((m) => m.user.id === currentUserId)?.user;

  const workspacePages = pages.filter((p) => !p.isPrivate);
  const sharedPages = pages.filter(
    (p) => p.isPrivate && (p.shareCount > 0 || p.guestCount > 0)
  );
  const privatePages = pages.filter(
    (p) => p.isPrivate && p.shareCount === 0 && p.guestCount === 0
  );
  const favorites = pages.filter((p) => p.isFavorite);

  function toggleExpand(pageId: string) {
    setExpandedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  }

  function getChildren(parentId: string) {
    return childrenMap.get(parentId) || [];
  }

  async function handleCreatePage(
    type: "PAGE" | "DATABASE",
    parentId?: string,
    viewMode?: "table" | "board",
    isPrivate?: boolean,
  ) {
    const result = await createPage.mutateAsync({ type, parentId, viewMode, isPrivate });
    onPageSelect(result.id);
  }

  function getPagesForDroppable(droppableId: string): PageListItem[] {
    if (droppableId.startsWith("children:")) {
      const parentId = droppableId.slice("children:".length);
      return childrenMap.get(parentId) || [];
    }
    if (droppableId === "workspace") return workspacePages;
    if (droppableId === "shared") return sharedPages;
    if (droppableId === "private") return privatePages;
    if (droppableId === "favorites") return favorites;
    return [];
  }

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (result.combine) {
        const draggedId = result.draggableId;
        const targetId = result.combine.draggableId;
        if (draggedId === targetId) return;

        const allVisible = [
          ...pages,
          ...Array.from(childrenMap.values()).flat(),
        ];
        const target = allVisible.find((p) => p.id === targetId);
        if (target?.type === "DATABASE") return;

        updatePage.mutate({ pageId: draggedId, parentId: targetId });
        setExpandedPages((prev) => new Set(prev).add(targetId));
        return;
      }

      if (!result.destination) return;

      const srcDroppable = result.source.droppableId;
      const destDroppable = result.destination.droppableId;
      const srcIsChildren = srcDroppable.startsWith("children:");
      const destIsChildren = destDroppable.startsWith("children:");

      if (srcIsChildren && !destIsChildren) {
        updatePage.mutate({ pageId: result.draggableId, parentId: null });
        return;
      }

      if (!srcIsChildren && destIsChildren) {
        const newParentId = destDroppable.slice("children:".length);
        updatePage.mutate({ pageId: result.draggableId, parentId: newParentId });
        return;
      }

      if (srcDroppable !== destDroppable) return;

      const srcIdx = result.source.index;
      const destIdx = result.destination.index;
      if (srcIdx === destIdx) return;

      const sectionPages = getPagesForDroppable(srcDroppable);
      const reordered = [...sectionPages];
      const [moved] = reordered.splice(srcIdx, 1);
      reordered.splice(destIdx, 0, moved);

      reordered.forEach((p, i) => {
        if (p.position !== i) {
          updatePage.mutate({ pageId: p.id, position: i });
        }
      });
    },
    [updatePage, pages, childrenMap]
  );

  function renderPageItemContent(page: PageListItem, depth: number = 0) {
    const isDatabase = page.type === "DATABASE";
    const children = isDatabase ? [] : getChildren(page.id);
    const hasExpandable = isDatabase || page.childCount > 0;
    const isExpanded = expandedPages.has(page.id);
    const isActive = activePage === page.id;

    return (
      <>
        <div
          className={cn(
            "group flex items-center gap-1 rounded-md px-2 py-1 text-sm cursor-pointer hover:bg-accent",
            isActive && "bg-accent"
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => onPageSelect(page.id)}
        >
          {hasExpandable ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(page.id);
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
          <span className="shrink-0 text-base">
            {page.icon ||
              (isDatabase ? (
                page.viewMode === "board" ? (
                  <Kanban className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Table2 className="h-4 w-4 text-muted-foreground" />
                )
              ) : (
                <FileText className="h-4 w-4 text-muted-foreground" />
              ))}
          </span>
          <span className="truncate flex-1">{page.title || "Untitled"}</span>
          <div className={cn(
            "items-center gap-0.5",
            openMenuId === page.id ? "flex" : "hidden group-hover:flex"
          )}>
            <DropdownMenu onOpenChange={(open) => {
              if (open) {
                setOpenMenuId(page.id);
              } else {
                setTimeout(() => setOpenMenuId(null), 150);
              }
            }}>
              <DropdownMenuTrigger
                className="p-0.5 rounded hover:bg-muted"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    updatePage.mutate({
                      pageId: page.id,
                      isFavorite: !page.isFavorite,
                    });
                  }}
                >
                  <Star className="mr-2 h-4 w-4" />
                  {page.isFavorite ? "Remove from favorites" : "Add to favorites"}
                </DropdownMenuItem>
                {!isDatabase && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCreatePage("PAGE", page.id, undefined, page.isPrivate);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add sub-page
                  </DropdownMenuItem>
                )}
                {page.parentId && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      updatePage.mutate({ pageId: page.id, parentId: null });
                    }}
                  >
                    <CornerLeftUp className="mr-2 h-4 w-4" />
                    Move to root
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(
                      `${window.location.origin}/${page.id}`
                    );
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy link
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {(!page.isLocked || workspaceRole === "ADMIN") && (
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePage.mutate({ pageId: page.id, parentId: page.parentId });
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Move to trash
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {!isDatabase && (
              <button
                className="p-0.5 rounded hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCreatePage("PAGE", page.id, undefined, page.isPrivate);
                }}
              >
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
        {isExpanded && isDatabase && (
          <div
            className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground cursor-pointer hover:bg-accent"
            style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
            onClick={() => onPageSelect(page.id)}
          >
            <span className="w-4.5 text-center text-muted-foreground/60">•</span>
            <span>{page.viewMode === "board" ? "Board" : "Table"}</span>
          </div>
        )}
        {isExpanded && !isDatabase && children.length > 0 && (
          <Droppable droppableId={`children:${page.id}`} isCombineEnabled>
            {(childProvided) => (
              <div ref={childProvided.innerRef} {...childProvided.droppableProps}>
                {children.map((child, idx) => (
                  <Draggable key={child.id} draggableId={child.id} index={idx}>
                    {(childDragProvided, childSnapshot) => (
                      <div
                        ref={childDragProvided.innerRef}
                        {...childDragProvided.draggableProps}
                        {...childDragProvided.dragHandleProps}
                        className={cn(
                          "rounded-md transition-colors",
                          childSnapshot.isDragging && "bg-accent shadow-md z-10",
                          childSnapshot.combineTargetFor && "ring-2 ring-primary bg-primary/10"
                        )}
                      >
                        {renderPageItemContent(child, depth + 1)}
                      </div>
                    )}
                  </Draggable>
                ))}
                {childProvided.placeholder}
              </div>
            )}
          </Droppable>
        )}
      </>
    );
  }

  function renderDraggableSection(droppableId: string, sectionPages: PageListItem[]) {
    return (
      <Droppable droppableId={droppableId} isCombineEnabled>
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps}>
            {sectionPages.map((page, index) => (
              <Draggable key={page.id} draggableId={page.id} index={index}>
                {(dragProvided, snapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                    className={cn(
                      "rounded-md transition-colors",
                      snapshot.isDragging && "bg-accent shadow-md z-10",
                      snapshot.combineTargetFor && "ring-2 ring-primary bg-primary/10"
                    )}
                  >
                    {renderPageItemContent(page)}
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    );
  }

  if (collapsed) {
    return (
      <div className="flex flex-col items-center w-12 border-r bg-sidebar py-3 gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setCollapsed(false)}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col w-60 border-r bg-sidebar shrink-0 min-h-0">
        <div className="px-3 pt-3 pb-1">
          <span className="text-lg font-bold tracking-tight mb-2 block">Motion</span>
        </div>
        <div className="flex items-center justify-between px-3 pb-3">
          <span className="font-semibold text-sm truncate">{workspaceName}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCollapsed(true)}
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-2 space-y-0.5">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Search className="h-4 w-4" />
            <span>Search</span>
            <kbd className="ml-auto text-xs bg-muted rounded px-1.5 py-0.5">
              ⌘K
            </kbd>
          </button>
          <NotificationPopover onNavigateToPage={onPageSelect} unreadCount={unreadCount} />
          <button
            onClick={onTemplatesClick}
            className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <LayoutTemplate className="h-4 w-4" />
            <span>Templates</span>
          </button>
          <button
            onClick={() => setTrashOpen(true)}
            className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Trash2 className="h-4 w-4" />
            <span>Trash</span>
            {trashItems.length > 0 && (
              <span className="ml-auto text-xs bg-muted rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center font-medium">
                {trashItems.length}
              </span>
            )}
          </button>
        </div>

        <ScrollArea className="flex-1 min-h-0 px-2 py-2">
         <DragDropContext onDragEnd={handleDragEnd}>
          {favorites.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <Star className="h-3 w-3" />
                Favorites
              </div>
              {renderDraggableSection("favorites", favorites)}
            </div>
          )}

          <div className="mb-3">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Pages
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger className="p-0.5 rounded hover:bg-muted">
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleCreatePage("PAGE")}>
                    <FileText className="mr-2 h-4 w-4" />
                    New Page
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleCreatePage("DATABASE", undefined, "table")}
                  >
                    <Table2 className="mr-2 h-4 w-4" />
                    New Table
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleCreatePage("DATABASE", undefined, "board")}
                  >
                    <Kanban className="mr-2 h-4 w-4" />
                    New Board
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {renderDraggableSection("workspace", workspacePages)}
          </div>

          {sharedPages.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <Users className="h-3 w-3" />
                Shared
              </div>
              {renderDraggableSection("shared", sharedPages)}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between px-2 py-1">
              <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <Lock className="h-3 w-3" />
                Private
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger className="p-0.5 rounded hover:bg-muted">
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleCreatePage("PAGE", undefined, undefined, true)}>
                    <FileText className="mr-2 h-4 w-4" />
                    New Page
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleCreatePage("DATABASE", undefined, "table", true)}
                  >
                    <Table2 className="mr-2 h-4 w-4" />
                    New Table
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleCreatePage("DATABASE", undefined, "board", true)}
                  >
                    <Kanban className="mr-2 h-4 w-4" />
                    New Board
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {privatePages.length === 0 ? (
              <p className="px-2 py-1 text-xs text-muted-foreground/60">
                No private pages yet
              </p>
            ) : (
              renderDraggableSection("private", privatePages)
            )}
          </div>
         </DragDropContext>
        </ScrollArea>

        <div className="border-t p-2">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <div
                className="flex items-center gap-3 px-2 py-2 cursor-pointer rounded-sm hover:bg-accent"
                onClick={() => router.push("/settings/profile")}
              >
                <Avatar className="h-8 w-8">
                  {currentUser?.image && (
                    <AvatarImage src={currentUser.image} alt={currentUser.name || ""} />
                  )}
                  <AvatarFallback className="text-xs">
                    {(currentUser?.name || currentUser?.email || "U")
                      .slice(0, 2)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate">
                    {currentUser?.name || currentUser?.email || "User"}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {currentUser?.email}
                  </span>
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/settings")}>
                <Settings className="mr-2 h-4 w-4" />
                Workspace settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleTheme}>
                {theme === "light" ? (
                  <Moon className="mr-2 h-4 w-4" />
                ) : (
                  <Sun className="mr-2 h-4 w-4" />
                )}
                {theme === "light" ? "Dark mode" : "Light mode"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <SearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        pages={pages}
        onSelect={(pageId) => {
          onPageSelect(pageId);
          setSearchOpen(false);
        }}
      />

      <TrashDialog
        open={trashOpen}
        onOpenChange={setTrashOpen}
        isAdmin={workspaceRole === "ADMIN"}
        onPageSelect={onPageSelect}
        onRestore={(pageId) => {
          onPageSelect(pageId);
          setTrashOpen(false);
        }}
      />
    </>
  );
}
