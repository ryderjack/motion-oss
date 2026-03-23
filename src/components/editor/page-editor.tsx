"use client";

import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BlockNoteView } from "@blocknote/mantine";
import {
  useCreateBlockNote,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
} from "@blocknote/react";
import { BlockNoteSchema } from "@blocknote/core";
import {
  insertOrUpdateBlockForSlashMenu,
  filterSuggestionItems,
} from "@blocknote/core/extensions";
import "@blocknote/mantine/style.css";
import "./blocknote-overrides.css";
import {
  useSaveBlocks,
  useUpdatePage,
  useCreatePage,
  useDeletePage,
  useRestorePage,
  usePermanentDeletePage,
  type PageDetail,
} from "@/hooks/use-pages";
import { SmilePlus, FileText, Trash2, RotateCcw, Sparkles, Video, MoreHorizontal, Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useThemeStore } from "@/hooks/use-theme";
import { EmojiPicker } from "./emoji-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

import { PageHistory } from "./page-history";
import { createSubpageBlock, PageNavigationContext } from "./subpage-block";
import { LoomBlock, extractLoomId } from "./loom-block";
import { Mention } from "./mention-inline";
import { useMembers, type Member } from "@/hooks/use-members";
import { useCreateMentionNotification } from "@/hooks/use-notifications";
import { CommentHighlight } from "./comment-highlight-style";
import { InlineComments, CommentToolbarButton } from "./inline-comments";
import { AiEditPopover, AiEditToolbarButton } from "./ai-edit-popover";
import { ShareDialog } from "./share-dialog";
import {
  FormattingToolbarController,
  FormattingToolbar,
  getFormattingToolbarItems,
} from "@blocknote/react";
import { replaceEmojiShortcodes } from "@/lib/emoji-shortcodes";

const schema = BlockNoteSchema.create().extend({
  blockSpecs: {
    subpage: createSubpageBlock(),
    loom: LoomBlock(),
  },
  inlineContentSpecs: {
    mention: Mention,
  },
  styleSpecs: {
    commentHighlight: CommentHighlight,
  },
});

interface PageEditorProps {
  page: PageDetail;
  onPageSelect?: (pageId: string) => void;
  isAdmin?: boolean;
}

export function PageEditor({ page, onPageSelect, isAdmin }: PageEditorProps) {
  const router = useRouter();
  const saveBlocks = useSaveBlocks();
  const updatePage = useUpdatePage();
  const createPage = useCreatePage();
  const deletePage = useDeletePage();
  const restorePage = useRestorePage();
  const permanentDelete = usePermanentDeletePage();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [title, setTitle] = useState(page.title);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const titleTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const theme = useThemeStore((s) => s.theme);
  const { data: members = [] } = useMembers();
  const createMentionNotification = useCreateMentionNotification();
  const mentionedUserIdsRef = useRef<Set<string>>(new Set());
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [aiEdit, setAiEdit] = useState<{
    mode: "edit" | "generate";
    selectedText?: string;
    savedSelection: { from: number; to: number };
    top: number;
    left: number;
  } | null>(null);

  useEffect(() => {
    setTitle(page.title);
  }, [page.id, page.title]);

  const initialContent = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let blocks: any[] | undefined =
      page.blocks.length > 0
        ? page.blocks
            .map((b) => b.content as object)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((b: any) => b && typeof b === "object" && typeof b.type === "string")
        : undefined;

    if (blocks && blocks.length === 0) blocks = undefined;

    const existingSubpageIds = new Set(
      (blocks ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((b: any) => b.type === "subpage")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((b: any) => b.props?.pageId)
    );

    const missingChildren = page.children.filter(
      (child) => !existingSubpageIds.has(child.id)
    );

    if (missingChildren.length === 0) return blocks;

    const childBlocks = missingChildren.map((child) => ({
      type: "subpage" as const,
      props: { pageId: child.id, pageTitle: child.title || "Untitled" },
    }));

    if (!blocks) {
      return [{ type: "paragraph" as const }, ...childBlocks];
    }

    return [...blocks, ...childBlocks];
  }, [page.blocks, page.children]);

  const validBlockTypes = useMemo(
    () => new Set(Object.keys(schema.blockSpecs)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const safeInitialContent = useMemo(() => {
    if (!initialContent) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtered = initialContent.filter((b: any) => validBlockTypes.has(b.type));
    return filtered.length > 0 ? filtered : undefined;
  }, [initialContent, validBlockTypes]);

  const editor = useCreateBlockNote({
    schema,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialContent: safeInitialContent as any,
    _tiptapOptions: {
      editorProps: {
        transformPastedText(text: string) {
          return replaceEmojiShortcodes(text);
        },
        transformPastedHTML(html: string) {
          return replaceEmojiShortcodes(html);
        },
      },
    },
  });

  useEffect(() => {
    const childIds = new Set(page.children.map((c) => c.id));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staleBlocks = (editor.document as any[]).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (b: any) => b.type === "subpage" && b.props?.pageId && !childIds.has(b.props.pageId)
    );
    if (staleBlocks.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      editor.removeBlocks(staleBlocks.map((b: any) => b.id));
    }
  }, [editor, page.children]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dom = (editor as any).domElement as HTMLElement | undefined;
    if (!dom) return;

    const handler = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text/plain")?.trim();
      if (!text) return;
      const loomId = extractLoomId(text);
      if (!loomId) return;

      const cursorBlock = editor.getTextCursorPosition()?.block;
      if (!cursorBlock) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content = (cursorBlock as any).content;
      const isEmpty =
        cursorBlock.type === "paragraph" &&
        (!Array.isArray(content) || content.length === 0);
      if (!isEmpty) return;

      e.preventDefault();
      e.stopPropagation();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      editor.updateBlock(cursorBlock as any, {
        type: "loom" as const,
        props: { videoId: loomId, url: text },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    };

    dom.addEventListener("paste", handler, { capture: true });
    return () => dom.removeEventListener("paste", handler, { capture: true });
  }, [editor]);

  const handleChange = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const blocks = editor.document.map((block, i) => ({
        id: (block as { id?: string }).id || `block-${i}`,
        type: block.type,
        content: block,
      }));
      saveBlocks.mutate({ pageId: page.id, blocks });
    }, 1000);
  }, [editor, page.id, saveBlocks]);

  function handleTitleChange(newTitle: string) {
    setTitle(newTitle);
    if (titleTimeoutRef.current) clearTimeout(titleTimeoutRef.current);
    titleTimeoutRef.current = setTimeout(() => {
      updatePage.mutate({ pageId: page.id, title: newTitle });
    }, 500);
  }

  function handleIconSelect(icon: string) {
    updatePage.mutate({ pageId: page.id, icon });
    setShowEmojiPicker(false);
  }

  const handleClickBelowEditor = useCallback(() => {
    if (page.isArchived) return;

    const doc = editor.document;
    const lastBlock = doc[doc.length - 1];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastContent = (lastBlock as any).content;
    const isEmptyParagraph =
      lastBlock.type === "paragraph" &&
      (!Array.isArray(lastContent) || lastContent.length === 0);

    if (!isEmptyParagraph) {
      editor.insertBlocks(
        [{ type: "paragraph" as const }],
        lastBlock,
        "after"
      );
    }

    const updatedDoc = editor.document;
    const newLast = updatedDoc[updatedDoc.length - 1];
    editor.setTextCursorPosition(newLast, "end");
    editor.focus();
  }, [editor, page.isArchived]);

  const handleAiEditOpen = useCallback(
    (mode: "edit" | "generate", selectedText: string | undefined, selection: { from: number; to: number }, rect: DOMRect) => {
      setAiEdit({
        mode,
        selectedText,
        savedSelection: selection,
        top: rect.bottom + 8,
        left: rect.left,
      });
    },
    []
  );

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (editor as any).__aiEdit = { handleOpen: handleAiEditOpen };
  }, [editor, handleAiEditOpen]);

  useEffect(() => {
    if (page.isArchived) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dom = (editor as any).domElement as HTMLElement | undefined;
    if (!dom) return;

    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        e.stopPropagation();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tiptap = (editor as any)._tiptapEditor;
        if (!tiptap) return;

        const selectedText = editor.getSelectedText();
        const { from, to } = tiptap.state.selection;
        const hasSelection = selectedText && selectedText.length > 0;

        const coords = tiptap.view.coordsAtPos(from);
        const rect = new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top);

        handleAiEditOpen(
          hasSelection ? "edit" : "generate",
          hasSelection ? selectedText : undefined,
          { from, to },
          rect
        );
      }
    };
    dom.addEventListener("keydown", handler, { capture: true });
    return () => dom.removeEventListener("keydown", handler, { capture: true });
  }, [editor, handleAiEditOpen, page.isArchived]);

  const navigationCtx = useMemo(
    () => ({ onPageSelect, children: page.children }),
    [onPageSelect, page.children]
  );

  return (
    <div className="flex-1 overflow-y-auto relative bg-background">
      {page.isArchived && (
        <div className="sticky top-0 z-20 flex items-center justify-center gap-3 bg-destructive/10 border-b border-destructive/20 px-4 py-2.5">
          <Trash2 className="h-4 w-4 text-destructive shrink-0" />
          <span className="text-sm text-destructive font-medium">
            This page is in the trash.
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs border-destructive/30 hover:bg-destructive/10"
            onClick={() => restorePage.mutate({ pageId: page.id, parentId: page.parentId })}
            disabled={restorePage.isPending}
          >
            <RotateCcw className="h-3 w-3 mr-1.5" />
            Restore
          </Button>
          {isAdmin && (
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                if (window.confirm("Permanently delete this page? This cannot be undone.")) {
                  permanentDelete.mutate(
                    { pageId: page.id },
                    { onSuccess: () => router.push("/") }
                  );
                }
              }}
              disabled={permanentDelete.isPending}
            >
              <Trash2 className="h-3 w-3 mr-1.5" />
              Delete forever
            </Button>
          )}
        </div>
      )}
      <div className="sticky top-0 z-10 bg-background border-b flex items-center min-h-12 px-4">
        <div className="max-w-3xl mx-auto px-2 flex-1 min-w-0">
          <Breadcrumbs pageId={page.id} onNavigate={onPageSelect} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <PageHistory pageId={page.id} />
          <ShareDialog pageId={page.id} pageTitle={page.title} isPrivate={page.isPrivate} createdBy={page.createdBy} />
          {!page.isArchived && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="bottom" sideOffset={4} className="min-w-[160px]">
                {isAdmin && (
                  <DropdownMenuItem
                    onClick={() => {
                      updatePage.mutate({ pageId: page.id, isLocked: !page.isLocked });
                    }}
                  >
                    {page.isLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                    {page.isLocked ? "Unlock page" : "Lock page"}
                  </DropdownMenuItem>
                )}
                {(!page.isLocked || isAdmin) && (
                  <>
                    {isAdmin && <DropdownMenuSeparator />}
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => {
                        deletePage.mutate(
                          { pageId: page.id, parentId: page.parentId },
                          { onSuccess: () => router.push("/") }
                        );
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Move to trash
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-6 relative" ref={editorContainerRef}>

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
          <div className="relative">
            <button
              className="text-4xl hover:bg-accent rounded p-1 transition-colors"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            >
              {page.icon || (
                <SmilePlus className="h-8 w-8 text-muted-foreground" />
              )}
            </button>
            {showEmojiPicker && (
              <EmojiPicker
                onSelect={handleIconSelect}
                onClose={() => setShowEmojiPicker(false)}
              />
            )}
          </div>
        </div>

        <textarea
          className="w-full text-4xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/50 mb-4 resize-none overflow-hidden"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = el.scrollHeight + "px";
          }}
          ref={(el) => {
            if (el) {
              el.style.height = "auto";
              el.style.height = el.scrollHeight + "px";
            }
          }}
          rows={1}
          placeholder="Untitled"
          readOnly={page.isArchived}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              editor.focus();
            }
          }}
        />

        <div className="min-h-[500px]">
          <PageNavigationContext.Provider value={navigationCtx}>
            <BlockNoteView
              editor={editor}
              onChange={handleChange}
              theme={theme}
              slashMenu={false}
              formattingToolbar={false}
              editable={!page.isArchived}
            >
              <FormattingToolbarController
                formattingToolbar={() => (
                  <FormattingToolbar>
                    {getFormattingToolbarItems()}
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <CommentToolbarButton editor={editor as any} />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <AiEditToolbarButton editor={editor as any} />
                  </FormattingToolbar>
                )}
              />
              <SuggestionMenuController
                triggerCharacter="/"
                getItems={async (query) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const defaults = getDefaultReactSlashMenuItems(editor as any);
                  const subpageItem = {
                    title: "Sub-page",
                    onItemClick: async () => {
                      const result = await createPage.mutateAsync({
                        type: "PAGE" as const,
                        parentId: page.id,
                        isPrivate: page.isPrivate,
                      });
                      insertOrUpdateBlockForSlashMenu(
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        editor as any,
                        {
                          type: "subpage",
                          props: {
                            pageId: result.id,
                            pageTitle: result.title || "Untitled",
                          },
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        } as any
                      );
                      onPageSelect?.(result.id);
                    },
                    aliases: ["page", "subpage", "child page", "new page"],
                    group: "Basic blocks",
                    icon: <FileText className="h-[18px] w-[18px]" />,
                    subtext: "Create a sub-page inside this page",
                  };
                  const askAiItem = {
                    title: "Ask AI",
                    onItemClick: () => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const tiptap = (editor as any)._tiptapEditor;
                      if (!tiptap) return;
                      const { from } = tiptap.state.selection;
                      const coords = tiptap.view.coordsAtPos(from);
                      const rect = new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top);
                      handleAiEditOpen("generate", undefined, { from, to: from }, rect);
                    },
                    aliases: ["ai", "generate", "write", "ask", "prompt"],
                    group: "AI",
                    icon: <Sparkles className="h-[18px] w-[18px]" />,
                    subtext: "Generate text with AI (⌘J)",
                  };
                  const loomItem = {
                    title: "Loom video",
                    onItemClick: () => {
                      insertOrUpdateBlockForSlashMenu(
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        editor as any,
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        { type: "loom", props: {} } as any
                      );
                    },
                    aliases: ["loom", "video", "embed", "recording"],
                    group: "Media",
                    icon: <Video className="h-[18px] w-[18px]" />,
                    subtext: "Embed a Loom video",
                  };
                  const allItems = [...defaults];
                  const lastBasicIdx = allItems.findLastIndex(
                    (item) => item.group === "Basic blocks"
                  );
                  allItems.splice(
                    lastBasicIdx >= 0 ? lastBasicIdx + 1 : 0,
                    0,
                    subpageItem
                  );
                  const lastMediaIdx = allItems.findLastIndex(
                    (item) => item.group === "Media"
                  );
                  allItems.splice(
                    lastMediaIdx >= 0 ? lastMediaIdx + 1 : allItems.length,
                    0,
                    loomItem
                  );
                  allItems.unshift(askAiItem);
                  return filterSuggestionItems(allItems, query);
                }}
              />
              <SuggestionMenuController
                triggerCharacter="@"
                getItems={async (query) => {
                  return filterSuggestionItems(
                    members.map((member: Member) => ({
                      title: member.user.name || member.user.email,
                      onItemClick: () => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (editor as any).insertInlineContent([
                          {
                            type: "mention",
                            props: {
                              userId: member.user.id,
                              userName: member.user.name || member.user.email,
                            },
                          },
                          " ",
                        ]);
                        if (!mentionedUserIdsRef.current.has(member.user.id)) {
                          mentionedUserIdsRef.current.add(member.user.id);
                          createMentionNotification.mutate({
                            mentionedUserId: member.user.id,
                            pageId: page.id,
                            pageTitle: page.title || "Untitled",
                          });
                        }
                      },
                      aliases: [
                        member.user.email,
                        member.user.name || "",
                      ].filter(Boolean),
                      group: "Mentions",
                    })),
                    query
                  );
                }}
              />
            </BlockNoteView>
          </PageNavigationContext.Provider>
          {!page.isArchived && (
            <div
              className="min-h-[200px] cursor-text"
              onClick={handleClickBelowEditor}
            />
          )}
        </div>

        {!page.isArchived && (
          /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
          <InlineComments pageId={page.id} editor={editor as any} containerRef={editorContainerRef} />
        )}

        {aiEdit && (
          <AiEditPopover
            mode={aiEdit.mode}
            selectedText={aiEdit.selectedText}
            top={aiEdit.top}
            left={aiEdit.left}
            savedSelection={aiEdit.savedSelection}
            /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
            editor={editor as any}
            onClose={() => setAiEdit(null)}
          />
        )}
      </div>
    </div>
  );
}

export function PageEditorSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-4">
        <Skeleton className="h-4 w-48 mb-6" />
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

interface EditorErrorBoundaryState {
  hasError: boolean;
}

export class EditorErrorBoundary extends Component<
  { children: ReactNode; fallbackPage: PageEditorProps },
  EditorErrorBoundaryState
> {
  state: EditorErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): EditorErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("Editor failed to load blocks, retrying with empty content:", error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      const cleanPage = {
        ...this.state,
        ...this.props.fallbackPage.page,
        blocks: [],
      };
      return (
        <PageEditor
          {...this.props.fallbackPage}
          page={cleanPage}
        />
      );
    }
    return this.props.children;
  }
}
