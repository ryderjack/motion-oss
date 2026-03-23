"use client";

import { useEffect, useRef, useCallback } from "react";
import data from "@emoji-mart/data";
import { Picker } from "emoji-mart";
import { useThemeStore } from "@/hooks/use-theme";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const theme = useThemeStore((s) => s.theme);

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClickOutside]);

  useEffect(() => {
    const el = pickerRef.current;
    if (!el) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const picker = new (Picker as any)({
      data,
      theme,
      onEmojiSelect: (emoji: { native: string }) => {
        onSelect(emoji.native);
      },
      autoFocus: true,
      previewPosition: "none",
      skinTonePosition: "search",
      maxFrequentRows: 2,
    });

    el.innerHTML = "";
    el.appendChild(picker);

    return () => {
      el.innerHTML = "";
    };
  }, [theme, onSelect]);

  return (
    <div
      ref={containerRef}
      className="absolute top-full left-0 z-50 mt-1"
    >
      <div ref={pickerRef} />
      <button
        className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 bg-popover border border-t-0 rounded-b-lg"
        onClick={() => onSelect("")}
      >
        Remove icon
      </button>
    </div>
  );
}
