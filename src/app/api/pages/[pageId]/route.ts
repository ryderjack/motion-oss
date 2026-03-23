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
    .select("*")
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

  if (page.is_private && page.created_by !== userId) {
    const { data: share } = await supabase
      .from("page_shares")
      .select("id")
      .eq("page_id", pageId)
      .eq("user_id", userId)
      .single();
    if (!share)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [blocksRes, propsRes, rowsRes, childrenRes] = await Promise.all([
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
    supabase
      .from("database_rows")
      .select("*, cells:cell_values(*)")
      .eq("page_id", pageId)
      .eq("is_archived", false)
      .order("position", { ascending: true }),
    supabase
      .from("pages")
      .select("id, title, icon, type")
      .eq("parent_id", pageId)
      .eq("is_archived", false)
      .order("position", { ascending: true }),
  ]);

  const rows = (rowsRes.data || []).map((r) => ({
    id: r.id,
    position: r.position,
    cells: (r.cells || []).map((c: Record<string, unknown>) => ({
      id: c.id,
      propertyId: c.property_id,
      rowId: c.row_id,
      value: c.value,
    })),
  }));

  return NextResponse.json({
    id: page.id,
    title: page.title,
    icon: page.icon,
    coverImage: page.cover_image,
    type: page.type,
    viewMode: page.view_mode,
    parentId: page.parent_id,
    workspaceId: page.workspace_id,
    position: page.position,
    isFavorite: page.is_favorite,
    isArchived: page.is_archived,
    isPrivate: page.is_private ?? false,
    isLocked: page.is_locked ?? false,
    createdBy: page.created_by,
    blocks: blocksRes.data || [],
    properties: propsRes.data || [],
    rows,
    children: childrenRes.data || [],
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
  const body = await request.json();

  const { data: page } = await supabase
    .from("pages")
    .select("workspace_id, is_private, created_by, title, icon, cover_image, parent_id, is_archived, is_private, is_favorite, is_locked")
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

  if (body.is_archived === true && page.is_locked && member.role !== "ADMIN") {
    return NextResponse.json({ error: "This page is locked and can only be trashed by an admin" }, { status: 403 });
  }

  if (body.is_locked !== undefined && member.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can lock or unlock pages" }, { status: 403 });
  }

  if (page.is_private && page.created_by !== userId) {
    const { data: share } = await supabase
      .from("page_shares")
      .select("permission")
      .eq("page_id", pageId)
      .eq("user_id", userId)
      .single();
    if (!share)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (share.permission === "VIEWER")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const allowedFields = [
    "title", "icon", "cover_image", "parent_id", "position",
    "is_favorite", "is_archived", "is_private", "is_locked",
  ] as const;

  const data: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const field of allowedFields) {
    if (body[field] !== undefined) data[field] = body[field];
  }

  const { data: updated } = await supabase
    .from("pages")
    .update(data)
    .eq("id", pageId)
    .select()
    .single();

  if (body.is_archived === false && page.is_archived === true) {
    const childIds = await getArchivedDescendantIds(pageId);
    if (childIds.length > 0) {
      await supabase
        .from("pages")
        .update({ is_archived: false, updated_at: new Date().toISOString() })
        .in("id", childIds);
    }

    if (page.parent_id) {
      const { data: parentPage } = await supabase
        .from("pages")
        .select("id, type")
        .eq("id", page.parent_id)
        .single();

      if (parentPage?.type === "DATABASE") {
        const { data: props } = await supabase
          .from("database_properties")
          .select("id")
          .eq("page_id", parentPage.id)
          .order("position", { ascending: true })
          .limit(1);

        if (props?.[0]) {
          const { data: archivedRows } = await supabase
            .from("database_rows")
            .select("id")
            .eq("page_id", parentPage.id)
            .eq("is_archived", true);

          if (archivedRows && archivedRows.length > 0) {
            const { data: matchingCells } = await supabase
              .from("cell_values")
              .select("row_id, value")
              .eq("property_id", props[0].id)
              .in("row_id", archivedRows.map((r) => r.id));

            const restoredTitle = updated?.title ?? page.title;
            const matchTitle = restoredTitle || "Untitled";
            const matchingRow = matchingCells?.find((c) => {
              const cellTitle = typeof c.value === "string" && c.value ? c.value : "Untitled";
              return cellTitle === matchTitle;
            });

            if (matchingRow) {
              await supabase
                .from("database_rows")
                .update({ is_archived: false, updated_at: new Date().toISOString() })
                .eq("id", matchingRow.row_id);
            }
          }
        }
      }
    }
  }

  if (body.is_archived === true && page.is_archived !== true && page.parent_id) {
    const { data: parentPage } = await supabase
      .from("pages")
      .select("id, type")
      .eq("id", page.parent_id)
      .single();

    if (parentPage?.type === "DATABASE") {
      const { data: props } = await supabase
        .from("database_properties")
        .select("id")
        .eq("page_id", parentPage.id)
        .order("position", { ascending: true })
        .limit(1);

      if (props?.[0]) {
        const { data: rows } = await supabase
          .from("database_rows")
          .select("id")
          .eq("page_id", parentPage.id)
          .eq("is_archived", false);

        if (rows && rows.length > 0) {
          const { data: cells } = await supabase
            .from("cell_values")
            .select("row_id, value")
            .eq("property_id", props[0].id)
            .in("row_id", rows.map((r) => r.id));

          const matchTitle = page.title || "Untitled";
          const matchingRow = cells?.find((c) => {
            const cellTitle = typeof c.value === "string" && c.value ? c.value : "Untitled";
            return cellTitle === matchTitle;
          });

          if (matchingRow) {
            await supabase
              .from("database_rows")
              .update({ is_archived: true, updated_at: new Date().toISOString() })
              .eq("id", matchingRow.row_id);
          }
        }
      }
    }
  }

  const auditableFields: Record<string, string> = {
    title: "update_title",
    icon: "update_icon",
    cover_image: "update_cover",
    parent_id: "move_page",
    is_archived: body.is_archived ? "trash" : "restore",
    is_private: "update_privacy",
  };

  const historyEntries = [];
  for (const field of Object.keys(auditableFields)) {
    if (body[field] !== undefined && body[field] !== page[field as keyof typeof page]) {
      historyEntries.push({
        page_id: pageId,
        user_id: userId,
        action: auditableFields[field],
        changes: {
          field,
          from: page[field as keyof typeof page] ?? null,
          to: body[field],
        },
      });
    }
  }

  if (historyEntries.length > 0) {
    supabase.from("page_history").insert(historyEntries).then(() => {});
  }

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
  const { searchParams } = new URL(request.url);
  const permanent = searchParams.get("permanent") === "true";

  const { data: page } = await supabase
    .from("pages")
    .select("workspace_id, title, icon, type, parent_id, is_locked")
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

  if (page.is_locked && (!member || member.role !== "ADMIN")) {
    return NextResponse.json({ error: "This page is locked and can only be deleted by an admin" }, { status: 403 });
  }

  if (permanent) {
    if (!member || member.role !== "ADMIN")
      return NextResponse.json({ error: "Only admins can permanently delete" }, { status: 403 });

    supabase.from("page_history").insert({
      page_id: pageId,
      user_id: userId,
      action: "permanent_delete",
      changes: { title: page.title, icon: page.icon, type: page.type },
    }).then(() => {});

    await supabase.from("pages").delete().eq("id", pageId);

    return NextResponse.json({ success: true, permanent: true });
  }

  if (!member || member.role === "VIEWER")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date().toISOString();

  const childIds = await getDescendantIds(pageId);
  const allIds = [pageId, ...childIds];

  await supabase
    .from("pages")
    .update({ is_archived: true, updated_at: now })
    .in("id", allIds);

  supabase.from("page_history").insert({
    page_id: pageId,
    user_id: userId,
    action: "trash",
    changes: { title: page.title, childrenTrashed: childIds.length },
  }).then(() => {});

  if (page.parent_id) {
    const { data: parentPage } = await supabase
      .from("pages")
      .select("id, type")
      .eq("id", page.parent_id)
      .single();

    if (parentPage?.type === "DATABASE") {
      const { data: props } = await supabase
        .from("database_properties")
        .select("id")
        .eq("page_id", parentPage.id)
        .order("position", { ascending: true })
        .limit(1);

      if (props?.[0]) {
        const { data: rows } = await supabase
          .from("database_rows")
          .select("id")
          .eq("page_id", parentPage.id)
          .eq("is_archived", false);

        if (rows && rows.length > 0) {
          const { data: cells } = await supabase
            .from("cell_values")
            .select("row_id, value")
            .eq("property_id", props[0].id)
            .in("row_id", rows.map((r) => r.id));

          const matchTitle = page.title || "Untitled";
          const matchingRow = cells?.find((c) => {
            const cellTitle = typeof c.value === "string" && c.value ? c.value : "Untitled";
            return cellTitle === matchTitle;
          });

          if (matchingRow) {
            await supabase
              .from("database_rows")
              .update({ is_archived: true, updated_at: now })
              .eq("id", matchingRow.row_id);
          }
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}

async function getDescendantIds(parentId: string): Promise<string[]> {
  const { data: children } = await supabase
    .from("pages")
    .select("id")
    .eq("parent_id", parentId)
    .eq("is_archived", false);

  if (!children || children.length === 0) return [];

  const nested = await Promise.all(
    children.map((c) => getDescendantIds(c.id))
  );

  return [...children.map((c) => c.id), ...nested.flat()];
}

async function getArchivedDescendantIds(parentId: string): Promise<string[]> {
  const { data: children } = await supabase
    .from("pages")
    .select("id")
    .eq("parent_id", parentId)
    .eq("is_archived", true);

  if (!children || children.length === 0) return [];

  const nested = await Promise.all(
    children.map((c) => getArchivedDescendantIds(c.id))
  );

  return [...children.map((c) => c.id), ...nested.flat()];
}
