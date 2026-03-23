/* eslint-disable @typescript-eslint/no-explicit-any */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { Client } from "@notionhq/client";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);
const notion = new Client({ auth: process.env.NOTION_API_KEY });

const DRY_RUN = process.argv.includes("--dry-run");
const VERBOSE = process.argv.includes("--verbose");

const stats = { pages: 0, databases: 0, blocks: 0, rows: 0, skipped: 0, errors: 0 };

// ─── Rich Text Conversion ──────────────────────────────────────────────────

type StyledText = { type: "text"; text: string; styles: Record<string, true> };
type LinkContent = { type: "link"; href: string; content: StyledText[] };
type InlineContent = StyledText | LinkContent;

function convertRichText(richText: any[]): InlineContent[] {
  if (!richText?.length) return [];

  const result: InlineContent[] = [];
  for (const segment of richText) {
    const styles: Record<string, true> = {};
    if (segment.annotations?.bold) styles.bold = true;
    if (segment.annotations?.italic) styles.italic = true;
    if (segment.annotations?.strikethrough) styles.strike = true;
    if (segment.annotations?.underline) styles.underline = true;
    if (segment.annotations?.code) styles.code = true;

    const href = segment.href || segment.text?.link?.url;
    const text = (segment.plain_text || "").replace(/\n/g, " ");

    if (href) {
      result.push({
        type: "link" as const,
        href,
        content: [{ type: "text" as const, text, styles }],
      });
    } else {
      result.push({ type: "text" as const, text, styles });
    }
  }
  return result;
}

function richTextToString(richText: any[]): string {
  return (richText || []).map((t: any) => t.plain_text).join("").replace(/\n/g, " ").trim();
}

// ─── Notion Block → BlockNote Block ─────────────────────────────────────────

function notionColorToBlockNote(color: string | undefined): Record<string, string> {
  if (!color || color === "default") return {};
  if (color.endsWith("_background")) {
    return { backgroundColor: color.replace("_background", "") };
  }
  return { textColor: color };
}

function convertNotionBlock(block: any): any | null {
  const type = block.type;
  const data = block[type];
  if (!data) return null;

  switch (type) {
    case "paragraph":
      return {
        id: block.id,
        type: "paragraph",
        content: convertRichText(data.rich_text),
        props: { ...notionColorToBlockNote(data.color) },
        children: [],
      };

    case "heading_1":
    case "heading_2":
    case "heading_3": {
      const level = type === "heading_1" ? 1 : type === "heading_2" ? 2 : 3;
      return {
        id: block.id,
        type: "heading",
        content: convertRichText(data.rich_text),
        props: { level, ...notionColorToBlockNote(data.color) },
        children: [],
      };
    }

    case "bulleted_list_item":
    case "toggle":
      return {
        id: block.id,
        type: "bulletListItem",
        content: convertRichText(data.rich_text),
        props: { ...notionColorToBlockNote(data.color) },
        children: [],
      };

    case "numbered_list_item":
      return {
        id: block.id,
        type: "numberedListItem",
        content: convertRichText(data.rich_text),
        props: { ...notionColorToBlockNote(data.color) },
        children: [],
      };

    case "to_do":
      return {
        id: block.id,
        type: "checkListItem",
        content: convertRichText(data.rich_text),
        props: { checked: data.checked ?? false },
        children: [],
      };

    case "code":
      return {
        id: block.id,
        type: "codeBlock",
        content: convertRichText(data.rich_text),
        props: { language: data.language || "text" },
        children: [],
      };

    case "quote":
    case "callout":
      return {
        id: block.id,
        type: "paragraph",
        content: convertRichText(data.rich_text),
        props: {
          ...notionColorToBlockNote(data.color),
        },
        children: [],
      };

    case "divider":
      return {
        id: block.id,
        type: "paragraph",
        content: [{ type: "text", text: "---", styles: {} }],
        props: {},
        children: [],
      };

    case "image": {
      const url =
        data.type === "external" ? data.external?.url : data.file?.url;
      if (!url) return null;
      return {
        id: block.id,
        type: "image",
        props: {
          url,
          caption: data.caption ? richTextToString(data.caption) : "",
          width: 512,
        },
        children: [],
      };
    }

    case "video": {
      const url =
        data.type === "external" ? data.external?.url : data.file?.url;
      if (!url) return null;
      return {
        id: block.id,
        type: "paragraph",
        content: [
          { type: "link", text: url, styles: {}, href: url },
        ],
        props: {},
        children: [],
      };
    }

    case "bookmark":
    case "embed":
    case "link_preview": {
      const url = data.url || data.external?.url || "";
      const caption = data.caption ? richTextToString(data.caption) : url;
      return {
        id: block.id,
        type: "paragraph",
        content: [
          { type: "link", text: caption || url, styles: {}, href: url },
        ],
        props: {},
        children: [],
      };
    }

    case "table":
      return convertTableBlock(block);

    case "table_row":
      return null;

    case "column_list":
    case "column":
      return null;

    case "table_of_contents":
    case "breadcrumb":
      return null;

    case "child_page":
    case "child_database":
      return null;

    case "unsupported":
      return null;

    default:
      if (VERBOSE) console.log(`    Skipping unsupported block type: ${type}`);
      stats.skipped++;
      return null;
  }
}

function convertTableBlock(block: any): any | null {
  const data = block.table;
  const children = block._children || [];
  if (!children.length) return null;

  const rows = children
    .filter((c: any) => c.type === "table_row")
    .map((row: any) => ({
      cells: (row.table_row?.cells || []).map((cell: any) => {
        const inline = convertRichText(cell);
        const hasFormatting = inline.some(
          (i: any) => i.type === "link" || Object.keys(i.styles || {}).length > 0
        );
        return hasFormatting ? inline : richTextToString(cell);
      }),
    }));

  if (!rows.length) return null;

  return {
    id: block.id,
    type: "table",
    content: {
      type: "tableContent",
      rows,
    },
    props: {},
    children: [],
  };
}

// ─── Notion API Helpers ─────────────────────────────────────────────────────

async function fetchAllBlocks(pageId: string): Promise<any[]> {
  const blocks: any[] = [];
  let cursor: string | undefined;
  do {
    const response = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });
    blocks.push(...response.results.filter((r: any) => "type" in r));
    cursor = response.has_more
      ? (response.next_cursor ?? undefined)
      : undefined;
  } while (cursor);
  return blocks;
}

async function fetchAllBlocksRecursive(pageId: string): Promise<any[]> {
  const topBlocks = await fetchAllBlocks(pageId);
  const result: any[] = [];

  for (const block of topBlocks) {
    result.push(block);
    if (block.has_children && !["child_page", "child_database"].includes(block.type)) {
      try {
        const children = await fetchAllBlocksRecursive(block.id);
        block._children = children;
      } catch {
        if (VERBOSE) console.log(`    Could not fetch children for block ${block.id}`);
      }
    }
  }
  return result;
}

function convertChildrenRecursive(children: any[]): any[] {
  const result: any[] = [];
  for (const child of children) {
    const converted = convertNotionBlock(child);
    if (!converted) continue;
    if (child._children?.length && child.type !== "table") {
      converted.children = convertChildrenRecursive(child._children);
    }
    result.push(converted);
  }
  return result;
}

function flattenBlocksToRows(
  blocks: any[],
  startPosition: number
): Array<{ type: string; content: any; position: number }> {
  const rows: Array<{ type: string; content: any; position: number }> = [];
  let pos = startPosition;

  for (const block of blocks) {
    if (block.type === "column_list" && block._children?.length) {
      for (const column of block._children) {
        if (column.type === "column" && column._children?.length) {
          for (const colChild of column._children) {
            const converted = convertNotionBlock(colChild);
            if (!converted) continue;
            if (colChild._children?.length && colChild.type !== "table") {
              converted.children = convertChildrenRecursive(colChild._children);
            }
            rows.push({ type: converted.type, content: converted, position: pos++ });
            stats.blocks++;
          }
        }
      }
      continue;
    }

    const converted = convertNotionBlock(block);
    if (!converted) continue;

    if (block._children?.length && block.type !== "table") {
      converted.children = convertChildrenRecursive(block._children);
    }

    rows.push({ type: converted.type, content: converted, position: pos++ });
    stats.blocks++;
  }
  return rows;
}

// ─── Property Type Mapping ──────────────────────────────────────────────────

function mapNotionPropertyType(notionType: string): string {
  const typeMap: Record<string, string> = {
    title: "text",
    rich_text: "text",
    number: "number",
    select: "select",
    multi_select: "multi_select",
    date: "date",
    checkbox: "checkbox",
    url: "url",
    email: "text",
    phone_number: "text",
    status: "select",
  };
  return typeMap[notionType] || "text";
}

// ─── Page Migration ─────────────────────────────────────────────────────────

const notionIdToMotionId = new Map<string, string>();

interface MigrationConfig {
  workspaceId: string;
  userId?: string;
}

async function migrateNotionPage(
  notionPage: any,
  config: MigrationConfig,
  parentMotionId: string | null = null
): Promise<string | null> {
  const titleProp = Object.values(notionPage.properties).find(
    (p: any) => p.type === "title"
  ) as any;
  const title =
    titleProp?.type === "title"
      ? richTextToString(titleProp.title)
      : "Untitled";
  const icon =
    notionPage.icon?.type === "emoji" ? notionPage.icon.emoji : null;
  const coverUrl =
    notionPage.cover?.type === "external"
      ? notionPage.cover.external?.url
      : notionPage.cover?.file?.url || null;

  if (DRY_RUN) {
    const indent = parentMotionId ? "    " : "  ";
    console.log(`${indent}[dry-run] Page: ${icon || ""} ${title}`);
    stats.pages++;
    return null;
  }

  const { data: page, error } = await supabase
    .from("pages")
    .insert({
      title,
      icon,
      cover_image: coverUrl,
      type: "PAGE",
      workspace_id: config.workspaceId,
      parent_id: parentMotionId,
      created_by: config.userId || null,
      position: stats.pages,
      is_private: false,
    })
    .select()
    .single();

  if (error || !page) {
    console.error(`  ✗ Failed to create page "${title}":`, error?.message);
    stats.errors++;
    return null;
  }

  notionIdToMotionId.set(notionPage.id, page.id);
  const indent = parentMotionId ? "    " : "  ";
  console.log(`${indent}✓ ${icon || ""} ${title} (${page.id})`);
  stats.pages++;

  if (parentMotionId) {
    const { data: parentPage } = await supabase
      .from("pages")
      .select("id, type")
      .eq("id", parentMotionId)
      .single();
    if (parentPage?.type === "DATABASE") {
      const { data: props } = await supabase
        .from("database_properties")
        .select("id")
        .eq("page_id", parentMotionId)
        .order("position", { ascending: true })
        .limit(1);
      const { data: existingRows } = await supabase
        .from("database_rows")
        .select("id")
        .eq("page_id", parentMotionId);
      const rowPos = existingRows?.length || 0;
      const { data: row } = await supabase
        .from("database_rows")
        .insert({ page_id: parentMotionId, position: rowPos })
        .select()
        .single();
      if (row && props?.[0]) {
        await supabase
          .from("cell_values")
          .insert({ row_id: row.id, property_id: props[0].id, value: title });
      }
    }
  }

  try {
    const blocks = await fetchAllBlocksRecursive(notionPage.id);
    const blockRows = flattenBlocksToRows(blocks, 0);

    if (blockRows.length > 0) {
      const { error: blockError } = await supabase
        .from("blocks")
        .insert(blockRows.map((b) => ({ ...b, page_id: page.id })));
      if (blockError) {
        console.error(`  ✗ Blocks failed for "${title}":`, blockError.message);
      }
    }

    const childPages = blocks.filter((b) => b.type === "child_page");
    for (const child of childPages) {
      try {
        const childPage = await notion.pages.retrieve({ page_id: child.id });
        if ("properties" in childPage) {
          await migrateNotionPage(childPage, config, page.id);
        }
      } catch {
        if (VERBOSE) console.log(`    Could not fetch child page ${child.id}`);
      }
    }
  } catch (err: any) {
    console.error(`  ✗ Block migration failed for "${title}":`, err.message);
    stats.errors++;
  }

  return page.id;
}

// ─── Database Migration ─────────────────────────────────────────────────────

async function migrateNotionDatabase(
  notionDb: any,
  config: MigrationConfig
): Promise<string | null> {
  const title = richTextToString(notionDb.title) || "Untitled Database";
  const icon =
    notionDb.icon?.type === "emoji" ? notionDb.icon.emoji : null;

  if (DRY_RUN) {
    console.log(`  [dry-run] Database: ${icon || ""} ${title}`);
    stats.databases++;
    return null;
  }

  const { data: page, error } = await supabase
    .from("pages")
    .insert({
      title,
      icon,
      type: "DATABASE",
      workspace_id: config.workspaceId,
      created_by: config.userId || null,
      position: stats.databases,
      is_private: false,
    })
    .select()
    .single();

  if (error || !page) {
    console.error(`  ✗ Failed to create database "${title}":`, error?.message);
    stats.errors++;
    return null;
  }

  notionIdToMotionId.set(notionDb.id, page.id);
  console.log(`  ✓ ${icon || "🗄"} ${title} (${page.id})`);
  stats.databases++;

  const propertyMap = new Map<string, string>();
  let pos = 0;
  for (const [name, prop] of Object.entries(notionDb.properties) as any[]) {
    const mappedType = mapNotionPropertyType(prop.type);
    let options = null;

    if (prop.type === "select" && prop.select?.options) {
      options = {
        options: prop.select.options.map((o: any) => ({
          value: o.name,
          color: o.color || "gray",
        })),
      };
    } else if (prop.type === "multi_select" && prop.multi_select?.options) {
      options = {
        options: prop.multi_select.options.map((o: any) => ({
          value: o.name,
          color: o.color || "gray",
        })),
      };
    } else if (prop.type === "status" && prop.status?.options) {
      options = {
        options: prop.status.options.map((o: any) => ({
          value: o.name,
          color: o.color || "gray",
        })),
      };
    }

    const { data: dbProp } = await supabase
      .from("database_properties")
      .insert({
        name,
        type: mappedType,
        options,
        position: pos++,
        page_id: page.id,
      })
      .select()
      .single();
    if (dbProp) propertyMap.set(prop.id, dbProp.id);
  }

  let cursor: string | undefined;
  let rowPos = 0;
  do {
    const response = await notion.dataSources.query({
      data_source_id: notionDb.id,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const item of response.results) {
      if (!("properties" in item)) continue;
      const notionRow = item as any;

      const { data: row } = await supabase
        .from("database_rows")
        .insert({ page_id: page.id, position: rowPos++ })
        .select()
        .single();
      if (!row) continue;
      stats.rows++;

      for (const [, prop] of Object.entries(notionRow.properties) as any[]) {
        const dbPropId = propertyMap.get(prop.id);
        if (!dbPropId) continue;

        let value: unknown = null;
        switch (prop.type) {
          case "title":
            value = richTextToString(prop.title);
            break;
          case "rich_text":
            value = richTextToString(prop.rich_text);
            break;
          case "number":
            value = prop.number;
            break;
          case "select":
            value = prop.select?.name || null;
            break;
          case "multi_select":
            value = (prop.multi_select || [])
              .map((s: any) => s.name)
              .join(", ");
            break;
          case "date":
            value = prop.date?.start || null;
            break;
          case "checkbox":
            value = prop.checkbox;
            break;
          case "url":
            value = prop.url;
            break;
          case "email":
            value = prop.email;
            break;
          case "status":
            value = prop.status?.name || null;
            break;
        }

        if (value !== null && value !== undefined) {
          await supabase
            .from("cell_values")
            .insert({ property_id: dbPropId, row_id: row.id, value });
        }
      }
    }

    cursor = response.has_more
      ? (response.next_cursor ?? undefined)
      : undefined;
  } while (cursor);

  return page.id;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const workspaceId = args[0];

  if (!workspaceId) {
    console.error(
      "Usage: npm run notion:migrate -- <workspaceId> [--dry-run] [--verbose]\n\n" +
        "  workspaceId   Your Motion workspace UUID (from the URL or database)\n" +
        "  --dry-run     Preview what would be imported without writing anything\n" +
        "  --verbose     Show extra detail (skipped blocks, etc.)\n\n" +
        "Required env vars: NOTION_API_KEY, SUPABASE_URL, SUPABASE_KEY\n\n" +
        "To get a Notion API key:\n" +
        "  1. Go to https://www.notion.so/my-integrations\n" +
        "  2. Create an internal integration\n" +
        "  3. Copy the secret and set NOTION_API_KEY in .env\n" +
        "  4. Share each Notion page/database with the integration"
    );
    process.exit(1);
  }

  if (!process.env.NOTION_API_KEY) {
    console.error(
      "Error: NOTION_API_KEY is not set in your environment.\n" +
        "Add it to your .env file or export it before running."
    );
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("🔍 DRY RUN — nothing will be written to the database\n");
  }

  console.log(`Migrating Notion → Motion (workspace: ${workspaceId})\n`);

  // Resolve a workspace admin to use as created_by so pages have a valid owner
  const { data: adminMember } = await supabase
    .from("members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("role", "ADMIN")
    .limit(1)
    .single();

  if (!adminMember && !DRY_RUN) {
    console.error(
      "Error: No ADMIN member found in this workspace.\n" +
        "Migrated pages need a valid created_by user. Add a member first."
    );
    process.exit(1);
  }

  const userId = adminMember?.user_id || undefined;
  if (userId) {
    console.log(`Using workspace admin (${userId}) as page owner\n`);
  }

  const config: MigrationConfig = { workspaceId, userId };

  // Fetch and migrate databases (now called "data_source" in Notion API v5)
  console.log("── Databases ──");
  let cursor: string | undefined;
  const allDatabases: any[] = [];
  do {
    const r = await notion.search({
      filter: { property: "object", value: "data_source" },
      start_cursor: cursor,
      page_size: 100,
    });
    allDatabases.push(
      ...r.results.filter(
        (x: any) => x.object === "data_source" && !(x as any).is_inline
      )
    );
    cursor = r.has_more ? (r.next_cursor ?? undefined) : undefined;
  } while (cursor);

  console.log(`Found ${allDatabases.length} top-level databases\n`);
  for (const db of allDatabases) {
    try {
      await migrateNotionDatabase(db, config);
    } catch (err: any) {
      console.error(`  ✗ Database failed:`, err.message);
      stats.errors++;
    }
  }

  // Fetch and migrate standalone pages (not inside databases)
  console.log("\n── Pages ──");
  cursor = undefined;
  const allPages: any[] = [];
  do {
    const r = await notion.search({
      filter: { property: "object", value: "page" },
      start_cursor: cursor,
      page_size: 100,
    });
    allPages.push(...r.results.filter((x: any) => "properties" in x));
    cursor = r.has_more ? (r.next_cursor ?? undefined) : undefined;
  } while (cursor);

  const standalone = allPages.filter(
    (p: any) => p.parent?.type !== "data_source_id"
  );
  console.log(`Found ${standalone.length} standalone pages\n`);

  for (const page of standalone) {
    if (notionIdToMotionId.has(page.id)) continue;
    try {
      await migrateNotionPage(page, config);
    } catch (err: any) {
      console.error(`  ✗ Page failed:`, err.message);
      stats.errors++;
    }
  }

  // Summary
  console.log("\n── Summary ──");
  console.log(`  Pages:     ${stats.pages}`);
  console.log(`  Databases: ${stats.databases}`);
  console.log(`  Blocks:    ${stats.blocks}`);
  console.log(`  DB Rows:   ${stats.rows}`);
  if (stats.skipped) console.log(`  Skipped:   ${stats.skipped} blocks`);
  if (stats.errors) console.log(`  Errors:    ${stats.errors}`);
  console.log(DRY_RUN ? "\n✅ Dry run complete." : "\n✅ Migration complete!");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
