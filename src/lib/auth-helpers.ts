import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { redirect } from "next/navigation";

export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function getUserWorkspace(userId: string) {
  const { data: member } = await supabase
    .from("members")
    .select("*, workspace:workspaces(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  return member;
}

export async function requireWorkspaceAccess(workspaceId: string) {
  const user = await requireAuth();
  const { data: member } = await supabase
    .from("members")
    .select("*")
    .eq("user_id", user.id!)
    .eq("workspace_id", workspaceId)
    .single();
  if (!member) redirect("/");
  return { user, member };
}
