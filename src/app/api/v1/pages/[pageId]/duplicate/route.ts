import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { authenticateApiRequest } from "@/lib/api-auth";

interface DuplicatedPage {
  originalId: string;
  newId: string;
  title: string;
  parentId: string | null;
  children: DuplicatedPage[];
}

async function duplicatePageRecursive(
  pageId: string,
  targetWorkspaceId: string,
  newParentId: string | null,
  titleSuffix: string
): Promise<DuplicatedPage | null> {
  const { data: source } = await supabase
    .from("pages")
    .select("*")
    .eq("id", pageId)
    .single();

  if (!source) return null;

  const { data: maxPosRow } = await supabase
    .from("pages")
    .select("position")
    .eq("workspace_id", targetWorkspaceId)
    .is("parent_id", newParentId)
    .order("position", { ascending: false })
    .limit(1)
    .single();

  const nextPosition = (maxPosRow?.position ?? -1) + 1;

  const { data: newPage, error: pageError } = await supabase
    .from("pages")
    .insert({
      title: `${source.title}${titleSuffix}`,
      icon: source.icon,
      cover_image: source.cover_image,
      type: source.type,
      view_mode: source.view_mode,
      parent_id: newParentId,
      workspace_id: targetWorkspaceId,
      created_by: null,
      position: nextPosition,
      is_private: source.is_private ?? false,
    })
    .select()
    .single();

  if (pageError || !newPage) return null;

  if (newParentId) {
    const { data: parentPage } = await supabase
      .from("pages")
      .select("type")
      .eq("id", newParentId)
      .single();

    if (parentPage?.type === "DATABASE") {
      const { data: properties } = await supabase
        .from("database_properties")
        .select("id, position, options")
        .eq("page_id", newParentId)
        .order("position", { ascending: true });

      const { data: maxRowPos } = await supabase
        .from("database_rows")
        .select("position")
        .eq("page_id", newParentId)
        .eq("is_archived", false)
        .order("position", { ascending: false })
        .limit(1)
        .single();

      const { data: row } = await supabase
        .from("database_rows")
        .insert({
          page_id: newParentId,
          position: (maxRowPos?.position ?? -1) + 1,
        })
        .select()
        .single();

      if (row && properties) {
        const nameProp = properties.find((p) => p.position === 0);
        const cellInserts: Array<{ property_id: string; row_id: string; value: unknown }> = [];

        if (nameProp) {
          cellInserts.push({ property_id: nameProp.id, row_id: row.id, value: newPage.title });
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

  const { data: blocks } = await supabase
    .from("blocks")
    .select("type, content, position")
    .eq("page_id", pageId)
    .order("position", { ascending: true });

  if (blocks && blocks.length > 0) {
    await supabase.from("blocks").insert(
      blocks.map((b) => ({
        type: b.type,
        content: b.content,
        position: b.position,
        page_id: newPage.id,
      }))
    );
  }

  if (source.type === "DATABASE") {
    const { data: props } = await supabase
      .from("database_properties")
      .select("*")
      .eq("page_id", pageId)
      .order("position", { ascending: true });

    if (props && props.length > 0) {
      const oldToNewPropId: Record<string, string> = {};

      for (const prop of props) {
        const { data: newProp } = await supabase
          .from("database_properties")
          .insert({
            name: prop.name,
            type: prop.type,
            options: prop.options,
            position: prop.position,
            page_id: newPage.id,
          })
          .select("id")
          .single();

        if (newProp) {
          oldToNewPropId[prop.id] = newProp.id;
        }
      }

      const { data: rows } = await supabase
        .from("database_rows")
        .select("*, cells:cell_values(*)")
        .eq("page_id", pageId)
        .eq("is_archived", false)
        .order("position", { ascending: true });

      if (rows && rows.length > 0) {
        for (const row of rows) {
          const { data: newRow } = await supabase
            .from("database_rows")
            .insert({
              page_id: newPage.id,
              position: row.position,
            })
            .select("id")
            .single();

          if (newRow && row.cells && row.cells.length > 0) {
            const cellInserts = row.cells
              .filter((c: Record<string, unknown>) => oldToNewPropId[c.property_id as string])
              .map((c: Record<string, unknown>) => ({
                value: c.value,
                property_id: oldToNewPropId[c.property_id as string],
                row_id: newRow.id,
              }));

            if (cellInserts.length > 0) {
              await supabase.from("cell_values").insert(cellInserts);
            }
          }
        }
      }
    }
  }

  const { data: children } = await supabase
    .from("pages")
    .select("id")
    .eq("parent_id", pageId)
    .eq("is_archived", false)
    .order("position", { ascending: true });

  const duplicatedChildren: DuplicatedPage[] = [];

  if (children && children.length > 0) {
    for (const child of children) {
      const dup = await duplicatePageRecursive(
        child.id,
        targetWorkspaceId,
        newPage.id,
        ""
      );
      if (dup) duplicatedChildren.push(dup);
    }
  }

  return {
    originalId: pageId,
    newId: newPage.id,
    title: newPage.title,
    parentId: newPage.parent_id,
    children: duplicatedChildren,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const authResult = await authenticateApiRequest(request);
  if (!authResult.ok) return authResult.response;

  const { pageId } = await params;
  const { workspaceId } = authResult;

  const { data: sourcePage } = await supabase
    .from("pages")
    .select("id, workspace_id, parent_id")
    .eq("id", pageId)
    .single();

  if (!sourcePage) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  if (sourcePage.workspace_id !== workspaceId) {
    return NextResponse.json(
      { error: "Page does not belong to the specified workspace" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const targetWorkspaceId = body.targetWorkspaceId || workspaceId;

  const parentId = body.parentId !== undefined ? body.parentId : sourcePage.parent_id;
  const titleSuffix = body.titleSuffix ?? " (Copy)";

  const result = await duplicatePageRecursive(
    pageId,
    targetWorkspaceId,
    parentId,
    titleSuffix
  );

  if (!result) {
    return NextResponse.json(
      { error: "Failed to duplicate page" },
      { status: 500 }
    );
  }

  function countPages(node: DuplicatedPage): number {
    return 1 + node.children.reduce((sum, c) => sum + countPages(c), 0);
  }

  return NextResponse.json(
    {
      message: `Duplicated ${countPages(result)} page(s)`,
      page: result,
    },
    { status: 201 }
  );
}
