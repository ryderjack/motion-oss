"use client";

import { useState } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { Video } from "lucide-react";

function extractLoomId(url: string): string | null {
  const match = url.match(
    /(?:loom\.com\/(?:share|embed))\/([a-f0-9]{32})/
  );
  return match ? match[1] : null;
}

export const LoomBlock = createReactBlockSpec(
  {
    type: "loom" as const,
    propSchema: {
      videoId: { default: "" },
      url: { default: "" },
    },
    content: "none" as const,
  },
  {
    render: function LoomEmbed({ block, editor }) {
      const [inputUrl, setInputUrl] = useState("");
      const videoId = block.props.videoId;

      if (!videoId) {
        return (
          <div
            className="flex items-center gap-3 w-full p-3 border border-dashed border-border rounded-lg bg-muted/30"
            contentEditable={false}
          >
            <Video className="h-5 w-5 text-muted-foreground shrink-0" />
            <input
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              placeholder="Paste a Loom URL…"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const id = extractLoomId(inputUrl);
                  if (id) {
                    editor.updateBlock(block, {
                      props: { videoId: id, url: inputUrl },
                    });
                  }
                }
              }}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text/plain");
                const id = extractLoomId(pasted);
                if (id) {
                  e.preventDefault();
                  editor.updateBlock(block, {
                    props: { videoId: id, url: pasted },
                  });
                }
              }}
            />
          </div>
        );
      }

      return (
        <div
          className="w-full my-1 rounded-lg overflow-hidden"
          contentEditable={false}
        >
          <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
            <iframe
              src={`https://www.loom.com/embed/${videoId}`}
              className="absolute inset-0 w-full h-full border-0 rounded-lg"
              allowFullScreen
              allow="autoplay; fullscreen"
            />
          </div>
        </div>
      );
    },
  }
);

export { extractLoomId };
