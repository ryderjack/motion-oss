import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const rateLimited = rateLimit(_request, "guest-token", { limit: 30, windowSeconds: 60 });
  if (rateLimited) return rateLimited;

  const { token } = await params;

  const { data: guest } = await supabase
    .from("page_guests")
    .select("id, page_id, email, permission, expires_at")
    .eq("token", token)
    .single();

  if (!guest)
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });

  if (guest.expires_at && new Date(guest.expires_at) < new Date())
    return NextResponse.json({ error: "This link has expired" }, { status: 410 });

  const { data: page } = await supabase
    .from("pages")
    .select("*")
    .eq("id", guest.page_id)
    .single();

  if (!page)
    return NextResponse.json({ error: "Page not found" }, { status: 404 });

  if (page.is_archived)
    return NextResponse.json({ error: "This page has been archived" }, { status: 410 });

  const [blocksRes, propsRes, rowsRes, childrenRes] = await Promise.all([
    supabase
      .from("blocks")
      .select("*")
      .eq("page_id", page.id)
      .order("position", { ascending: true }),
    supabase
      .from("database_properties")
      .select("*")
      .eq("page_id", page.id)
      .order("position", { ascending: true }),
    supabase
      .from("database_rows")
      .select("*, cells:cell_values(*)")
      .eq("page_id", page.id)
      .eq("is_archived", false)
      .order("position", { ascending: true }),
    supabase
      .from("pages")
      .select("id, title, icon, type")
      .eq("parent_id", page.id)
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
    permission: guest.permission,
    guestEmail: guest.email,
    blocks: blocksRes.data || [],
    properties: propsRes.data || [],
    rows,
    children: childrenRes.data || [],
  });
}
