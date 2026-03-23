import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

async function checkAccess(userId: string, pageId: string) {
  const { data: page } = await supabase
    .from("pages")
    .select("workspace_id, type")
    .eq("id", pageId)
    .single();
  if (!page || page.type !== "DATABASE") return null;

  const { data: member } = await supabase
    .from("members")
    .select("role")
    .eq("user_id", userId)
    .eq("workspace_id", page.workspace_id)
    .single();
  if (!member || member.role === "VIEWER") return null;

  return member;
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
  if (!(await checkAccess(userId, pageId)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, type, options } = await request.json();

  const { data: maxPosRow } = await supabase
    .from("database_properties")
    .select("position")
    .eq("page_id", pageId)
    .order("position", { ascending: false })
    .limit(1)
    .single();

  const { data: property } = await supabase
    .from("database_properties")
    .insert({
      name: name || "New Property",
      type: type || "text",
      options: options || null,
      position: (maxPosRow?.position ?? -1) + 1,
      page_id: pageId,
    })
    .select()
    .single();

  return NextResponse.json(property, { status: 201 });
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
  if (!(await checkAccess(userId, pageId)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, name, type, options } = await request.json();

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (type !== undefined) data.type = type;
  if (options !== undefined) data.options = options;

  const { data: updated } = await supabase
    .from("database_properties")
    .update(data)
    .eq("id", id)
    .eq("page_id", pageId)
    .select()
    .single();

  return NextResponse.json(updated);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { pageId } = await params;
  if (!(await checkAccess(userId, pageId)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { order } = await request.json() as {
    order: Array<{ id: string; position: number }>;
  };

  if (!Array.isArray(order) || order.length === 0)
    return NextResponse.json({ error: "Invalid order" }, { status: 400 });

  const updates = order.map(({ id, position }) =>
    supabase
      .from("database_properties")
      .update({ position })
      .eq("id", id)
      .eq("page_id", pageId)
  );

  await Promise.all(updates);

  return NextResponse.json({ success: true });
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
  if (!(await checkAccess(userId, pageId)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await request.json();
  await supabase.from("database_properties").delete().eq("id", id).eq("page_id", pageId);
  return NextResponse.json({ success: true });
}
