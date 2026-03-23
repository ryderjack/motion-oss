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
  if (!member)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: comments, error } = await supabase
    .from("comments")
    .select(
      "*, user:users!comments_user_id_fkey(id, name, email, image), resolver:users!comments_resolved_by_fkey(id, name, email, image)"
    )
    .eq("page_id", pageId)
    .order("created_at", { ascending: true });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const parsed = (comments || []).map((c) => {
    let text = c.content;
    let quote: string | null = null;
    try {
      const json = JSON.parse(c.content);
      text = json.text;
      quote = json.quote || null;
    } catch {
      // plain text fallback
    }
    return { ...c, content: text, quote };
  });

  return NextResponse.json(parsed);
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
  const { id, content, quote, mentionedUserIds } = await request.json();

  if (!content?.trim())
    return NextResponse.json(
      { error: "Content is required" },
      { status: 400 }
    );

  const { data: page } = await supabase
    .from("pages")
    .select("workspace_id, title")
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
  if (!member)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const stored = JSON.stringify({ text: content.trim(), quote: quote || null });

  const insertData: Record<string, unknown> = {
    page_id: pageId,
    user_id: userId,
    content: stored,
  };
  if (id) insertData.id = id;

  const { data: comment, error } = await supabase
    .from("comments")
    .insert(insertData)
    .select(
      "*, user:users!comments_user_id_fkey(id, name, email, image), resolver:users!comments_resolved_by_fkey(id, name, email, image)"
    )
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  if (Array.isArray(mentionedUserIds) && mentionedUserIds.length > 0) {
    const notifications = mentionedUserIds
      .filter((uid: string) => uid !== userId)
      .map((mentionedId: string) => ({
        user_id: mentionedId,
        actor_id: userId,
        type: "comment_mention",
        page_id: pageId,
        page_title: page.title || "Untitled",
        content: `mentioned you in a comment on ${page.title || "Untitled"}`,
      }));

    if (notifications.length > 0) {
      await supabase.from("notifications").insert(notifications);
    }
  }

  let parsedContent = comment.content;
  let parsedQuote: string | null = null;
  try {
    const json = JSON.parse(comment.content);
    parsedContent = json.text;
    parsedQuote = json.quote || null;
  } catch {
    // plain text fallback
  }

  return NextResponse.json({
    ...comment,
    content: parsedContent,
    quote: parsedQuote,
  });
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
  const { commentId } = await request.json();

  if (!commentId)
    return NextResponse.json(
      { error: "commentId is required" },
      { status: 400 }
    );

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
  if (!member)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: comment, error } = await supabase
    .from("comments")
    .update({
      is_resolved: true,
      resolved_by: userId,
    })
    .eq("id", commentId)
    .eq("page_id", pageId)
    .select(
      "*, user:users!comments_user_id_fkey(id, name, email, image), resolver:users!comments_resolved_by_fkey(id, name, email, image)"
    )
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(comment);
}
