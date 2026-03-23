"use client";

import { use } from "react";
import { WorkspaceView } from "@/components/workspace/workspace-view";

export default function PageRoute({
  params,
}: {
  params: Promise<{ pageId: string }>;
}) {
  const { pageId } = use(params);
  return <WorkspaceView pageId={pageId} />;
}
