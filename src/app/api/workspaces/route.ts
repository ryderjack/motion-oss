import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { data: memberships } = await supabase
    .from("members")
    .select("*, workspace:workspaces(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  const workspaces = (memberships || []).map((m) => ({
    ...m.workspace,
    role: m.role,
  }));

  return NextResponse.json(workspaces);
}
