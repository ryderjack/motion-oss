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

  const { data: guests } = await supabase
    .from("page_guests")
    .select("id, email, permission, token, created_at, invited_by")
    .eq("page_id", pageId)
    .order("created_at", { ascending: true });

  return NextResponse.json(guests || []);
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
  const { email, permission = "VIEWER" } = await request.json();

  if (!email || typeof email !== "string")
    return NextResponse.json({ error: "Email is required" }, { status: 400 });

  const normalizedEmail = email.toLowerCase().trim();

  if (!normalizedEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });

  if (!["VIEWER", "EDITOR"].includes(permission))
    return NextResponse.json({ error: "Invalid permission" }, { status: 400 });

  const { data: page } = await supabase
    .from("pages")
    .select("workspace_id, created_by, title")
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

  const { data: existingGuest } = await supabase
    .from("page_guests")
    .select("id")
    .eq("page_id", pageId)
    .eq("email", normalizedEmail)
    .single();
  if (existingGuest)
    return NextResponse.json(
      { error: "This email already has access to this page" },
      { status: 400 }
    );

  const { data: guest, error } = await supabase
    .from("page_guests")
    .insert({
      page_id: pageId,
      email: normalizedEmail,
      permission,
      invited_by: userId,
    })
    .select("id, email, permission, token, created_at, invited_by")
    .single();

  if (error)
    return NextResponse.json({ error: "Failed to create guest invite" }, { status: 500 });

  supabase
    .from("page_history")
    .insert({
      page_id: pageId,
      user_id: userId,
      action: "share_with_guest",
      changes: { email: normalizedEmail, permission },
    })
    .then(() => {});

  return NextResponse.json(guest, { status: 201 });
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
  const { guestId } = await request.json();

  if (!guestId)
    return NextResponse.json({ error: "guestId is required" }, { status: 400 });

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

  const { data: guest } = await supabase
    .from("page_guests")
    .select("email, permission")
    .eq("id", guestId)
    .eq("page_id", pageId)
    .single();

  if (!guest)
    return NextResponse.json({ error: "Guest not found" }, { status: 404 });

  await supabase.from("page_guests").delete().eq("id", guestId);

  supabase
    .from("page_history")
    .insert({
      page_id: pageId,
      user_id: userId,
      action: "remove_guest",
      changes: { email: guest.email, permission: guest.permission },
    })
    .then(() => {});

  return NextResponse.json({ success: true });
}
