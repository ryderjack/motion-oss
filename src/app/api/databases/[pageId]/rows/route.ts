import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function POST(
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
    .select("workspace_id, type")
    .eq("id", pageId)
    .single();
  if (!page || page.type !== "DATABASE")
    return NextResponse.json({ error: "Not a database" }, { status: 400 });

  const { data: member } = await supabase
    .from("members")
    .select("role")
    .eq("user_id", userId)
    .eq("workspace_id", page.workspace_id)
    .single();
  if (!member || member.role === "VIEWER")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: properties } = await supabase
    .from("database_properties")
    .select("id, position, options")
    .eq("page_id", pageId)
    .order("position", { ascending: true });

  const namePropId = properties?.find((p) => p.position === 0)?.id;
  const nameCellValue = body.cells?.find(
    (c: { propertyId: string; value: unknown }) => c.propertyId === namePropId
  )?.value;
  const rowTitle =
    typeof nameCellValue === "string" && nameCellValue ? nameCellValue : "Untitled";

  const { data: maxPosRow } = await supabase
    .from("database_rows")
    .select("position")
    .eq("page_id", pageId)
    .order("position", { ascending: false })
    .limit(1)
    .single();

  const { data: row, error } = await supabase
    .from("database_rows")
    .insert({
      page_id: pageId,
      position: (maxPosRow?.position ?? -1) + 1,
    })
    .select()
    .single();

  if (error || !row)
    return NextResponse.json({ error: "Failed to create row" }, { status: 500 });

  const explicitCells: Array<{ propertyId: string; value: unknown }> =
    Array.isArray(body.cells) ? body.cells : [];
  const explicitPropIds = new Set(explicitCells.map((c) => c.propertyId));

  const defaultCells = (properties ?? [])
    .filter((p) => {
      const dv = (p.options as { defaultValue?: unknown } | null)?.defaultValue;
      return dv !== undefined && dv !== null && !explicitPropIds.has(p.id);
    })
    .map((p) => ({
      propertyId: p.id,
      value: (p.options as { defaultValue: unknown }).defaultValue,
    }));

  const allCells = [...explicitCells, ...defaultCells];
  if (allCells.length > 0) {
    const cellInserts = allCells.map((cell) => ({
      property_id: cell.propertyId,
      row_id: row.id,
      value: cell.value,
    }));
    await supabase.from("cell_values").insert(cellInserts);
  }

  const { data: maxPagePos } = await supabase
    .from("pages")
    .select("position")
    .eq("workspace_id", page.workspace_id)
    .eq("parent_id", pageId)
    .order("position", { ascending: false })
    .limit(1)
    .single();

  await supabase.from("pages").insert({
    title: rowTitle,
    type: "PAGE",
    parent_id: pageId,
    workspace_id: page.workspace_id,
    created_by: userId,
    position: (maxPagePos?.position ?? -1) + 1,
  });

  const { data: fullRow } = await supabase
    .from("database_rows")
    .select("*, cells:cell_values(*)")
    .eq("id", row.id)
    .single();

  supabase.from("page_history").insert({
    page_id: pageId,
    user_id: userId,
    action: "add_row",
    changes: { rowTitle, rowId: row.id },
  }).then(() => {});

  return NextResponse.json(fullRow, { status: 201 });
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
  const { rowId } = await request.json();

  const { data: row } = await supabase
    .from("database_rows")
    .select("page_id")
    .eq("id", rowId)
    .single();
  if (!row)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: page } = await supabase
    .from("pages")
    .select("workspace_id")
    .eq("id", row.page_id)
    .single();

  const { data: member } = await supabase
    .from("members")
    .select("role")
    .eq("user_id", userId)
    .eq("workspace_id", page!.workspace_id)
    .single();
  if (!member || member.role === "VIEWER")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: properties } = await supabase
    .from("database_properties")
    .select("id")
    .eq("page_id", pageId)
    .order("position", { ascending: true })
    .limit(1);

  let rowTitle = "Untitled";

  if (properties?.[0]) {
    const { data: cell } = await supabase
      .from("cell_values")
      .select("value")
      .eq("row_id", rowId)
      .eq("property_id", properties[0].id)
      .single();

    rowTitle = typeof cell?.value === "string" && cell.value ? cell.value : "Untitled";

    const { data: childPage } = await supabase
      .from("pages")
      .select("id")
      .eq("parent_id", pageId)
      .eq("title", rowTitle)
      .limit(1)
      .single();

    if (childPage) {
      await supabase
        .from("pages")
        .update({ is_archived: true, updated_at: new Date().toISOString() })
        .eq("id", childPage.id);
    }
  }

  await supabase
    .from("database_rows")
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq("id", rowId);

  supabase.from("page_history").insert({
    page_id: pageId,
    user_id: userId,
    action: "delete_row",
    changes: { rowTitle, rowId },
  }).then(() => {});

  return NextResponse.json({ success: true });
}
