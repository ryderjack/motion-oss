"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import { Check, MessageSquare, Send } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useComments,
  useCreateComment,
  useResolveComment,
  type Comment,
} from "@/hooks/use-comments";
import { useMembers, type Member } from "@/hooks/use-members";
import type { BlockNoteEditor } from "@blocknote/core";

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function getInitials(user: { name: string | null; email: string }): string {
  const name = user.name || user.email;
  return name.slice(0, 2).toUpperCase();
}

// ─── Comment Card ────────────────────────────────────────────

function CommentCard({
  comment,
  pageId,
  active,
  onResolve,
}: {
  comment: Comment;
  pageId: string;
  active?: boolean;
  onResolve: () => void;
}) {
  const resolveComment = useResolveComment();

  return (
    <div
      className={cn(
        "w-72 rounded-lg border bg-popover shadow-sm transition-all",
        active && "ring-2 ring-yellow-400 dark:ring-yellow-600 shadow-md",
        comment.is_resolved && "opacity-50"
      )}
    >
      {comment.quote && (
        <div className="px-3 pt-2.5 pb-1">
          <div className="text-xs text-muted-foreground border-l-2 border-yellow-400 dark:border-yellow-600 pl-2 italic truncate">
            &ldquo;{comment.quote}&rdquo;
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 px-3 pt-2 pb-2.5">
        <Avatar size="sm" className="mt-0.5 shrink-0">
          {comment.user.image && <AvatarImage src={comment.user.image} />}
          <AvatarFallback>{getInitials(comment.user)}</AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold truncate">
              {comment.user.name || comment.user.email}
            </span>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {formatTimeAgo(comment.created_at)}
            </span>
          </div>
          <p className="text-xs text-foreground/80 mt-0.5 whitespace-pre-wrap">
            {comment.content}
          </p>
          {comment.is_resolved && comment.resolver && (
            <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
              <Check className="h-2.5 w-2.5" />
              Resolved by {comment.resolver.name || comment.resolver.email}
            </span>
          )}
        </div>

        {!comment.is_resolved && (
          <button
            className="shrink-0 p-1 rounded hover:bg-accent text-muted-foreground hover:text-primary transition-colors"
            onClick={() => {
              resolveComment.mutate(
                { pageId, commentId: comment.id },
                { onSuccess: onResolve }
              );
            }}
            disabled={resolveComment.isPending}
            title="Resolve comment"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function removeHighlightById(editor: BlockNoteEditor<any, any, any>, commentId: string) {
  const doc = editor.document;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function walk(blocks: any[]) {
    for (const block of blocks) {
      if (block.content && Array.isArray(block.content)) {
        for (const inline of block.content) {
          if (inline.styles?.commentHighlight === commentId) {
            delete inline.styles.commentHighlight;
          }
        }
      }
      if (block.children) walk(block.children);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docCopy = JSON.parse(JSON.stringify(doc)) as any[];
  walk(docCopy);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor.replaceBlocks(editor.document as any, docCopy);
}

// ─── Comment Creation Popover ────────────────────────────────

function CommentPopover({
  pageId,
  anchorId,
  quote,
  top,
  left,
  onSubmit,
  onCancel,
}: {
  pageId: string;
  anchorId: string;
  quote: string;
  top: number;
  left: number;
  onSubmit: (commentId: string) => void;
  onCancel: () => void;
}) {
  const createComment = useCreateComment();
  const { data: members = [] } = useMembers();
  const [input, setInput] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionedIds, setMentionedIds] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const mentionStartRef = useRef(-1);
  const clickedInsideRef = useRef(false);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    const markInside = () => { clickedInsideRef.current = true; };
    el.addEventListener("mousedown", markInside);
    return () => el.removeEventListener("mousedown", markInside);
  }, []);

  useEffect(() => {
    const handler = () => {
      if (clickedInsideRef.current) {
        clickedInsideRef.current = false;
        return;
      }
      onCancel();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onCancel]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      const cursorPos = e.target.selectionStart;
      setInput(value);

      const textBeforeCursor = value.slice(0, cursorPos);
      const atIndex = textBeforeCursor.lastIndexOf("@");

      if (
        atIndex !== -1 &&
        (atIndex === 0 || textBeforeCursor[atIndex - 1] === " ")
      ) {
        const query = textBeforeCursor.slice(atIndex + 1);
        if (!query.includes(" ") || query.length <= 20) {
          setShowMentions(true);
          setMentionQuery(query);
          mentionStartRef.current = atIndex;
          return;
        }
      }
      setShowMentions(false);
    },
    []
  );

  const handleMentionSelect = useCallback(
    (member: Member) => {
      const name = member.user.name || member.user.email;
      const before = input.slice(0, mentionStartRef.current);
      const after = input.slice(
        mentionStartRef.current + 1 + mentionQuery.length
      );
      setInput(`${before}@${name} ${after}`);
      setShowMentions(false);
      setMentionedIds((prev) =>
        prev.includes(member.user.id) ? prev : [...prev, member.user.id]
      );
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [input, mentionQuery]
  );

  const handleSubmit = useCallback(() => {
    if (!input.trim()) return;
    createComment.mutate(
      {
        id: anchorId,
        pageId,
        content: input.trim(),
        quote,
        mentionedUserIds: mentionedIds,
      },
      { onSuccess: () => onSubmit(anchorId) }
    );
  }, [input, anchorId, pageId, quote, mentionedIds, createComment, onSubmit]);

  const clampedLeft = Math.min(left, window.innerWidth - 304);

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-50 w-72 rounded-lg border bg-popover shadow-lg"
      style={{ top, left: clampedLeft }}
    >
      {quote && (
        <div className="px-3 pt-2.5 pb-1">
          <div className="text-xs text-muted-foreground border-l-2 border-yellow-400 dark:border-yellow-600 pl-2 italic truncate">
            &ldquo;{quote}&rdquo;
          </div>
        </div>
      )}

      <div className="p-2.5 pt-1.5">
        <div className="relative">
          {showMentions && (
            <div className="absolute bottom-full left-0 mb-1 w-full rounded-lg border bg-popover shadow-lg overflow-hidden z-50">
              {members
                .filter((m) => {
                  const name = (m.user.name || m.user.email).toLowerCase();
                  return name.includes(mentionQuery.toLowerCase());
                })
                .slice(0, 5)
                .map((member) => (
                  <button
                    key={member.id}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent text-left"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleMentionSelect(member);
                    }}
                  >
                    <Avatar size="sm">
                      {member.user.image && (
                        <AvatarImage src={member.user.image} />
                      )}
                      <AvatarFallback>
                        {getInitials(member.user)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">
                      {member.user.name || member.user.email}
                    </span>
                  </button>
                ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            className="w-full min-h-[32px] max-h-24 rounded-md border border-input bg-transparent px-2.5 py-1.5 text-xs outline-none resize-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 field-sizing-content"
            placeholder="Add a comment... @ to mention"
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
              if (e.key === "Escape") {
                onCancel();
              }
            }}
            rows={1}
          />
        </div>

        <div className="flex justify-end gap-1.5 mt-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={handleSubmit}
            disabled={!input.trim() || createComment.isPending}
          >
            <Send className="h-3 w-3 mr-1" />
            Comment
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Inline Comments Container ───────────────────────────────

interface InlineCommentsProps {
  pageId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: BlockNoteEditor<any, any, any>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function InlineComments({ pageId, editor, containerRef }: InlineCommentsProps) {
  const { data: comments = [] } = useComments(pageId);
  const [viewportPositions, setViewportPositions] = useState<
    Map<string, { top: number; left: number }>
  >(new Map());
  const [pendingComment, setPendingComment] = useState<{
    anchorId: string;
    quote: string;
    top: number;
    left: number;
  } | null>(null);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const unresolvedComments = useMemo(
    () => comments.filter((c) => !c.is_resolved),
    [comments]
  );

  const updatePositions = useCallback(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const panelLeft = Math.min(containerRect.right + 16, window.innerWidth - 304);

    const highlights = container.querySelectorAll("[data-comment-id]");
    const next = new Map<string, { top: number; left: number }>();

    highlights.forEach((el) => {
      const id = el.getAttribute("data-comment-id");
      if (id) {
        const rect = el.getBoundingClientRect();
        next.set(id, { top: rect.top, left: panelLeft });
      }
    });

    setViewportPositions((prev) => {
      let same = prev.size === next.size;
      if (same) {
        for (const [k, v] of next) {
          const p = prev.get(k);
          if (!p || Math.abs(p.top - v.top) > 1 || Math.abs(p.left - v.left) > 1) {
            same = false;
            break;
          }
        }
      }
      return same ? prev : next;
    });
  }, [containerRef]);

  useEffect(() => {
    updatePositions();
    const interval = setInterval(updatePositions, 1000);

    const container = containerRef.current;
    const scrollParent = container?.closest(".overflow-y-auto");
    const onScrollOrResize = () => updatePositions();
    scrollParent?.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      clearInterval(interval);
      scrollParent?.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddComment = useCallback(
    (anchorId: string, quote: string, rect: DOMRect) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const panelLeft = Math.min(containerRect.right + 16, window.innerWidth - 304);
      setPendingComment({
        anchorId,
        quote,
        top: rect.top,
        left: panelLeft,
      });
    },
    [containerRef]
  );

  const handleCommentSubmitted = useCallback(() => {
    setPendingComment(null);
  }, []);

  const handleCommentCancel = useCallback(() => {
    if (pendingComment) {
      removeHighlightById(editor, pendingComment.anchorId);
    }
    setPendingComment(null);
  }, [editor, pendingComment]);

  const handleResolve = useCallback(
    (commentId: string) => {
      removeHighlightById(editor, commentId);
    },
    [editor]
  );

  // Expose handleAddComment for the formatting toolbar button
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (editor as any).__inlineComments = { handleAddComment };
  }, [editor, handleAddComment]);

  // Keyboard shortcut: Cmd/Ctrl+Shift+M to add comment on selected text
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dom = (editor as any).domElement as HTMLElement | undefined;
    if (!dom) return;

    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "m" || e.key === "M")) {
        e.preventDefault();
        e.stopPropagation();
        const selectedText = editor.getSelectedText();
        if (!selectedText) return;

        const anchorId = crypto.randomUUID();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (editor as any).addStyles({ commentHighlight: anchorId });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const boundingBox = (editor as any).getSelectionBoundingBox?.();
        if (boundingBox) {
          handleAddComment(anchorId, selectedText, boundingBox);
        }
      }
    };
    dom.addEventListener("keydown", handler, { capture: true });
    return () => dom.removeEventListener("keydown", handler, { capture: true });
  }, [editor, handleAddComment]);

  const cardLayout = computeCardLayout(unresolvedComments, viewportPositions);

  return (
    <>
      {unresolvedComments.map((comment) => {
        const pos = cardLayout.get(comment.id);
        if (!pos) return null;
        return createPortal(
          <div
            key={comment.id}
            className="fixed z-40"
            style={{ top: pos.top, left: pos.left }}
            onMouseEnter={() => setActiveCommentId(comment.id)}
            onMouseLeave={() => setActiveCommentId(null)}
          >
            <CommentCard
              comment={comment}
              pageId={pageId}
              active={activeCommentId === comment.id}
              onResolve={() => handleResolve(comment.id)}
            />
          </div>,
          document.body
        );
      })}

      {pendingComment && (
        <CommentPopover
          pageId={pageId}
          anchorId={pendingComment.anchorId}
          quote={pendingComment.quote}
          top={pendingComment.top}
          left={pendingComment.left}
          onSubmit={handleCommentSubmitted}
          onCancel={handleCommentCancel}
        />
      )}
    </>
  );
}

function computeCardLayout(
  comments: Comment[],
  positions: Map<string, { top: number; left: number }>
): Map<string, { top: number; left: number }> {
  const result = new Map<string, { top: number; left: number }>();
  const MIN_GAP = 8;
  const CARD_HEIGHT = 80;
  let lastBottom = -Infinity;

  const sorted = [...comments]
    .map((c) => ({ id: c.id, pos: positions.get(c.id) }))
    .filter((c): c is { id: string; pos: { top: number; left: number } } => !!c.pos)
    .sort((a, b) => a.pos.top - b.pos.top);

  for (const item of sorted) {
    let top = item.pos.top;
    if (top < lastBottom + MIN_GAP) {
      top = lastBottom + MIN_GAP;
    }
    result.set(item.id, { top, left: item.pos.left });
    lastBottom = top + CARD_HEIGHT;
  }

  return result;
}

// ─── Formatting Toolbar Comment Button ───────────────────────

export function CommentToolbarButton({
  editor,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: BlockNoteEditor<any, any, any>;
}) {
  const handleClick = useCallback(() => {
    const selectedText = editor.getSelectedText();
    if (!selectedText) return;

    const anchorId = crypto.randomUUID();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (editor as any).addStyles({ commentHighlight: anchorId });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const boundingBox = (editor as any).getSelectionBoundingBox?.();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inlineComments = (editor as any).__inlineComments;
    if (inlineComments?.handleAddComment && boundingBox) {
      inlineComments.handleAddComment(anchorId, selectedText, boundingBox);
    }
  }, [editor]);

  return (
    <button
      className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
      onClick={handleClick}
      title="Add comment"
    >
      <MessageSquare className="h-3.5 w-3.5" />
    </button>
  );
}
