import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { pageId } = await params;
  const { propertyId, rowId, value } = await request.json();

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
  if (!member || member.role === "VIEWER")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: property } = await supabase
    .from("database_properties")
    .select("id")
    .eq("id", propertyId)
    .eq("page_id", pageId)
    .single();
  if (!property)
    return NextResponse.json({ error: "Property not found in this page" }, { status: 404 });

  const { data: row } = await supabase
    .from("database_rows")
    .select("id")
    .eq("id", rowId)
    .eq("page_id", pageId)
    .single();
  if (!row)
    return NextResponse.json({ error: "Row not found in this page" }, { status: 404 });

  const { data: existing } = await supabase
    .from("cell_values")
    .select("id, value")
    .eq("property_id", propertyId)
    .eq("row_id", rowId)
    .single();

  const oldValue = existing?.value;

  let cell;
  if (existing) {
    const { data } = await supabase
      .from("cell_values")
      .update({ value })
      .eq("id", existing.id)
      .select()
      .single();
    cell = data;
  } else {
    const { data } = await supabase
      .from("cell_values")
      .insert({ property_id: propertyId, row_id: rowId, value })
      .select()
      .single();
    cell = data;
  }

  const { data: prop } = await supabase
    .from("database_properties")
    .select("position")
    .eq("id", propertyId)
    .single();

  if (prop?.position === 0 && typeof value === "string") {
    const prevTitle =
      typeof oldValue === "string" && oldValue ? oldValue : "Untitled";
    const newTitle = value || "Untitled";

    if (prevTitle !== newTitle) {
      const { data: childPage } = await supabase
        .from("pages")
        .select("id")
        .eq("parent_id", pageId)
        .eq("title", prevTitle)
        .limit(1)
        .single();

      if (childPage) {
        await supabase
          .from("pages")
          .update({ title: newTitle })
          .eq("id", childPage.id);
      }
    }
  }

  return NextResponse.json(cell);
}
