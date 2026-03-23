"use client";

import { createContext, useContext } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { FileText, Table2 } from "lucide-react";

interface PageNavigationContextValue {
  onPageSelect?: (pageId: string) => void;
  children: Array<{
    id: string;
    title: string;
    icon: string | null;
    type: "PAGE" | "DATABASE";
  }>;
}

export const PageNavigationContext = createContext<PageNavigationContextValue>({
  children: [],
});

export const createSubpageBlock = createReactBlockSpec(
  {
    type: "subpage" as const,
    propSchema: {
      pageId: { default: "" },
      pageTitle: { default: "Untitled" },
    },
    content: "none" as const,
  },
  {
    render: function SubpageBlock({ block }) {
      const { onPageSelect, children } = useContext(PageNavigationContext);

      const pageId = block.props.pageId;
      const childPage = children.find((c) => c.id === pageId);
      const title = childPage?.title || block.props.pageTitle || "Untitled";
      const icon = childPage?.icon;
      const isDatabase = childPage?.type === "DATABASE";

      return (
        <div
          className="flex items-center gap-2 w-full py-1 cursor-pointer hover:bg-accent/50 rounded-sm transition-colors"
          onClick={() => onPageSelect?.(pageId)}
          contentEditable={false}
        >
          <span className="text-lg shrink-0">
            {icon || (isDatabase ? (
              <Table2 className="h-5 w-5 text-muted-foreground" />
            ) : (
              <FileText className="h-5 w-5 text-muted-foreground" />
            ))}
          </span>
          <span className="text-sm font-bold underline decoration-muted-foreground/50 underline-offset-2 truncate">{title}</span>
        </div>
      );
    },
  }
);
