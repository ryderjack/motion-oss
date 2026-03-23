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
  const parentId = searchParams.get("parentId");
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

  let query = supabase
    .from("pages")
    .select("id, title, icon, type, view_mode, parent_id, position, is_favorite, is_private, is_locked, created_by")
    .eq("workspace_id", workspaceId)
    .eq("is_archived", false);

  if (parentId) {
    query = query.eq("parent_id", parentId);
  } else {
    query = query.is("parent_id", null);
  }

  const { data: pages, error: pagesError } = await query
    .order("position", { ascending: true });

  if (pagesError) {
    console.error("Pages query error:", pagesError);
    return NextResponse.json({ error: pagesError.message }, { status: 500 });
  }

  const allPages = pages || [];
  const pageIds = allPages.map((p) => p.id);

  const [{ data: shares }, { data: guests }, { data: childPages }] = await Promise.all([
    supabase
      .from("page_shares")
      .select("page_id, user_id")
      .in("page_id", pageIds.length ? pageIds : [""]),
    supabase
      .from("page_guests")
      .select("page_id")
      .in("page_id", pageIds.length ? pageIds : [""]),
    supabase
      .from("pages")
      .select("parent_id")
      .in("parent_id", pageIds.length ? pageIds : [""])
      .eq("is_archived", false),
  ]);

  const shareCountMap = new Map<string, number>();
  const sharedWithMe = new Set<string>();
  for (const s of shares || []) {
    shareCountMap.set(s.page_id, (shareCountMap.get(s.page_id) || 0) + 1);
    if (s.user_id === userId) sharedWithMe.add(s.page_id);
  }

  const guestCountMap = new Map<string, number>();
  for (const g of guests || []) {
    guestCountMap.set(g.page_id, (guestCountMap.get(g.page_id) || 0) + 1);
  }

  const childCountMap = new Map<string, number>();
  for (const c of childPages || []) {
    childCountMap.set(c.parent_id, (childCountMap.get(c.parent_id) || 0) + 1);
  }

  const visible = allPages.filter((p) => {
    if (p.is_private && p.created_by !== userId && !sharedWithMe.has(p.id))
      return false;
    return true;
  });

  const mapped = visible.map((p) => ({
    id: p.id,
    title: p.title,
    icon: p.icon,
    type: p.type,
    viewMode: p.view_mode,
    parentId: p.parent_id,
    position: p.position,
    isFavorite: p.is_favorite,
    isPrivate: p.is_private ?? false,
    isLocked: p.is_locked ?? false,
    createdBy: p.created_by,
    shareCount: shareCountMap.get(p.id) || 0,
    guestCount: guestCountMap.get(p.id) || 0,
    childCount: childCountMap.get(p.id) || 0,
  }));

  return NextResponse.json(mapped);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const body = await request.json();
  const { workspaceId, title, type, parentId, icon, view_mode, is_private } = body;
  if (!workspaceId)
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });

  const { data: member } = await supabase
    .from("members")
    .select("role")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!member || member.role === "VIEWER")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: maxPosRow } = await supabase
    .from("pages")
    .select("position")
    .eq("workspace_id", workspaceId)
    .is("parent_id", parentId || null)
    .order("position", { ascending: false })
    .limit(1)
    .single();

  const nextPosition = (maxPosRow?.position ?? -1) + 1;

  const { data: page, error } = await supabase
    .from("pages")
    .insert({
      title: title || "Untitled",
      type: type || "PAGE",
      view_mode: view_mode || null,
      icon: icon || null,
      parent_id: parentId || null,
      workspace_id: workspaceId,
      created_by: userId,
      position: nextPosition,
      is_private: is_private ?? false,
    })
    .select()
    .single();

  if (error || !page)
    return NextResponse.json({ error: "Failed to create page" }, { status: 500 });

  if (type === "DATABASE") {
    await supabase.from("database_properties").insert([
      { name: "Name", type: "text", position: 0, page_id: page.id },
      {
        name: "Status",
        type: "select",
        position: 1,
        page_id: page.id,
        options: {
          options: [
            { value: "Not started", color: "gray" },
            { value: "In progress", color: "blue" },
            { value: "Done", color: "green" },
          ],
        },
      },
    ]);
  }

  if (parentId && (type || "PAGE") === "PAGE") {
    const { data: parentPage } = await supabase
      .from("pages")
      .select("type")
      .eq("id", parentId)
      .single();

    if (parentPage?.type === "DATABASE") {
      const { data: maxPosRow } = await supabase
        .from("database_rows")
        .select("position")
        .eq("page_id", parentId)
        .order("position", { ascending: false })
        .limit(1)
        .single();

      const { data: row } = await supabase
        .from("database_rows")
        .insert({
          page_id: parentId,
          position: (maxPosRow?.position ?? -1) + 1,
        })
        .select()
        .single();

      if (row) {
        const { data: nameProp } = await supabase
          .from("database_properties")
          .select("id")
          .eq("page_id", parentId)
          .eq("position", 0)
          .single();

        if (nameProp) {
          await supabase.from("cell_values").insert({
            property_id: nameProp.id,
            row_id: row.id,
            value: page.title,
          });
        }
      }
    }
  }

  return NextResponse.json(page, { status: 201 });
}
