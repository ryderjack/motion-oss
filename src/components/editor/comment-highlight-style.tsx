"use client";

import { createReactStyleSpec } from "@blocknote/react";

export const CommentHighlight = createReactStyleSpec(
  {
    type: "commentHighlight",
    propSchema: "string",
  },
  {
    render: ({ value, contentRef }) => {
      return (
        <span
          ref={contentRef}
          className="bg-yellow-100 dark:bg-yellow-900/40 border-b-2 border-yellow-400 dark:border-yellow-600 cursor-pointer transition-colors hover:bg-yellow-200 dark:hover:bg-yellow-900/60"
          data-comment-id={value}
        />
      );
    },
  }
);
