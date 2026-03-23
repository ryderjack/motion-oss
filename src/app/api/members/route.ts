import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const VALID_ROLES = ["ADMIN", "EDITOR", "VIEWER"] as const;

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

  const { data: members } = await supabase
    .from("members")
    .select("*, user:users(id, name, email, image)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  return NextResponse.json(members || []);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { workspaceId, email, role } = await request.json();

  const assignedRole = role || "EDITOR";
  if (!VALID_ROLES.includes(assignedRole))
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const { data: admin } = await supabase
    .from("members")
    .select("role")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!admin || admin.role !== "ADMIN")
    return NextResponse.json({ error: "Only admins can invite members" }, { status: 403 });

  let { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .single();

  if (!user) {
    const { data: newUser } = await supabase
      .from("users")
      .insert({ email })
      .select("id")
      .single();
    user = newUser;
  }

  if (!user)
    return NextResponse.json({ error: "Failed to find/create user" }, { status: 500 });

  const { data: existing } = await supabase
    .from("members")
    .select("id")
    .eq("user_id", user.id)
    .eq("workspace_id", workspaceId)
    .single();
  if (existing)
    return NextResponse.json({ error: "User already a member" }, { status: 400 });

  const { data: newMember } = await supabase
    .from("members")
    .insert({ user_id: user.id, workspace_id: workspaceId, role: assignedRole })
    .select("*, user:users(id, name, email, image)")
    .single();

  return NextResponse.json(newMember, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { memberId, role } = await request.json();

  if (!role || !VALID_ROLES.includes(role))
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const { data: memberToUpdate } = await supabase
    .from("members")
    .select("workspace_id")
    .eq("id", memberId)
    .single();
  if (!memberToUpdate)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: admin } = await supabase
    .from("members")
    .select("role")
    .eq("user_id", userId)
    .eq("workspace_id", memberToUpdate.workspace_id)
    .single();
  if (!admin || admin.role !== "ADMIN")
    return NextResponse.json({ error: "Only admins can change roles" }, { status: 403 });

  const { data: updated } = await supabase
    .from("members")
    .update({ role })
    .eq("id", memberId)
    .select("*, user:users(id, name, email, image)")
    .single();

  return NextResponse.json(updated);
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { memberId } = await request.json();

  const { data: memberToDelete } = await supabase
    .from("members")
    .select("workspace_id")
    .eq("id", memberId)
    .single();
  if (!memberToDelete)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: admin } = await supabase
    .from("members")
    .select("role")
    .eq("user_id", userId)
    .eq("workspace_id", memberToDelete.workspace_id)
    .single();
  if (!admin || admin.role !== "ADMIN")
    return NextResponse.json({ error: "Only admins can remove members" }, { status: 403 });

  await supabase.from("members").delete().eq("id", memberId);
  return NextResponse.json({ success: true });
}
