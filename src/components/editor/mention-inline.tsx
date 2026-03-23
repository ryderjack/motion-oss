"use client";

import { createReactInlineContentSpec } from "@blocknote/react";

export const Mention = createReactInlineContentSpec(
  {
    type: "mention" as const,
    propSchema: {
      userId: { default: "" },
      userName: { default: "" },
    },
    content: "none",
  },
  {
    render: function MentionInline({ inlineContent }) {
      return (
        <span
          className="inline-flex items-center gap-0.5 rounded-sm bg-primary/10 text-primary px-1 py-0.5 text-sm font-medium cursor-default"
          contentEditable={false}
        >
          @{inlineContent.props.userName || "Unknown"}
        </span>
      );
    },
  }
);
