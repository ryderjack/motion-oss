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

  const { data: pages } = await supabase
    .from("pages")
    .select("id, title, icon, type, view_mode, parent_id, updated_at, created_by, is_private")
    .eq("workspace_id", workspaceId)
    .eq("is_archived", true)
    .order("updated_at", { ascending: false });

  const allPages = pages || [];
  const pageMap = new Map(allPages.map((p) => [p.id, p]));

  function isHiddenByPrivateAncestor(
    page: (typeof allPages)[0]
  ): boolean {
    let current: (typeof allPages)[0] | undefined = page;
    while (current) {
      if (current.is_private && current.created_by !== userId)
        return true;
      current = current.parent_id
        ? pageMap.get(current.parent_id)
        : undefined;
    }
    return false;
  }

  const visible = allPages.filter((p) => !isHiddenByPrivateAncestor(p));

  const mapped = visible.map((p) => ({
    id: p.id,
    title: p.title,
    icon: p.icon,
    type: p.type,
    viewMode: p.view_mode,
    parentId: p.parent_id,
    deletedAt: p.updated_at,
    isPrivate: p.is_private ?? false,
    createdBy: p.created_by,
  }));

  return NextResponse.json(mapped);
}

export async function DELETE(request: Request) {
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
    .select("role")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!member || member.role !== "ADMIN")
    return NextResponse.json({ error: "Only admins can permanently delete" }, { status: 403 });

  const { data: pages } = await supabase
    .from("pages")
    .select("id, is_private, created_by, parent_id")
    .eq("workspace_id", workspaceId)
    .eq("is_archived", true);

  const allTrash = pages || [];
  const trashMap = new Map(allTrash.map((p) => [p.id, p]));

  function isOwnedByOtherPrivateAncestor(
    page: (typeof allTrash)[0]
  ): boolean {
    let current: (typeof allTrash)[0] | undefined = page;
    while (current) {
      if (current.is_private && current.created_by !== userId)
        return true;
      current = current.parent_id
        ? trashMap.get(current.parent_id)
        : undefined;
    }
    return false;
  }

  const toDelete = allTrash.filter((p) => !isOwnedByOtherPrivateAncestor(p));

  if (toDelete.length === 0)
    return NextResponse.json({ success: true, deleted: 0 });

  const ids = toDelete.map((p) => p.id);

  const orphanIds = await findNonArchivedDescendants(ids, workspaceId);
  const allIds = [...ids, ...orphanIds];

  await supabase.from("pages").delete().in("id", allIds);

  supabase.from("page_history").insert({
    page_id: ids[0],
    user_id: userId,
    action: "permanent_delete_all",
    changes: { count: allIds.length },
  }).then(() => {});

  return NextResponse.json({ success: true, deleted: allIds.length });
}

async function findNonArchivedDescendants(
  parentIds: string[],
  workspaceId: string
): Promise<string[]> {
  if (parentIds.length === 0) return [];

  const { data: children } = await supabase
    .from("pages")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("is_archived", false)
    .in("parent_id", parentIds);

  if (!children || children.length === 0) return [];

  const childIds = children.map((c) => c.id);
  const deeper = await findNonArchivedDescendants(childIds, workspaceId);
  return [...childIds, ...deeper];
}
