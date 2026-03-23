import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  if (!workspaceId)
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });

  const { data: member } = await supabase
    .from("members")
    .select("id")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!member)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: templates } = await supabase
    .from("templates")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  return NextResponse.json(templates || []);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const body = await request.json();
  const { workspaceId, title, description, icon, type, blocks, properties, pageId } = body;

  const { data: member } = await supabase
    .from("members")
    .select("role")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!member || member.role === "VIEWER")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let templateBlocks = blocks;
  let templateProperties = properties;

  if (pageId) {
    const { data: sourcePage } = await supabase
      .from("pages")
      .select("workspace_id")
      .eq("id", pageId)
      .single();
    if (!sourcePage || sourcePage.workspace_id !== workspaceId)
      return NextResponse.json({ error: "Page not found in this workspace" }, { status: 404 });

    const [blocksRes, propsRes] = await Promise.all([
      supabase
        .from("blocks")
        .select("*")
        .eq("page_id", pageId)
        .order("position", { ascending: true }),
      supabase
        .from("database_properties")
        .select("*")
        .eq("page_id", pageId)
        .order("position", { ascending: true }),
    ]);
    templateBlocks = blocksRes.data;
    templateProperties = propsRes.data;
  }

  const { data: template } = await supabase
    .from("templates")
    .insert({
      title: title || "Untitled Template",
      description,
      icon,
      type: type || "PAGE",
      blocks: templateBlocks || [],
      properties: templateProperties || [],
      workspace_id: workspaceId,
    })
    .select()
    .single();

  return NextResponse.json(template, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const body = await request.json();
  const { id, title, description, icon, blocks, properties } = body;

  const { data: template } = await supabase
    .from("templates")
    .select("workspace_id")
    .eq("id", id)
    .single();
  if (!template)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: member } = await supabase
    .from("members")
    .select("role")
    .eq("user_id", userId)
    .eq("workspace_id", template.workspace_id)
    .single();
  if (!member || member.role === "VIEWER")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (icon !== undefined) updates.icon = icon;
  if (blocks !== undefined) updates.blocks = blocks;
  if (properties !== undefined) updates.properties = properties;

  const { data: updated } = await supabase
    .from("templates")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  return NextResponse.json(updated);
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { id } = await request.json();

  const { data: template } = await supabase
    .from("templates")
    .select("workspace_id")
    .eq("id", id)
    .single();
  if (!template)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: member } = await supabase
    .from("members")
    .select("role")
    .eq("user_id", userId)
    .eq("workspace_id", template.workspace_id)
    .single();
  if (!member || member.role === "VIEWER")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await supabase.from("templates").delete().eq("id", id);
  return NextResponse.json({ success: true });
}
