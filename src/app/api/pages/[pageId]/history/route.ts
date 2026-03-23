import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { pageId } = await params;

  const { data: page } = await supabase
    .from("pages")
    .select("workspace_id, is_private, created_by")
    .eq("id", pageId)
    .single();

  if (!page)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (page.is_private && page.created_by !== userId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: member } = await supabase
    .from("members")
    .select("id")
    .eq("user_id", userId)
    .eq("workspace_id", page.workspace_id)
    .single();
  if (!member)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 100);
  const offset = Number(url.searchParams.get("offset") || "0");

  const { data: history, count, error: historyError } = await supabase
    .from("page_history")
    .select("id, page_id, user_id, action, changes, created_at", { count: "exact" })
    .eq("page_id", pageId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (historyError) {
    return NextResponse.json({ entries: [], total: 0 });
  }

  const userIds = [...new Set((history || []).map((h) => h.user_id))];
  const { data: users } = userIds.length > 0
    ? await supabase.from("users").select("id, name, email, image").in("id", userIds)
    : { data: [] };

  const userMap = new Map((users || []).map((u) => [u.id, u]));

  const entries = (history || []).map((h) => ({
    id: h.id,
    pageId: h.page_id,
    action: h.action,
    changes: h.changes,
    createdAt: h.created_at,
    user: userMap.get(h.user_id) || { id: h.user_id, name: null, email: "Unknown", image: null },
  }));

  return NextResponse.json({ entries, total: count || 0 });
}
