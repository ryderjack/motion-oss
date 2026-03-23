import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { authenticateApiRequest } from "@/lib/api-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const authResult = await authenticateApiRequest(request);
  if (!authResult.ok) return authResult.response;

  const { pageId } = await params;

  const { data: page } = await supabase
    .from("pages")
    .select("id, workspace_id")
    .eq("id", pageId)
    .single();

  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  if (page.workspace_id !== authResult.workspaceId) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const { data: blocks, error } = await supabase
    .from("blocks")
    .select("id, type, content, position")
    .eq("page_id", pageId)
    .order("position", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ pageId, blocks: blocks || [] });
}
