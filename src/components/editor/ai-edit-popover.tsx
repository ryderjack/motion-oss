"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Loader2, Send, X, Check, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BlockNoteEditor } from "@blocknote/core";

type AiMode = "edit" | "generate";

interface AiEditPopoverProps {
  mode: AiMode;
  selectedText?: string;
  top: number;
  left: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: BlockNoteEditor<any, any, any>;
  savedSelection: { from: number; to: number } | null;
  onClose: () => void;
}

export function AiEditPopover({
  mode,
  selectedText,
  top,
  left,
  editor,
  savedSelection,
  onClose,
}: AiEditPopoverProps) {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const clickedInsideRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    const markInside = () => {
      clickedInsideRef.current = true;
    };
    el.addEventListener("mousedown", markInside);
    return () => el.removeEventListener("mousedown", markInside);
  }, []);

  useEffect(() => {
    const handler = () => {
      if (clickedInsideRef.current) {
        clickedInsideRef.current = false;
        return;
      }
      if (!isLoading && !result) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, isLoading, result]);

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: mode === "edit" ? selectedText : undefined,
          prompt: prompt.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      setResult(data.editedText);
    } catch {
      setError("Failed to connect to AI service");
    } finally {
      setIsLoading(false);
    }
  }, [prompt, selectedText, isLoading, mode]);

  const applyResult = useCallback(() => {
    if (!result || !savedSelection) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tiptap = (editor as any)._tiptapEditor;
    if (!tiptap) return;

    if (mode === "edit") {
      tiptap
        .chain()
        .focus()
        .setTextSelection(savedSelection)
        .deleteSelection()
        .insertContent(result)
        .run();
    } else {
      tiptap
        .chain()
        .focus()
        .setTextSelection(savedSelection.from)
        .insertContent(result)
        .run();
    }

    setApplied(true);
  }, [result, savedSelection, editor, mode]);

  const undoResult = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tiptap = (editor as any)._tiptapEditor;
    if (!tiptap) return;

    tiptap.chain().focus().undo().run();
    setApplied(false);
    setResult(null);
  }, [editor]);

  const clampedLeft = Math.min(left, window.innerWidth - 340);
  const clampedTop = Math.min(top, window.innerHeight - 300);

  const isEdit = mode === "edit";
  const title = isEdit ? "AI Edit" : "Ask AI";
  const placeholder = isEdit
    ? "Make it more concise, fix grammar, translate to Spanish..."
    : "Write a summary, draft an email, brainstorm ideas...";
  const submitLabel = isEdit ? "Edit" : "Generate";
  const loadingLabel = isEdit ? "Editing..." : "Generating...";

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-50 w-80 rounded-lg border bg-popover shadow-lg"
      style={{ top: clampedTop, left: clampedLeft }}
    >
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5 border-b border-border/50">
        <Sparkles className="h-3.5 w-3.5 text-violet-500 shrink-0" />
        <span className="text-xs font-medium text-foreground">{title}</span>
        <kbd className="ml-auto mr-1 text-[10px] text-muted-foreground/60 font-mono">
          {isEdit ? "" : "⌘J"}
        </kbd>
        <button
          className="p-0.5 rounded hover:bg-accent text-muted-foreground"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {isEdit && selectedText && (
        <div className="px-3 pt-2 pb-1">
          <div className="text-xs text-muted-foreground border-l-2 border-violet-400 dark:border-violet-600 pl-2 italic line-clamp-2">
            &ldquo;{selectedText}&rdquo;
          </div>
        </div>
      )}

      {!result && !applied && (
        <div className="p-2.5 pt-1.5">
          <textarea
            ref={inputRef}
            className="w-full min-h-[32px] max-h-24 rounded-md border border-input bg-transparent px-2.5 py-1.5 text-xs outline-none resize-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 field-sizing-content"
            placeholder={placeholder}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
              if (e.key === "Escape") {
                onClose();
              }
            }}
            rows={1}
            disabled={isLoading}
          />

          {error && (
            <p className="text-xs text-destructive mt-1.5">{error}</p>
          )}

          <div className="flex justify-end gap-1.5 mt-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-6 px-2 text-xs bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 text-white"
              onClick={handleSubmit}
              disabled={!prompt.trim() || isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Send className="h-3 w-3 mr-1" />
              )}
              {isLoading ? loadingLabel : submitLabel}
            </Button>
          </div>
        </div>
      )}

      {result && !applied && (
        <div className="p-2.5 pt-1.5">
          <div className="rounded-md border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 px-2.5 py-2 text-xs text-foreground whitespace-pre-wrap max-h-40 overflow-y-auto">
            {result}
          </div>

          <div className="flex justify-end gap-1.5 mt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => {
                setResult(null);
                setPrompt("");
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
            >
              Try again
            </Button>
            <Button
              size="sm"
              className="h-6 px-2 text-xs bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 text-white"
              onClick={applyResult}
            >
              <Check className="h-3 w-3 mr-1" />
              Accept
            </Button>
          </div>
        </div>
      )}

      {applied && (
        <div className="p-2.5 pt-1.5">
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" />
            <span>{isEdit ? "Edit applied" : "Text inserted"}</span>
          </div>
          <div className="flex justify-end gap-1.5 mt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={undoResult}
            >
              <Undo2 className="h-3 w-3 mr-1" />
              Undo
            </Button>
            <Button
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={onClose}
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

// ─── Formatting Toolbar AI Edit Button ───────────────────────

export function AiEditToolbarButton({
  editor,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: BlockNoteEditor<any, any, any>;
}) {
  const handleClick = useCallback(() => {
    const selectedText = editor.getSelectedText();
    if (!selectedText) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tiptap = (editor as any)._tiptapEditor;
    const { from, to } = tiptap.state.selection;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const boundingBox = (editor as any).getSelectionBoundingBox?.();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aiEdit = (editor as any).__aiEdit;
    if (aiEdit?.handleOpen && boundingBox) {
      aiEdit.handleOpen("edit", selectedText, { from, to }, boundingBox);
    }
  }, [editor]);

  return (
    <button
      className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
      onClick={handleClick}
      title="Edit with AI"
    >
      <Sparkles className="h-3.5 w-3.5" />
    </button>
  );
}
