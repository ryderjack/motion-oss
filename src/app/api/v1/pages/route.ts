import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { authenticateApiRequest } from "@/lib/api-auth";

export async function POST(request: Request) {
  const authResult = await authenticateApiRequest(request);
  if (!authResult.ok) return authResult.response;

  const body = await request.json();
  const { title, type, parentId, icon, cover_image, view_mode, blocks, is_private } = body;
  const { workspaceId } = authResult;

  if (parentId) {
    const { data: parent } = await supabase
      .from("pages")
      .select("id, workspace_id")
      .eq("id", parentId)
      .single();

    if (!parent) {
      return NextResponse.json({ error: "Parent page not found" }, { status: 404 });
    }
    if (parent.workspace_id !== workspaceId) {
      return NextResponse.json(
        { error: "Parent page does not belong to the specified workspace" },
        { status: 400 }
      );
    }
  }

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
      cover_image: cover_image || null,
      parent_id: parentId || null,
      workspace_id: workspaceId,
      created_by: null,
      position: nextPosition,
      is_private: is_private ?? false,
    })
    .select()
    .single();

  if (error || !page) {
    return NextResponse.json(
      { error: "Failed to create page", details: error?.message },
      { status: 500 }
    );
  }

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

  if (Array.isArray(blocks) && blocks.length > 0) {
    const rows = blocks.map(
      (block: { type: string; content: unknown }, i: number) => ({
        type: block.type,
        content: block.content,
        position: i,
        page_id: page.id,
      })
    );
    await supabase.from("blocks").insert(rows);
  }

  if (parentId && (type || "PAGE") === "PAGE") {
    const { data: parentPage } = await supabase
      .from("pages")
      .select("type")
      .eq("id", parentId)
      .single();

    if (parentPage?.type === "DATABASE") {
      const { data: properties } = await supabase
        .from("database_properties")
        .select("id, position, options")
        .eq("page_id", parentId)
        .order("position", { ascending: true });

      const { data: maxRowPos } = await supabase
        .from("database_rows")
        .select("position")
        .eq("page_id", parentId)
        .eq("is_archived", false)
        .order("position", { ascending: false })
        .limit(1)
        .single();

      const { data: row } = await supabase
        .from("database_rows")
        .insert({
          page_id: parentId,
          position: (maxRowPos?.position ?? -1) + 1,
        })
        .select()
        .single();

      if (row && properties) {
        const nameProp = properties.find((p) => p.position === 0);
        const cellInserts: Array<{ property_id: string; row_id: string; value: unknown }> = [];

        if (nameProp) {
          cellInserts.push({ property_id: nameProp.id, row_id: row.id, value: page.title });
        }

        for (const prop of properties) {
          if (prop.position === 0) continue;
          const dv = (prop.options as { defaultValue?: unknown } | null)?.defaultValue;
          if (dv !== undefined && dv !== null) {
            cellInserts.push({ property_id: prop.id, row_id: row.id, value: dv });
          }
        }

        if (cellInserts.length > 0) {
          await supabase.from("cell_values").insert(cellInserts);
        }
      }
    }
  }

  const { data: createdBlocks } = await supabase
    .from("blocks")
    .select("id, type, content, position")
    .eq("page_id", page.id)
    .order("position", { ascending: true });

  return NextResponse.json(
    {
      id: page.id,
      title: page.title,
      icon: page.icon,
      coverImage: page.cover_image,
      type: page.type,
      viewMode: page.view_mode,
      parentId: page.parent_id,
      workspaceId: page.workspace_id,
      position: page.position,
      isPrivate: page.is_private ?? false,
      createdAt: page.created_at,
      blocks: createdBlocks || [],
    },
    { status: 201 }
  );
}
