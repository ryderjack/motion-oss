import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { authenticateApiRequest } from "@/lib/api-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ blockId: string }> }
) {
  const authResult = await authenticateApiRequest(request);
  if (!authResult.ok) return authResult.response;

  const { blockId } = await params;

  const { data: block } = await supabase
    .from("blocks")
    .select("id, type, content, position, page_id")
    .eq("id", blockId)
    .single();

  if (!block) {
    return NextResponse.json({ error: "Block not found" }, { status: 404 });
  }

  const { data: page } = await supabase
    .from("pages")
    .select("workspace_id")
    .eq("id", block.page_id)
    .single();

  if (!page || page.workspace_id !== authResult.workspaceId) {
    return NextResponse.json({ error: "Block not found" }, { status: 404 });
  }

  return NextResponse.json(block);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ blockId: string }> }
) {
  const authResult = await authenticateApiRequest(request);
  if (!authResult.ok) return authResult.response;

  const { blockId } = await params;
  const body = await request.json();

  const { data: existing } = await supabase
    .from("blocks")
    .select("id, page_id")
    .eq("id", blockId)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Block not found" }, { status: 404 });
  }

  const { data: page } = await supabase
    .from("pages")
    .select("workspace_id")
    .eq("id", existing.page_id)
    .single();

  if (!page || page.workspace_id !== authResult.workspaceId) {
    return NextResponse.json({ error: "Block not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.type !== undefined) updates.type = body.type;
  if (body.content !== undefined) updates.content = body.content;
  if (body.position !== undefined) updates.position = body.position;

  const { data: updated, error } = await supabase
    .from("blocks")
    .update(updates)
    .eq("id", blockId)
    .select("id, type, content, position, page_id")
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { error: "Failed to update block", details: error?.message },
      { status: 500 }
    );
  }

  await supabase
    .from("pages")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", existing.page_id);

  return NextResponse.json(updated);
}
