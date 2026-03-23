import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: notifications, error } = await supabase
    .from("notifications")
    .select("*, actor:users!notifications_actor_id_fkey(id, name, email, image)")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(notifications);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const body = await req.json();
  const { mentionedUserId, pageId, pageTitle } = body;

  if (!mentionedUserId || !pageId) {
    return NextResponse.json(
      { error: "mentionedUserId and pageId are required" },
      { status: 400 }
    );
  }

  if (mentionedUserId === userId) {
    return NextResponse.json({ skipped: true });
  }

  const { data: page } = await supabase
    .from("pages")
    .select("workspace_id")
    .eq("id", pageId)
    .single();

  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const { data: callerMember } = await supabase
    .from("members")
    .select("id")
    .eq("user_id", userId)
    .eq("workspace_id", page.workspace_id)
    .single();

  if (!callerMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: targetMember } = await supabase
    .from("members")
    .select("id")
    .eq("user_id", mentionedUserId)
    .eq("workspace_id", page.workspace_id)
    .single();

  if (!targetMember) {
    return NextResponse.json({ error: "Target user is not in this workspace" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("notifications")
    .insert({
      user_id: mentionedUserId,
      actor_id: userId,
      type: "mention",
      page_id: pageId,
      page_title: pageTitle || "Untitled",
      content: `mentioned you in ${pageTitle || "Untitled"}`,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const body = await req.json();
  const { notificationId, markAllRead } = body;

  if (markAllRead) {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  if (!notificationId) {
    return NextResponse.json(
      { error: "notificationId or markAllRead required" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
