/* eslint-disable @typescript-eslint/no-explicit-any */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { Client } from "@notionhq/client";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
const notion = new Client({ auth: process.env.NOTION_API_KEY });

const WORKSPACE_ID = process.argv[2];
const NOTION_IDS = process.argv.slice(3);

if (!WORKSPACE_ID || NOTION_IDS.length === 0) {
  console.error("Usage: npx tsx src/scripts/import-pages.ts <workspaceId> <notionPageId1> [notionPageId2] ...");
  process.exit(1);
}

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
      result.push({ type: "link" as const, href, content: [{ type: "text" as const, text, styles }] });
    } else {
      result.push({ type: "text" as const, text, styles });
    }
  }
  return result;
}

function richTextToString(richText: any[]): string {
  return (richText || []).map((t: any) => t.plain_text).join("").replace(/\n/g, " ").trim();
}

function notionColorToBlockNote(color?: string): Record<string, string> {
  if (!color || color === "default") return {};
  if (color.endsWith("_background")) return { backgroundColor: color.replace("_background", "") };
  return { textColor: color };
}

function convertNotionBlock(block: any): any | null {
  const type = block.type;
  const data = block[type];
  if (!data) return null;
  switch (type) {
    case "paragraph":
      return { id: block.id, type: "paragraph", content: convertRichText(data.rich_text), props: { ...notionColorToBlockNote(data.color) }, children: [] };
    case "heading_1":
    case "heading_2":
    case "heading_3": {
      const level = type === "heading_1" ? 1 : type === "heading_2" ? 2 : 3;
      return { id: block.id, type: "heading", content: convertRichText(data.rich_text), props: { level, ...notionColorToBlockNote(data.color) }, children: [] };
    }
    case "bulleted_list_item":
    case "toggle":
      return { id: block.id, type: "bulletListItem", content: convertRichText(data.rich_text), props: { ...notionColorToBlockNote(data.color) }, children: [] };
    case "numbered_list_item":
      return { id: block.id, type: "numberedListItem", content: convertRichText(data.rich_text), props: { ...notionColorToBlockNote(data.color) }, children: [] };
    case "to_do":
      return { id: block.id, type: "checkListItem", content: convertRichText(data.rich_text), props: { checked: data.checked ?? false }, children: [] };
    case "code":
      return { id: block.id, type: "codeBlock", props: { language: data.language || "plain" }, content: convertRichText(data.rich_text), children: [] };
    case "quote":
    case "callout":
      return { id: block.id, type: "paragraph", content: convertRichText(data.rich_text), props: { ...notionColorToBlockNote(data.color) }, children: [] };
    case "divider":
      return { id: block.id, type: "paragraph", content: [{ type: "text" as const, text: "───", styles: {} }], props: {}, children: [] };
    case "image": {
      const url = data.type === "external" ? data.external?.url : data.file?.url;
      if (!url) return null;
      return { id: block.id, type: "image", props: { url, caption: data.caption ? richTextToString(data.caption) : "", width: 512 }, children: [] };
    }
    case "video": {
      const url = data.type === "external" ? data.external?.url : data.file?.url;
      if (!url) return null;
      return { id: block.id, type: "paragraph", content: [{ type: "link" as const, href: url, content: [{ type: "text" as const, text: url, styles: {} }] }], props: {}, children: [] };
    }
    case "bookmark":
    case "embed":
    case "link_preview": {
      const url = data.url || data.external?.url || "";
      const caption = data.caption ? richTextToString(data.caption) : url;
      return { id: block.id, type: "paragraph", content: [{ type: "link" as const, href: url, content: [{ type: "text" as const, text: caption || url, styles: {} }] }], props: {}, children: [] };
    }
    case "table":
      return convertTableBlock(block);
    default:
      return null;
  }
}

function convertTableBlock(block: any): any | null {
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
  return { id: block.id, type: "table", content: { type: "tableContent", rows }, props: {}, children: [] };
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

async function fetchAllBlocksRecursive(pageId: string): Promise<any[]> {
  const blocks: any[] = [];
  let cursor: string | undefined;
  do {
    const response = await notion.blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 100 });
    blocks.push(...response.results.filter((r: any) => "type" in r));
    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  for (const block of blocks) {
    if ((block as any).has_children && !["child_page", "child_database"].includes((block as any).type)) {
      try {
        (block as any)._children = await fetchAllBlocksRecursive(block.id);
      } catch { /* skip */ }
    }
  }
  return blocks;
}

function flattenBlocksToRows(blocks: any[]): Array<{ type: string; content: any; position: number }> {
  const rows: Array<{ type: string; content: any; position: number }> = [];
  let pos = 0;
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
  }
  return rows;
}

let totalPages = 0;
let totalBlocks = 0;

async function importPage(notionPageId: string, parentMotionId: string | null, ownerId: string, depth: number = 0): Promise<string | null> {
  const notionPage = await notion.pages.retrieve({ page_id: notionPageId }) as any;
  const titleProp = Object.values(notionPage.properties).find((p: any) => p.type === "title") as any;
  const title = titleProp?.title?.map((t: any) => t.plain_text).join("") || "Untitled";
  const icon = notionPage.icon?.type === "emoji" ? notionPage.icon.emoji : null;
  const coverUrl = notionPage.cover?.type === "external" ? notionPage.cover.external?.url : notionPage.cover?.file?.url || null;

  const { data: page, error } = await supabase
    .from("pages")
    .insert({
      title, icon, cover_image: coverUrl, type: "PAGE",
      workspace_id: WORKSPACE_ID, parent_id: parentMotionId,
      created_by: ownerId, position: 0, is_private: false,
    })
    .select()
    .single();

  if (error || !page) {
    console.error(`${"  ".repeat(depth)}  Failed to create "${title}":`, error?.message);
    return null;
  }

  totalPages++;
  console.log(`${"  ".repeat(depth)}✓ ${icon || ""} ${title} (${page.id})`);

  if (parentMotionId) {
    const { data: parentPage } = await supabase.from("pages").select("id, type").eq("id", parentMotionId).single();
    if (parentPage?.type === "DATABASE") {
      const { data: props } = await supabase.from("database_properties").select("id").eq("page_id", parentMotionId).order("position", { ascending: true }).limit(1);
      const { data: existingRows } = await supabase.from("database_rows").select("id").eq("page_id", parentMotionId);
      const rowPos = existingRows?.length || 0;
      const { data: row } = await supabase.from("database_rows").insert({ page_id: parentMotionId, position: rowPos }).select().single();
      if (row && props?.[0]) {
        await supabase.from("cell_values").insert({ row_id: row.id, property_id: props[0].id, value: title });
        console.log(`${"  ".repeat(depth)}  + database row`);
      }
    }
  }

  const blocks = await fetchAllBlocksRecursive(notionPageId);
  const blockRows = flattenBlocksToRows(blocks);
  if (blockRows.length > 0) {
    const { error: blockError } = await supabase.from("blocks").insert(blockRows.map((b) => ({ ...b, page_id: page.id })));
    if (blockError) console.error(`${"  ".repeat(depth)}  Blocks failed:`, blockError.message);
    else { totalBlocks += blockRows.length; console.log(`${"  ".repeat(depth)}  + ${blockRows.length} blocks`); }
  }

  const childPages = blocks.filter((b) => b.type === "child_page");
  for (const child of childPages) {
    try {
      await importPage(child.id, page.id, ownerId, depth + 1);
    } catch (err: any) {
      console.log(`${"  ".repeat(depth)}  Could not import child ${child.id}: ${err.message}`);
    }
  }

  return page.id;
}

async function main() {
  const { data: admin } = await supabase
    .from("members")
    .select("user_id")
    .eq("workspace_id", WORKSPACE_ID)
    .eq("role", "ADMIN")
    .limit(1)
    .single();

  if (!admin) {
    console.error("No ADMIN member found in workspace", WORKSPACE_ID);
    process.exit(1);
  }

  console.log(`Importing ${NOTION_IDS.length} pages into workspace ${WORKSPACE_ID}\n`);
  console.log(`Owner: ${admin.user_id}\n`);

  for (const notionId of NOTION_IDS) {
    try {
      await importPage(notionId, null, admin.user_id);
      console.log();
    } catch (err: any) {
      console.error(`Failed to import ${notionId}:`, err.message);
    }
  }

  console.log(`Done! ${totalPages} pages, ${totalBlocks} blocks imported.`);
}

main().catch(console.error);
