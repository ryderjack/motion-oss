import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { pageId } = await params;

  const { data: page } = await supabase
    .from("pages")
    .select("workspace_id, created_by")
    .eq("id", pageId)
    .single();
  if (!page)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: member } = await supabase
    .from("members")
    .select("id")
    .eq("user_id", userId)
    .eq("workspace_id", page.workspace_id)
    .single();
  if (!member)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: shares } = await supabase
    .from("page_shares")
    .select("id, user_id, permission, created_at, user:users(id, name, email, image)")
    .eq("page_id", pageId)
    .order("created_at", { ascending: true });

  return NextResponse.json(shares || []);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { pageId } = await params;
  const { userId: targetUserId, permission = "VIEWER" } = await request.json();

  if (!targetUserId)
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  if (!["VIEWER", "EDITOR"].includes(permission))
    return NextResponse.json({ error: "Invalid permission" }, { status: 400 });

  const { data: page } = await supabase
    .from("pages")
    .select("workspace_id, created_by, is_private")
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

  const { data: targetMember } = await supabase
    .from("members")
    .select("id")
    .eq("user_id", targetUserId)
    .eq("workspace_id", page.workspace_id)
    .single();
  if (!targetMember)
    return NextResponse.json({ error: "User is not a workspace member" }, { status: 400 });

  const { data: existing } = await supabase
    .from("page_shares")
    .select("id")
    .eq("page_id", pageId)
    .eq("user_id", targetUserId)
    .single();
  if (existing)
    return NextResponse.json({ error: "User already has access" }, { status: 400 });

  if (!page.is_private) {
    await supabase
      .from("pages")
      .update({ is_private: true })
      .eq("id", pageId);
  }

  const { data: share, error } = await supabase
    .from("page_shares")
    .insert({ page_id: pageId, user_id: targetUserId, permission })
    .select("id, user_id, permission, created_at, user:users(id, name, email, image)")
    .single();

  if (error)
    return NextResponse.json({ error: "Failed to share page" }, { status: 500 });

  supabase
    .from("page_history")
    .insert({
      page_id: pageId,
      user_id: userId,
      action: "share_with_member",
      changes: { target_user_id: targetUserId, permission },
    })
    .then(() => {});

  return NextResponse.json(share, { status: 201 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { pageId } = await params;
  const { shareId, permission } = await request.json();

  if (!shareId || !permission)
    return NextResponse.json({ error: "shareId and permission required" }, { status: 400 });
  if (!["VIEWER", "EDITOR"].includes(permission))
    return NextResponse.json({ error: "Invalid permission" }, { status: 400 });

  const { data: page } = await supabase
    .from("pages")
    .select("workspace_id, created_by")
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

  const { data: updated } = await supabase
    .from("page_shares")
    .update({ permission })
    .eq("id", shareId)
    .eq("page_id", pageId)
    .select("id, user_id, permission, created_at, user:users(id, name, email, image)")
    .single();

  if (!updated)
    return NextResponse.json({ error: "Share not found" }, { status: 404 });

  return NextResponse.json(updated);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { pageId } = await params;
  const { shareId } = await request.json();

  if (!shareId)
    return NextResponse.json({ error: "shareId is required" }, { status: 400 });

  const { data: page } = await supabase
    .from("pages")
    .select("workspace_id, created_by")
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

  const { data: share } = await supabase
    .from("page_shares")
    .select("user_id, permission")
    .eq("id", shareId)
    .eq("page_id", pageId)
    .single();

  if (!share)
    return NextResponse.json({ error: "Share not found" }, { status: 404 });

  await supabase.from("page_shares").delete().eq("id", shareId);

  supabase
    .from("page_history")
    .insert({
      page_id: pageId,
      user_id: userId,
      action: "remove_member_share",
      changes: { target_user_id: share.user_id, permission: share.permission },
    })
    .then(() => {});

  return NextResponse.json({ success: true });
}
