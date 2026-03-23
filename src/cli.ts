#!/usr/bin/env node

import { readFileSync } from "fs";
import { resolve } from "path";
import { Command } from "commander";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// ── Load .env ──────────────────────────────────────────────────────────────────
try {
  for (const line of readFileSync(resolve(process.cwd(), ".env"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq);
    let v = t.slice(eq + 1);
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    process.env[k] ??= v;
  }
} catch {}

// ── Supabase client ────────────────────────────────────────────────────────────
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Formatting helpers ─────────────────────────────────────────────────────────
const json = () => process.argv.includes("--json");
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

function printTable(headers: string[], rows: string[][]) {
  if (rows.length === 0) return console.log(dim("  (no results)"));
  const widths = headers.map((h, i) =>
    Math.min(50, Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)))
  );
  const bar = widths.map((w) => "─".repeat(w)).join("──");
  console.log(bold(headers.map((h, i) => h.padEnd(widths[i])).join("  ")));
  console.log(dim(bar));
  for (const row of rows) {
    console.log(row.map((c, i) => (c ?? "").slice(0, widths[i]).padEnd(widths[i])).join("  "));
  }
  console.log(dim(`\n${rows.length} result(s)`));
}

function out(data: unknown) {
  console.log(JSON.stringify(data, null, 2));
}

function die(msg: string): never {
  console.error(red(`Error: ${msg}`));
  process.exit(1);
}

function ok(msg: string) {
  console.log(green(`✓ ${msg}`));
}

// ── User / workspace resolution ────────────────────────────────────────────────
let cachedUserId: string | null = null;

async function resolveUser(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const email = program.opts().user || process.env.MOTION_USER_EMAIL;
  if (!email) die("User email required. Set MOTION_USER_EMAIL env var or use --user <email>");
  const { data } = await supabase.from("users").select("id").eq("email", email).single();
  if (!data) die(`User not found: ${email}`);
  cachedUserId = data.id;
  return data.id;;
}

async function resolveWorkspace(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const envWid = program.opts().workspace || process.env.MOTION_WORKSPACE_ID;
  if (envWid) return envWid;
  const userId = await resolveUser();
  const { data } = await supabase
    .from("members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (!data) die("No workspace found for user. Specify --workspace or set MOTION_WORKSPACE_ID");
  return data.workspace_id;
}

async function requireMember(userId: string, workspaceId: string) {
  const { data } = await supabase
    .from("members")
    .select("role")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!data) die("You are not a member of this workspace");
  return data;
}

async function requireEditor(userId: string, workspaceId: string) {
  const m = await requireMember(userId, workspaceId);
  if (m.role === "VIEWER") die("Insufficient permissions (VIEWER cannot write)");
  return m;
}

async function requireAdmin(userId: string, workspaceId: string) {
  const m = await requireMember(userId, workspaceId);
  if (m.role !== "ADMIN") die("Only ADMINs can perform this action");
  return m;
}

// ── Program ────────────────────────────────────────────────────────────────────
const program = new Command();
program
  .name("motion")
  .description("Motion Workspace CLI — manage pages, databases, members, and more")
  .version("1.0.0")
  .option("-u, --user <email>", "User email (or MOTION_USER_EMAIL)")
  .option("-w, --workspace <id>", "Workspace ID (or MOTION_WORKSPACE_ID)")
  .option("--json", "Output raw JSON");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  WORKSPACE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const ws = program.command("workspace").description("Workspace operations");

ws.command("list")
  .description("List your workspaces")
  .action(async () => {
    const userId = await resolveUser();
    const { data } = await supabase
      .from("members")
      .select("role, workspace:workspaces(id, name, slug)")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (json()) return out(data);
    printTable(
      ["ID", "NAME", "SLUG", "ROLE"],
      (data || []).map((m: any) => [m.workspace.id, m.workspace.name, m.workspace.slug, m.role])
    );
  });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const page = program.command("page").description("Page operations");

page
  .command("list")
  .description("List pages")
  .option("-p, --parent <parentId>", "Filter by parent page")
  .action(async (opts) => {
    const userId = await resolveUser();
    const workspaceId = await resolveWorkspace();
    await requireMember(userId, workspaceId);

    let query = supabase
      .from("pages")
      .select("id, title, icon, type, view_mode, parent_id, position, is_favorite, is_private, is_locked, created_by")
      .eq("workspace_id", workspaceId)
      .eq("is_archived", false);

    if (opts.parent) {
      query = query.eq("parent_id", opts.parent);
    } else {
      query = query.is("parent_id", null);
    }

    const { data: pages } = await query.order("position", { ascending: true });
    const visible = (pages || []).filter(
      (p: any) => !p.is_private || p.created_by === userId
    );

    if (json()) return out(visible);
    printTable(
      ["ID", "TITLE", "TYPE", "ICON", "FAV", "PRIV", "LOCK"],
      visible.map((p: any) => [
        p.id,
        p.title || "Untitled",
        p.type + (p.view_mode ? `(${p.view_mode})` : ""),
        p.icon || "",
        p.is_favorite ? "★" : "",
        p.is_private ? "yes" : "",
        p.is_locked ? "yes" : "",
      ])
    );
  });

page
  .command("get <pageId>")
  .description("Get page details")
  .action(async (pageId) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("*").eq("id", pageId).single();
    if (!pg) die("Page not found");
    await requireMember(userId, pg.workspace_id);

    if (pg.is_private && pg.created_by !== userId) {
      const { data: share } = await supabase
        .from("page_shares")
        .select("id")
        .eq("page_id", pageId)
        .eq("user_id", userId)
        .single();
      if (!share) die("Private page — you don't have access");
    }

    const [blocksRes, propsRes, rowsRes, childrenRes] = await Promise.all([
      supabase.from("blocks").select("*").eq("page_id", pageId).order("position", { ascending: true }),
      supabase.from("database_properties").select("*").eq("page_id", pageId).order("position", { ascending: true }),
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

    const result = {
      id: pg.id,
      title: pg.title,
      icon: pg.icon,
      coverImage: pg.cover_image,
      type: pg.type,
      viewMode: pg.view_mode,
      parentId: pg.parent_id,
      workspaceId: pg.workspace_id,
      position: pg.position,
      isFavorite: pg.is_favorite,
      isArchived: pg.is_archived,
      isPrivate: pg.is_private ?? false,
      isLocked: pg.is_locked ?? false,
      createdBy: pg.created_by,
      blocks: blocksRes.data || [],
      properties: propsRes.data || [],
      rows: (rowsRes.data || []).map((r: any) => ({
        id: r.id,
        position: r.position,
        cells: (r.cells || []).map((c: any) => ({
          id: c.id,
          propertyId: c.property_id,
          rowId: c.row_id,
          value: c.value,
        })),
      })),
      children: childrenRes.data || [],
    };

    if (json()) return out(result);

    console.log(bold(`${result.icon || "📄"} ${result.title || "Untitled"}`));
    console.log(dim("─".repeat(60)));
    console.log(`  ID:         ${result.id}`);
    console.log(`  Type:       ${result.type}${result.viewMode ? ` (${result.viewMode})` : ""}`);
    console.log(`  Parent:     ${result.parentId || "(root)"}`);
    console.log(`  Workspace:  ${result.workspaceId}`);
    console.log(`  Favorite:   ${result.isFavorite ? "yes" : "no"}`);
    console.log(`  Private:    ${result.isPrivate ? "yes" : "no"}`);
    console.log(`  Locked:     ${result.isLocked ? "yes" : "no"}`);
    console.log(`  Archived:   ${result.isArchived ? "yes" : "no"}`);
    if (result.coverImage) console.log(`  Cover:      ${result.coverImage}`);
    if (result.blocks.length) console.log(`  Blocks:     ${result.blocks.length}`);
    if (result.properties.length) {
      console.log(`  Properties: ${result.properties.map((p: any) => `${p.name}(${p.type})`).join(", ")}`);
    }
    if (result.rows.length) console.log(`  Rows:       ${result.rows.length}`);
    if (result.children.length) {
      console.log(`  Children:`);
      for (const ch of result.children) {
        console.log(`    - ${(ch as any).icon || "📄"} ${(ch as any).title || "Untitled"} ${dim((ch as any).id)}`);
      }
    }
  });

page
  .command("create")
  .description("Create a new page")
  .requiredOption("-t, --title <title>", "Page title")
  .option("--type <type>", "PAGE or DATABASE", "PAGE")
  .option("--parent <parentId>", "Parent page ID")
  .option("--icon <icon>", "Page icon (emoji)")
  .option("--view-mode <mode>", "View mode for databases (table/board)")
  .option("--private", "Make page private")
  .action(async (opts) => {
    const userId = await resolveUser();
    const workspaceId = await resolveWorkspace();
    await requireEditor(userId, workspaceId);

    const { data: maxPos } = await supabase
      .from("pages")
      .select("position")
      .eq("workspace_id", workspaceId)
      .is("parent_id", opts.parent || null)
      .order("position", { ascending: false })
      .limit(1)
      .single();

    const { data: pg, error } = await supabase
      .from("pages")
      .insert({
        title: opts.title,
        type: opts.type,
        view_mode: opts.viewMode || null,
        icon: opts.icon || null,
        parent_id: opts.parent || null,
        workspace_id: workspaceId,
        created_by: userId,
        position: (maxPos?.position ?? -1) + 1,
        is_private: opts.private ?? false,
      })
      .select()
      .single();

    if (error || !pg) die(`Failed to create page: ${error?.message}`);

    if (opts.type === "DATABASE") {
      await supabase.from("database_properties").insert([
        { name: "Name", type: "text", position: 0, page_id: pg.id },
        {
          name: "Status",
          type: "select",
          position: 1,
          page_id: pg.id,
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

    if (json()) return out(pg);
    ok(`Created ${opts.type} "${opts.title}" (${pg.id})`);
  });

page
  .command("update <pageId>")
  .description("Update a page")
  .option("--title <title>", "New title")
  .option("--icon <icon>", "New icon")
  .option("--cover <url>", "Cover image URL")
  .action(async (pageId, opts) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id, is_private, created_by").eq("id", pageId).single();
    if (!pg) die("Page not found");
    await requireEditor(userId, pg.workspace_id);

    if (pg.is_private && pg.created_by !== userId) {
      const { data: share } = await supabase
        .from("page_shares")
        .select("permission")
        .eq("page_id", pageId)
        .eq("user_id", userId)
        .single();
      if (!share || share.permission === "VIEWER") die("No edit access to this private page");
    }

    const data: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (opts.title !== undefined) data.title = opts.title;
    if (opts.icon !== undefined) data.icon = opts.icon;
    if (opts.cover !== undefined) data.cover_image = opts.cover;

    const { data: updated } = await supabase.from("pages").update(data).eq("id", pageId).select().single();
    if (json()) return out(updated);
    ok(`Updated page ${pageId}`);
  });

page
  .command("delete <pageId>")
  .description("Move page to trash")
  .option("--permanent", "Permanently delete (admin only)")
  .action(async (pageId, opts) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id, is_locked, title, parent_id, type").eq("id", pageId).single();
    if (!pg) die("Page not found");

    if (opts.permanent) {
      await requireAdmin(userId, pg.workspace_id);
      await supabase.from("pages").delete().eq("id", pageId);
      if (json()) return out({ success: true, permanent: true });
      ok(`Permanently deleted page ${pageId}`);
    } else {
      const member = await requireEditor(userId, pg.workspace_id);
      if (pg.is_locked && member.role !== "ADMIN") die("Page is locked — only admins can trash");

      const childIds = await getDescendantIds(pageId, false);
      const allIds = [pageId, ...childIds];
      await supabase.from("pages").update({ is_archived: true, updated_at: new Date().toISOString() }).in("id", allIds);

      if (json()) return out({ success: true, trashed: allIds.length });
      ok(`Trashed "${pg.title}" and ${childIds.length} child page(s)`);
    }
  });

page
  .command("restore <pageId>")
  .description("Restore page from trash")
  .action(async (pageId) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id, title").eq("id", pageId).single();
    if (!pg) die("Page not found");
    await requireEditor(userId, pg.workspace_id);

    const childIds = await getDescendantIds(pageId, true);
    const allIds = [pageId, ...childIds];
    await supabase.from("pages").update({ is_archived: false, updated_at: new Date().toISOString() }).in("id", allIds);

    if (json()) return out({ success: true, restored: allIds.length });
    ok(`Restored "${pg.title}" and ${childIds.length} child page(s)`);
  });

page
  .command("lock <pageId>")
  .description("Lock a page (admin only)")
  .action(async (pageId) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id").eq("id", pageId).single();
    if (!pg) die("Page not found");
    await requireAdmin(userId, pg.workspace_id);
    await supabase.from("pages").update({ is_locked: true }).eq("id", pageId);
    if (json()) return out({ success: true });
    ok(`Locked page ${pageId}`);
  });

page
  .command("unlock <pageId>")
  .description("Unlock a page (admin only)")
  .action(async (pageId) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id").eq("id", pageId).single();
    if (!pg) die("Page not found");
    await requireAdmin(userId, pg.workspace_id);
    await supabase.from("pages").update({ is_locked: false }).eq("id", pageId);
    if (json()) return out({ success: true });
    ok(`Unlocked page ${pageId}`);
  });

page
  .command("favorite <pageId>")
  .description("Toggle page favorite")
  .action(async (pageId) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id, is_favorite").eq("id", pageId).single();
    if (!pg) die("Page not found");
    await requireMember(userId, pg.workspace_id);
    const newVal = !pg.is_favorite;
    await supabase.from("pages").update({ is_favorite: newVal }).eq("id", pageId);
    if (json()) return out({ isFavorite: newVal });
    ok(newVal ? "Added to favorites" : "Removed from favorites");
  });

page
  .command("move <pageId>")
  .description("Move page to a new parent")
  .option("--parent <parentId>", "New parent page ID (omit for root)")
  .option("--position <n>", "New position", parseInt)
  .action(async (pageId, opts) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id").eq("id", pageId).single();
    if (!pg) die("Page not found");
    await requireEditor(userId, pg.workspace_id);

    const data: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (opts.parent !== undefined) data.parent_id = opts.parent || null;
    if (opts.position !== undefined) data.position = opts.position;

    await supabase.from("pages").update(data).eq("id", pageId);
    if (json()) return out({ success: true });
    ok(`Moved page ${pageId}`);
  });

page
  .command("search <query>")
  .description("Search pages by title")
  .action(async (query) => {
    const userId = await resolveUser();
    const workspaceId = await resolveWorkspace();
    await requireMember(userId, workspaceId);

    const { data: pages } = await supabase
      .from("pages")
      .select("id, title, icon, type, view_mode, parent_id, is_private, created_by")
      .eq("workspace_id", workspaceId)
      .eq("is_archived", false)
      .ilike("title", `%${query}%`)
      .order("updated_at", { ascending: false })
      .limit(20);

    const visible = (pages || []).filter(
      (p: any) => !p.is_private || p.created_by === userId
    );

    if (json()) return out(visible);
    printTable(
      ["ID", "TITLE", "TYPE", "ICON"],
      visible.map((p: any) => [p.id, p.title || "Untitled", p.type, p.icon || ""])
    );
  });

async function getDescendantIds(parentId: string, archived: boolean): Promise<string[]> {
  const { data: children } = await supabase
    .from("pages")
    .select("id")
    .eq("parent_id", parentId)
    .eq("is_archived", archived);
  if (!children?.length) return [];
  const nested = await Promise.all(children.map((c) => getDescendantIds(c.id, archived)));
  return [...children.map((c) => c.id), ...nested.flat()];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  BLOCKS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const block = program.command("block").description("Block operations");

block
  .command("list <pageId>")
  .description("List blocks for a page")
  .action(async (pageId) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id").eq("id", pageId).single();
    if (!pg) die("Page not found");
    await requireMember(userId, pg.workspace_id);

    const { data: blocks } = await supabase
      .from("blocks")
      .select("*")
      .eq("page_id", pageId)
      .order("position", { ascending: true });

    if (json()) return out(blocks);
    printTable(
      ["POS", "ID", "TYPE", "CONTENT_PREVIEW"],
      (blocks || []).map((b: any) => {
        const cType = b.content?.type || b.type || "";
        const text = extractBlockText(b);
        return [String(b.position), b.id, cType, text.slice(0, 60)];
      })
    );
  });

block
  .command("save <pageId>")
  .description("Replace all blocks (JSON array from stdin or --blocks)")
  .option("-b, --blocks <json>", "Blocks JSON array")
  .action(async (pageId, opts) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id").eq("id", pageId).single();
    if (!pg) die("Page not found");
    await requireEditor(userId, pg.workspace_id);

    let blocks: any[];
    if (opts.blocks) {
      blocks = JSON.parse(opts.blocks);
    } else {
      const stdin = readFileSync(0, "utf8");
      blocks = JSON.parse(stdin);
    }

    await supabase.from("blocks").delete().eq("page_id", pageId);
    if (blocks.length > 0) {
      const rows = blocks.map((b: any, i: number) => ({
        id: b.id,
        type: b.type,
        content: b.content,
        position: i,
        page_id: pageId,
      }));
      await supabase.from("blocks").insert(rows);
    }
    await supabase.from("pages").update({ updated_at: new Date().toISOString() }).eq("id", pageId);

    if (json()) return out({ success: true, count: blocks.length });
    ok(`Saved ${blocks.length} block(s) to page ${pageId}`);
  });

function extractBlockText(block: any): string {
  const c = block.content;
  if (!c || typeof c !== "object") return "";
  const inner = c.content;
  if (!Array.isArray(inner)) return "";
  return inner
    .filter((item: any) => item.type === "text" && item.text)
    .map((item: any) => item.text)
    .join("");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  DATABASE (properties, rows, cells)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const db = program.command("db").description("Database operations");

db.command("props <pageId>")
  .description("List database properties")
  .action(async (pageId) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id, type").eq("id", pageId).single();
    if (!pg) die("Page not found");
    if (pg.type !== "DATABASE") die("Not a database page");
    await requireMember(userId, pg.workspace_id);

    const { data: props } = await supabase
      .from("database_properties")
      .select("*")
      .eq("page_id", pageId)
      .order("position", { ascending: true });

    if (json()) return out(props);
    printTable(
      ["ID", "NAME", "TYPE", "POS", "OPTIONS"],
      (props || []).map((p: any) => [
        p.id,
        p.name,
        p.type,
        String(p.position),
        p.options ? JSON.stringify(p.options).slice(0, 40) : "",
      ])
    );
  });

db.command("add-prop <pageId>")
  .description("Add a database property")
  .requiredOption("-n, --name <name>", "Property name")
  .option("--type <type>", "Property type (text/number/select/date/checkbox/url)", "text")
  .option("--options <json>", "Options JSON")
  .action(async (pageId, opts) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id, type").eq("id", pageId).single();
    if (!pg || pg.type !== "DATABASE") die("Not a database page");
    await requireEditor(userId, pg.workspace_id);

    const { data: maxPos } = await supabase
      .from("database_properties")
      .select("position")
      .eq("page_id", pageId)
      .order("position", { ascending: false })
      .limit(1)
      .single();

    const { data: prop } = await supabase
      .from("database_properties")
      .insert({
        name: opts.name,
        type: opts.type,
        options: opts.options ? JSON.parse(opts.options) : null,
        position: (maxPos?.position ?? -1) + 1,
        page_id: pageId,
      })
      .select()
      .single();

    if (json()) return out(prop);
    ok(`Added property "${opts.name}" (${prop?.id})`);
  });

db.command("update-prop <pageId>")
  .description("Update a database property")
  .requiredOption("--id <propId>", "Property ID")
  .option("-n, --name <name>", "New name")
  .option("--type <type>", "New type")
  .option("--options <json>", "New options JSON")
  .action(async (pageId, opts) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id, type").eq("id", pageId).single();
    if (!pg || pg.type !== "DATABASE") die("Not a database page");
    await requireEditor(userId, pg.workspace_id);

    const data: Record<string, unknown> = {};
    if (opts.name !== undefined) data.name = opts.name;
    if (opts.type !== undefined) data.type = opts.type;
    if (opts.options !== undefined) data.options = JSON.parse(opts.options);

    const { data: updated } = await supabase
      .from("database_properties")
      .update(data)
      .eq("id", opts.id)
      .select()
      .single();

    if (json()) return out(updated);
    ok(`Updated property ${opts.id}`);
  });

db.command("delete-prop <pageId>")
  .description("Delete a database property")
  .requiredOption("--id <propId>", "Property ID")
  .action(async (pageId, opts) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id, type").eq("id", pageId).single();
    if (!pg || pg.type !== "DATABASE") die("Not a database page");
    await requireEditor(userId, pg.workspace_id);

    await supabase.from("database_properties").delete().eq("id", opts.id);
    if (json()) return out({ success: true });
    ok(`Deleted property ${opts.id}`);
  });

db.command("rows <pageId>")
  .description("List database rows")
  .action(async (pageId) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id, type").eq("id", pageId).single();
    if (!pg || pg.type !== "DATABASE") die("Not a database page");
    await requireMember(userId, pg.workspace_id);

    const { data: props } = await supabase
      .from("database_properties")
      .select("id, name, position")
      .eq("page_id", pageId)
      .order("position", { ascending: true });

    const { data: rows } = await supabase
      .from("database_rows")
      .select("*, cells:cell_values(*)")
      .eq("page_id", pageId)
      .eq("is_archived", false)
      .order("position", { ascending: true });

    if (json()) return out({ properties: props, rows });

    const propList = props || [];
    const headers = ["ROW_ID", ...propList.map((p: any) => p.name.toUpperCase())];
    const tableRows = (rows || []).map((r: any) => {
      const cells = r.cells || [];
      const cellMap = new Map(cells.map((c: any) => [c.property_id, c.value]));
      return [
        r.id.slice(0, 8),
        ...propList.map((p: any) => {
          const val = cellMap.get(p.id);
          if (val === null || val === undefined) return "";
          if (typeof val === "boolean") return val ? "✓" : "";
          return String(val).slice(0, 30);
        }),
      ];
    });

    printTable(headers, tableRows);
  });

db.command("add-row <pageId>")
  .description("Add a database row")
  .option("-c, --cells <json>", 'Cells JSON: [{"propertyId":"...","value":"..."}]')
  .action(async (pageId, opts) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id, type").eq("id", pageId).single();
    if (!pg || pg.type !== "DATABASE") die("Not a database page");
    await requireEditor(userId, pg.workspace_id);

    const cells = opts.cells ? JSON.parse(opts.cells) : [];

    const { data: props } = await supabase
      .from("database_properties")
      .select("id, position")
      .eq("page_id", pageId)
      .order("position", { ascending: true });

    const namePropId = props?.find((p: any) => p.position === 0)?.id;
    const nameCellValue = cells.find((c: any) => c.propertyId === namePropId)?.value;
    const rowTitle = typeof nameCellValue === "string" && nameCellValue ? nameCellValue : "Untitled";

    const { data: maxPos } = await supabase
      .from("database_rows")
      .select("position")
      .eq("page_id", pageId)
      .order("position", { ascending: false })
      .limit(1)
      .single();

    const { data: row } = await supabase
      .from("database_rows")
      .insert({ page_id: pageId, position: (maxPos?.position ?? -1) + 1 })
      .select()
      .single();

    if (!row) die("Failed to create row");

    if (cells.length > 0) {
      const inserts = cells.map((c: any) => ({
        property_id: c.propertyId,
        row_id: row.id,
        value: c.value,
      }));
      await supabase.from("cell_values").insert(inserts);
    }

    const { data: maxPagePos } = await supabase
      .from("pages")
      .select("position")
      .eq("workspace_id", pg.workspace_id)
      .eq("parent_id", pageId)
      .order("position", { ascending: false })
      .limit(1)
      .single();

    await supabase.from("pages").insert({
      title: rowTitle,
      type: "PAGE",
      parent_id: pageId,
      workspace_id: pg.workspace_id,
      created_by: userId,
      position: (maxPagePos?.position ?? -1) + 1,
    });

    if (json()) return out(row);
    ok(`Added row "${rowTitle}" (${row.id})`);
  });

db.command("delete-row <pageId>")
  .description("Delete (archive) a database row")
  .requiredOption("--row <rowId>", "Row ID")
  .action(async (pageId, opts) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id").eq("id", pageId).single();
    if (!pg) die("Page not found");
    await requireEditor(userId, pg.workspace_id);

    await supabase
      .from("database_rows")
      .update({ is_archived: true, updated_at: new Date().toISOString() })
      .eq("id", opts.row);

    if (json()) return out({ success: true });
    ok(`Deleted row ${opts.row}`);
  });

db.command("set-cell <pageId>")
  .description("Set a cell value")
  .requiredOption("--property <propId>", "Property ID")
  .requiredOption("--row <rowId>", "Row ID")
  .requiredOption("--value <value>", "New value (string; use JSON for complex values)")
  .action(async (pageId, opts) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id").eq("id", pageId).single();
    if (!pg) die("Page not found");
    await requireEditor(userId, pg.workspace_id);

    let value: unknown = opts.value;
    try {
      value = JSON.parse(opts.value);
    } catch {
      // keep as string
    }

    const { data: existing } = await supabase
      .from("cell_values")
      .select("id")
      .eq("property_id", opts.property)
      .eq("row_id", opts.row)
      .single();

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
        .insert({ property_id: opts.property, row_id: opts.row, value })
        .select()
        .single();
      cell = data;
    }

    const { data: prop } = await supabase
      .from("database_properties")
      .select("position")
      .eq("id", opts.property)
      .single();

    if (prop?.position === 0 && typeof value === "string") {
      const newTitle = value || "Untitled";
      const { data: childPage } = await supabase
        .from("pages")
        .select("id")
        .eq("parent_id", pageId)
        .limit(1)
        .single();
      if (childPage) {
        await supabase.from("pages").update({ title: newTitle }).eq("id", childPage.id);
      }
    }

    if (json()) return out(cell);
    ok(`Set cell value`);
  });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TEMPLATES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const template = program.command("template").description("Template operations");

template
  .command("list")
  .description("List templates")
  .action(async () => {
    const workspaceId = await resolveWorkspace();
    const { data: templates } = await supabase
      .from("templates")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (json()) return out(templates);
    printTable(
      ["ID", "TITLE", "TYPE", "DESCRIPTION"],
      (templates || []).map((t: any) => [t.id, t.title, t.type, (t.description || "").slice(0, 40)])
    );
  });

template
  .command("create")
  .description("Create a template")
  .requiredOption("-t, --title <title>", "Template title")
  .option("-d, --description <desc>", "Description")
  .option("--icon <icon>", "Icon")
  .option("--type <type>", "PAGE or DATABASE", "PAGE")
  .option("--from-page <pageId>", "Copy blocks/properties from existing page")
  .action(async (opts) => {
    const userId = await resolveUser();
    const workspaceId = await resolveWorkspace();
    await requireEditor(userId, workspaceId);

    let blocks: any[] = [];
    let properties: any[] = [];

    if (opts.fromPage) {
      const [blocksRes, propsRes] = await Promise.all([
        supabase.from("blocks").select("*").eq("page_id", opts.fromPage).order("position", { ascending: true }),
        supabase.from("database_properties").select("*").eq("page_id", opts.fromPage).order("position", { ascending: true }),
      ]);
      blocks = blocksRes.data || [];
      properties = propsRes.data || [];
    }

    const { data: tmpl } = await supabase
      .from("templates")
      .insert({
        title: opts.title,
        description: opts.description || null,
        icon: opts.icon || null,
        type: opts.type,
        blocks,
        properties,
        workspace_id: workspaceId,
      })
      .select()
      .single();

    if (json()) return out(tmpl);
    ok(`Created template "${opts.title}" (${tmpl?.id})`);
  });

template
  .command("update")
  .description("Update a template")
  .requiredOption("--id <id>", "Template ID")
  .option("-t, --title <title>", "New title")
  .option("-d, --description <desc>", "New description")
  .option("--icon <icon>", "New icon")
  .action(async (opts) => {
    const userId = await resolveUser();
    const { data: tmpl } = await supabase.from("templates").select("workspace_id").eq("id", opts.id).single();
    if (!tmpl) die("Template not found");
    await requireEditor(userId, tmpl.workspace_id);

    const data: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (opts.title !== undefined) data.title = opts.title;
    if (opts.description !== undefined) data.description = opts.description;
    if (opts.icon !== undefined) data.icon = opts.icon;

    const { data: updated } = await supabase.from("templates").update(data).eq("id", opts.id).select().single();
    if (json()) return out(updated);
    ok(`Updated template ${opts.id}`);
  });

template
  .command("delete")
  .description("Delete a template")
  .requiredOption("--id <id>", "Template ID")
  .action(async (opts) => {
    const userId = await resolveUser();
    const { data: tmpl } = await supabase.from("templates").select("workspace_id").eq("id", opts.id).single();
    if (!tmpl) die("Template not found");
    await requireEditor(userId, tmpl.workspace_id);

    await supabase.from("templates").delete().eq("id", opts.id);
    if (json()) return out({ success: true });
    ok(`Deleted template ${opts.id}`);
  });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MEMBERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const member = program.command("member").description("Member operations");

member
  .command("list")
  .description("List workspace members")
  .action(async () => {
    const userId = await resolveUser();
    const workspaceId = await resolveWorkspace();
    await requireMember(userId, workspaceId);

    const { data: members } = await supabase
      .from("members")
      .select("*, user:users(id, name, email, image)")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });

    if (json()) return out(members);
    printTable(
      ["MEMBER_ID", "NAME", "EMAIL", "ROLE"],
      (members || []).map((m: any) => [m.id, m.user?.name || "", m.user?.email || "", m.role])
    );
  });

member
  .command("invite")
  .description("Invite a member (admin only)")
  .requiredOption("-e, --email <email>", "Email to invite")
  .option("-r, --role <role>", "ADMIN, EDITOR, or VIEWER", "EDITOR")
  .action(async (opts) => {
    const userId = await resolveUser();
    const workspaceId = await resolveWorkspace();
    await requireAdmin(userId, workspaceId);

    let { data: user } = await supabase.from("users").select("id").eq("email", opts.email).single();
    if (!user) {
      const { data: newUser } = await supabase.from("users").insert({ email: opts.email }).select("id").single();
      user = newUser;
    }
    if (!user) die("Failed to find/create user");

    const { data: existing } = await supabase
      .from("members")
      .select("id")
      .eq("user_id", user.id)
      .eq("workspace_id", workspaceId)
      .single();
    if (existing) die("User is already a member");

    const { data: newMember } = await supabase
      .from("members")
      .insert({ user_id: user.id, workspace_id: workspaceId, role: opts.role })
      .select("*, user:users(id, name, email, image)")
      .single();

    if (json()) return out(newMember);
    ok(`Invited ${opts.email} as ${opts.role}`);
  });

member
  .command("update-role")
  .description("Change a member's role (admin only)")
  .requiredOption("--id <memberId>", "Member ID")
  .requiredOption("-r, --role <role>", "New role: ADMIN, EDITOR, or VIEWER")
  .action(async (opts) => {
    const userId = await resolveUser();
    const { data: m } = await supabase.from("members").select("workspace_id").eq("id", opts.id).single();
    if (!m) die("Member not found");
    await requireAdmin(userId, m.workspace_id);

    const { data: updated } = await supabase
      .from("members")
      .update({ role: opts.role })
      .eq("id", opts.id)
      .select("*, user:users(id, name, email, image)")
      .single();

    if (json()) return out(updated);
    ok(`Updated role to ${opts.role}`);
  });

member
  .command("remove")
  .description("Remove a member (admin only)")
  .requiredOption("--id <memberId>", "Member ID")
  .action(async (opts) => {
    const userId = await resolveUser();
    const { data: m } = await supabase.from("members").select("workspace_id").eq("id", opts.id).single();
    if (!m) die("Member not found");
    await requireAdmin(userId, m.workspace_id);

    await supabase.from("members").delete().eq("id", opts.id);
    if (json()) return out({ success: true });
    ok(`Removed member ${opts.id}`);
  });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SHARES (page-level sharing with workspace members)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const share = program.command("share").description("Page share operations");

share
  .command("list <pageId>")
  .description("List page shares")
  .action(async (pageId) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id").eq("id", pageId).single();
    if (!pg) die("Page not found");
    await requireMember(userId, pg.workspace_id);

    const { data: shares } = await supabase
      .from("page_shares")
      .select("id, user_id, permission, created_at, user:users(id, name, email, image)")
      .eq("page_id", pageId)
      .order("created_at", { ascending: true });

    if (json()) return out(shares);
    printTable(
      ["SHARE_ID", "USER", "EMAIL", "PERMISSION"],
      (shares || []).map((s: any) => [s.id, s.user?.name || "", s.user?.email || "", s.permission])
    );
  });

share
  .command("add <pageId>")
  .description("Share a page with a workspace member")
  .requiredOption("--user-id <userId>", "User ID to share with")
  .option("--permission <perm>", "VIEWER or EDITOR", "VIEWER")
  .action(async (pageId, opts) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id, is_private").eq("id", pageId).single();
    if (!pg) die("Page not found");
    await requireEditor(userId, pg.workspace_id);

    const { data: targetMember } = await supabase
      .from("members")
      .select("id")
      .eq("user_id", opts.userId)
      .eq("workspace_id", pg.workspace_id)
      .single();
    if (!targetMember) die("Target user is not a workspace member");

    const { data: existing } = await supabase
      .from("page_shares")
      .select("id")
      .eq("page_id", pageId)
      .eq("user_id", opts.userId)
      .single();
    if (existing) die("User already has access");

    if (!pg.is_private) {
      await supabase.from("pages").update({ is_private: true }).eq("id", pageId);
    }

    const { data: shareData } = await supabase
      .from("page_shares")
      .insert({ page_id: pageId, user_id: opts.userId, permission: opts.permission })
      .select("id, user_id, permission, created_at, user:users(id, name, email, image)")
      .single();

    if (json()) return out(shareData);
    ok(`Shared page with user (permission: ${opts.permission})`);
  });

share
  .command("update <pageId>")
  .description("Update share permission")
  .requiredOption("--share <shareId>", "Share ID")
  .requiredOption("--permission <perm>", "VIEWER or EDITOR")
  .action(async (pageId, opts) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id").eq("id", pageId).single();
    if (!pg) die("Page not found");
    await requireEditor(userId, pg.workspace_id);

    const { data: updated } = await supabase
      .from("page_shares")
      .update({ permission: opts.permission })
      .eq("id", opts.share)
      .eq("page_id", pageId)
      .select("id, user_id, permission, created_at, user:users(id, name, email, image)")
      .single();

    if (!updated) die("Share not found");
    if (json()) return out(updated);
    ok(`Updated share permission to ${opts.permission}`);
  });

share
  .command("remove <pageId>")
  .description("Remove a page share")
  .requiredOption("--share <shareId>", "Share ID")
  .action(async (pageId, opts) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id").eq("id", pageId).single();
    if (!pg) die("Page not found");
    await requireEditor(userId, pg.workspace_id);

    await supabase.from("page_shares").delete().eq("id", opts.share);
    if (json()) return out({ success: true });
    ok(`Removed share ${opts.share}`);
  });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GUESTS (external guest access via link)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const guest = program.command("guest").description("Guest invite operations");

guest
  .command("list <pageId>")
  .description("List guest invites for a page")
  .action(async (pageId) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id").eq("id", pageId).single();
    if (!pg) die("Page not found");
    await requireMember(userId, pg.workspace_id);

    const { data: guests } = await supabase
      .from("page_guests")
      .select("id, email, permission, token, created_at, invited_by")
      .eq("page_id", pageId)
      .order("created_at", { ascending: true });

    if (json()) return out(guests);
    printTable(
      ["ID", "EMAIL", "PERMISSION", "TOKEN"],
      (guests || []).map((g: any) => [g.id, g.email, g.permission, g.token || ""])
    );
  });

guest
  .command("invite <pageId>")
  .description("Invite a guest by email")
  .requiredOption("-e, --email <email>", "Guest email")
  .option("--permission <perm>", "VIEWER or EDITOR", "VIEWER")
  .action(async (pageId, opts) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id").eq("id", pageId).single();
    if (!pg) die("Page not found");
    await requireEditor(userId, pg.workspace_id);

    const email = opts.email.toLowerCase().trim();
    const { data: existing } = await supabase
      .from("page_guests")
      .select("id")
      .eq("page_id", pageId)
      .eq("email", email)
      .single();
    if (existing) die("This email already has guest access");

    const { data: guestData } = await supabase
      .from("page_guests")
      .insert({ page_id: pageId, email, permission: opts.permission, invited_by: userId })
      .select("id, email, permission, token, created_at, invited_by")
      .single();

    if (json()) return out(guestData);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    ok(`Invited ${email} as guest (${opts.permission})`);
    if (guestData?.token) {
      console.log(`  Guest link: ${appUrl}/guest/${guestData.token}`);
    }
  });

guest
  .command("remove <pageId>")
  .description("Remove a guest invite")
  .requiredOption("--guest <guestId>", "Guest ID")
  .action(async (pageId, opts) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id").eq("id", pageId).single();
    if (!pg) die("Page not found");
    await requireEditor(userId, pg.workspace_id);

    await supabase.from("page_guests").delete().eq("id", opts.guest);
    if (json()) return out({ success: true });
    ok(`Removed guest ${opts.guest}`);
  });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  COMMENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const comment = program.command("comment").description("Comment operations");

comment
  .command("list <pageId>")
  .description("List comments on a page")
  .action(async (pageId) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id").eq("id", pageId).single();
    if (!pg) die("Page not found");
    await requireMember(userId, pg.workspace_id);

    const { data: comments } = await supabase
      .from("comments")
      .select("*, user:users!comments_user_id_fkey(id, name, email, image)")
      .eq("page_id", pageId)
      .order("created_at", { ascending: true });

    const parsed = (comments || []).map((c: any) => {
      let text = c.content;
      let quote: string | null = null;
      try {
        const obj = JSON.parse(c.content);
        text = obj.text;
        quote = obj.quote || null;
      } catch {}
      return { ...c, content: text, quote };
    });

    if (json()) return out(parsed);
    for (const c of parsed) {
      const status = c.is_resolved ? dim("[resolved]") : "";
      const author = c.user?.name || c.user?.email || "Unknown";
      console.log(`${bold(author)} ${dim(c.created_at)} ${status}`);
      if (c.quote) console.log(`  ${dim(`> ${c.quote}`)}`);
      console.log(`  ${c.content}`);
      console.log(`  ${dim(`id: ${c.id}`)}`);
      console.log();
    }
    if (parsed.length === 0) console.log(dim("  (no comments)"));
  });

comment
  .command("add <pageId>")
  .description("Add a comment")
  .requiredOption("-c, --content <text>", "Comment text")
  .option("-q, --quote <text>", "Quoted text from the page")
  .action(async (pageId, opts) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id, title").eq("id", pageId).single();
    if (!pg) die("Page not found");
    await requireMember(userId, pg.workspace_id);

    const stored = JSON.stringify({ text: opts.content.trim(), quote: opts.quote || null });
    const { data: commentData } = await supabase
      .from("comments")
      .insert({ page_id: pageId, user_id: userId, content: stored })
      .select("*, user:users!comments_user_id_fkey(id, name, email, image)")
      .single();

    if (json()) return out(commentData);
    ok("Comment added");
  });

comment
  .command("resolve <pageId>")
  .description("Resolve a comment")
  .requiredOption("--comment <commentId>", "Comment ID")
  .action(async (pageId, opts) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id").eq("id", pageId).single();
    if (!pg) die("Page not found");
    await requireMember(userId, pg.workspace_id);

    await supabase
      .from("comments")
      .update({ is_resolved: true, resolved_by: userId })
      .eq("id", opts.comment)
      .eq("page_id", pageId);

    if (json()) return out({ success: true });
    ok(`Resolved comment ${opts.comment}`);
  });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  NOTIFICATIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const notif = program.command("notification").alias("notif").description("Notification operations");

notif
  .command("list")
  .description("List your notifications")
  .action(async () => {
    const userId = await resolveUser();
    const { data: notifications } = await supabase
      .from("notifications")
      .select("*, actor:users!notifications_actor_id_fkey(id, name, email, image)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (json()) return out(notifications);
    printTable(
      ["ID", "TYPE", "FROM", "CONTENT", "READ", "TIME"],
      (notifications || []).map((n: any) => [
        n.id,
        n.type,
        n.actor?.name || n.actor?.email || "",
        (n.content || "").slice(0, 40),
        n.is_read ? "yes" : cyan("NEW"),
        n.created_at?.slice(0, 16) || "",
      ])
    );
  });

notif
  .command("read <notificationId>")
  .description("Mark a notification as read")
  .action(async (notificationId) => {
    const userId = await resolveUser();
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId)
      .eq("user_id", userId);

    if (json()) return out({ success: true });
    ok("Marked as read");
  });

notif
  .command("read-all")
  .description("Mark all notifications as read")
  .action(async () => {
    const userId = await resolveUser();
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (json()) return out({ success: true });
    ok("All notifications marked as read");
  });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PROFILE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const profile = program.command("profile").description("Profile operations");

profile
  .command("get")
  .description("Get your profile")
  .action(async () => {
    const userId = await resolveUser();
    const { data } = await supabase.from("users").select("id, name, email, image").eq("id", userId).single();
    if (!data) die("User not found");

    if (json()) return out(data);
    console.log(bold(data.name || "Unnamed"));
    console.log(`  Email:  ${data.email}`);
    console.log(`  ID:     ${data.id}`);
    if (data.image) console.log(`  Avatar: ${data.image}`);
  });

profile
  .command("update")
  .description("Update your profile")
  .option("-n, --name <name>", "Display name")
  .option("--image <url>", "Avatar URL")
  .action(async (opts) => {
    const userId = await resolveUser();
    const updates: Record<string, string> = {};
    if (opts.name) updates.name = opts.name.trim();
    if (opts.image) updates.image = opts.image;

    if (Object.keys(updates).length === 0) die("Provide --name or --image");

    const { data } = await supabase
      .from("users")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select("id, name, email, image")
      .single();

    if (json()) return out(data);
    ok("Profile updated");
  });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TRASH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const trash = program.command("trash").description("Trash operations");

trash
  .command("list")
  .description("List trashed pages")
  .action(async () => {
    const userId = await resolveUser();
    const workspaceId = await resolveWorkspace();
    await requireMember(userId, workspaceId);

    const { data: pages } = await supabase
      .from("pages")
      .select("id, title, icon, type, view_mode, parent_id, updated_at, created_by, is_private")
      .eq("workspace_id", workspaceId)
      .eq("is_archived", true)
      .order("updated_at", { ascending: false });

    const visible = (pages || []).filter(
      (p: any) => !p.is_private || p.created_by === userId
    );

    if (json()) return out(visible);
    printTable(
      ["ID", "TITLE", "TYPE", "DELETED_AT"],
      visible.map((p: any) => [p.id, p.title || "Untitled", p.type, p.updated_at?.slice(0, 16) || ""])
    );
  });

trash
  .command("empty")
  .description("Permanently delete all trashed pages (admin only)")
  .action(async () => {
    const userId = await resolveUser();
    const workspaceId = await resolveWorkspace();
    await requireAdmin(userId, workspaceId);

    const { data: pages } = await supabase
      .from("pages")
      .select("id, is_private, created_by, parent_id")
      .eq("workspace_id", workspaceId)
      .eq("is_archived", true);

    const toDelete = (pages || []).filter(
      (p: any) => !p.is_private || p.created_by === userId
    );

    if (toDelete.length === 0) {
      if (json()) return out({ success: true, deleted: 0 });
      console.log(dim("Trash is empty"));
      return;
    }

    const ids = toDelete.map((p: any) => p.id);
    await supabase.from("pages").delete().in("id", ids);

    if (json()) return out({ success: true, deleted: ids.length });
    ok(`Permanently deleted ${ids.length} page(s)`);
  });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  HISTORY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const history = program.command("history").description("Page history");

history
  .command("list <pageId>")
  .description("View page history")
  .option("-l, --limit <n>", "Number of entries", "20")
  .option("-o, --offset <n>", "Offset", "0")
  .action(async (pageId, opts) => {
    const userId = await resolveUser();
    const { data: pg } = await supabase.from("pages").select("workspace_id").eq("id", pageId).single();
    if (!pg) die("Page not found");
    await requireMember(userId, pg.workspace_id);

    const limit = Math.min(Number(opts.limit), 100);
    const offset = Number(opts.offset);

    const { data: historyData, count } = await supabase
      .from("page_history")
      .select("id, page_id, user_id, action, changes, created_at", { count: "exact" })
      .eq("page_id", pageId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const userIds = [...new Set((historyData || []).map((h: any) => h.user_id))];
    const { data: users } = userIds.length > 0
      ? await supabase.from("users").select("id, name, email").in("id", userIds)
      : { data: [] };

    const userMap = new Map((users || []).map((u: any) => [u.id, u]));

    const entries = (historyData || []).map((h: any) => ({
      ...h,
      user: userMap.get(h.user_id) || { name: "Unknown" },
    }));

    if (json()) return out({ entries, total: count || 0 });
    printTable(
      ["TIME", "USER", "ACTION", "DETAILS"],
      entries.map((e: any) => [
        e.created_at?.slice(0, 16) || "",
        e.user?.name || e.user?.email || "",
        e.action,
        JSON.stringify(e.changes || {}).slice(0, 50),
      ])
    );
    console.log(dim(`\nShowing ${entries.length} of ${count || 0} entries`));
  });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  AI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const ai = program.command("ai").description("AI text operations");

ai.command("generate")
  .description("Generate text with AI")
  .requiredOption("-p, --prompt <prompt>", "Generation prompt")
  .action(async (opts) => {
    if (!process.env.OPENAI_API_KEY) die("OPENAI_API_KEY not configured");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful writing assistant. The user will give you an instruction and you should generate text based on it. Return ONLY the generated text. Do not wrap your response in quotes, backticks, or any other delimiters. Do not add any explanation or preamble.",
        },
        { role: "user", content: opts.prompt },
      ],
      temperature: 0.7,
    });

    let text = completion.choices[0]?.message?.content?.trim() || "";
    text = text.replace(/^"""\s*\n?/, "").replace(/\n?\s*"""$/, "");
    text = text.replace(/^"\s*\n?/, "").replace(/\n?\s*"$/, "");

    if (!text) die("No response from AI");
    if (json()) return out({ text });
    console.log(text);
  });

ai.command("edit")
  .description("Edit text with AI")
  .requiredOption("--text <text>", "Text to edit")
  .requiredOption("-p, --prompt <prompt>", "Edit instruction")
  .action(async (opts) => {
    if (!process.env.OPENAI_API_KEY) die("OPENAI_API_KEY not configured");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful writing assistant. The user will provide some text and an instruction for how to edit it. Return ONLY the edited text. Do not wrap your response in quotes, backticks, or any other delimiters. Do not add any explanation or preamble.",
        },
        {
          role: "user",
          content: `Here is the text:\n${opts.text}\n\nEdit it according to this instruction: ${opts.prompt}`,
        },
      ],
      temperature: 0.7,
    });

    let text = completion.choices[0]?.message?.content?.trim() || "";
    text = text.replace(/^"""\s*\n?/, "").replace(/\n?\s*"""$/, "");
    text = text.replace(/^"\s*\n?/, "").replace(/\n?\s*"$/, "");

    if (!text) die("No response from AI");
    if (json()) return out({ editedText: text });
    console.log(text);
  });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Run
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
program.parseAsync(process.argv).catch((err) => {
  console.error(red(err.message || String(err)));
  process.exit(1);
});
