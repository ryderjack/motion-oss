import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { pageId } = await params;
  const { blocks } = await request.json();

  const { data: page } = await supabase
    .from("pages")
    .select("workspace_id")
    .eq("id", pageId)
    .single();
  if (!page)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: member } = await supabase
    .from("members")
    .select("role")
    .eq("user_id", userId)
    .eq("workspace_id", page.workspace_id)
    .single();
  if (!member || member.role === "VIEWER")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: oldBlocks } = await supabase
    .from("blocks")
    .select("id, type, content")
    .eq("page_id", pageId)
    .order("position", { ascending: true });

  await supabase.from("blocks").delete().eq("page_id", pageId);

  if (blocks.length > 0) {
    const rows = blocks.map(
      (block: { id: string; type: string; content: unknown }, i: number) => ({
        id: block.id,
        type: block.type,
        content: block.content,
        position: i,
        page_id: pageId,
      })
    );
    await supabase.from("blocks").insert(rows);
  }

  await supabase
    .from("pages")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", pageId);

  function extractText(block: { content?: unknown }): string {
    const c = block.content;
    if (!c || typeof c !== "object") return "";
    const inner = (c as Record<string, unknown>).content;
    if (!Array.isArray(inner)) return "";
    return inner
      .filter((item: Record<string, unknown>) => item.type === "text" && item.text)
      .map((item: Record<string, unknown>) => item.text as string)
      .join("");
  }

  function blockLabel(block: { type?: string; content?: unknown }): string {
    const c = block.content;
    const type = (c && typeof c === "object" ? String((c as Record<string, unknown>).type || "") : "") || block.type || "block";
    return type;
  }

  const oldMap = new Map(
    (oldBlocks || []).map((b: { id: string; type: string; content: unknown }) => [b.id, b])
  );
  const newMap = new Map(
    blocks.map((b: { id: string; type: string; content: unknown }) => [b.id, b])
  );

  const diffs: Array<{ kind: "added" | "removed" | "modified"; type: string; text?: string; from?: string; to?: string }> = [];

  for (const b of blocks as Array<{ id: string; type: string; content: unknown }>) {
    const old = oldMap.get(b.id) as { id: string; type: string; content: unknown } | undefined;
    if (!old) {
      const text = extractText(b);
      if (text) diffs.push({ kind: "added", type: blockLabel(b), text });
    } else {
      const oldText = extractText(old);
      const newText = extractText(b);
      if (oldText !== newText && (oldText || newText)) {
        diffs.push({ kind: "modified", type: blockLabel(b), from: oldText, to: newText });
      }
    }
  }

  for (const b of (oldBlocks || []) as Array<{ id: string; type: string; content: unknown }>) {
    if (!newMap.has(b.id)) {
      const text = extractText(b);
      if (text) diffs.push({ kind: "removed", type: blockLabel(b), text });
    }
  }

  if (diffs.length > 0) {
    const truncated = diffs.slice(0, 20);
    supabase.from("page_history").insert({
      page_id: pageId,
      user_id: userId,
      action: "update_blocks",
      changes: {
        diffs: truncated,
        totalChanges: diffs.length,
      },
    }).then(() => {});
  }

  return NextResponse.json({ success: true });
}
