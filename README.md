# Motion

An open-source, self-hostable workspace app inspired by Notion. Built with Next.js.

## Features

- **Rich text editor** — Block-based editor with slash commands, headings, lists, todos, code blocks, and more
- **Databases** — Spreadsheet-style tables with sortable/filterable columns and inline editing
- **Kanban boards** — Drag-and-drop cards grouped by status
- **Templates** — Save and reuse page/database templates
- **Team permissions** — Admin, Editor, and Viewer roles with invite system
- **Page sharing** — Share pages with specific members or invite external guests via link
- **Comments** — Inline comments with quote highlighting and resolution
- **Page history** — Track changes with full edit history
- **Search** — Quick Cmd+K search across all pages
- **Dark mode** — Toggle between light and dark themes
- **AI assist** — Generate and edit text with OpenAI (optional)
- **CLI** — Full-featured command-line interface for scripting and bulk operations

## Tech Stack

- **Next.js 16** (App Router, TypeScript)
- **PostgreSQL** via Supabase
- **NextAuth.js** for authentication (Google OAuth)
- **BlockNote** for the block editor
- **Tailwind CSS** + shadcn/ui
- **TanStack React Query** + Zustand

## Getting Started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier works)
- Google OAuth credentials ([console.cloud.google.com](https://console.cloud.google.com))

### Setup

```bash
# Install dependencies
npm install

# Copy env file and configure
cp .env.example .env
# Edit .env with your Supabase URL/key, Google OAuth credentials, and auth secret

# Run database migrations
# Copy each file from supabase/migrations/ into the Supabase SQL Editor and run in order

# Start development server
npm run dev
```

### Database Setup

Motion uses Supabase (PostgreSQL) with SQL migrations. Run the migration files in order from `supabase/migrations/` in the Supabase SQL Editor:

1. `001_create_tables.sql` — Core tables (users, workspaces, members, pages, blocks, databases, templates)
2. `002_add_private_pages.sql` — Private pages support
3. `003_create_page_history.sql` — Page history tracking
4. `004_create_notifications.sql` — Notifications
5. `005_create_comments.sql` — Comments
6. `006_add_row_archive.sql` — Database row archiving
7. `007_create_page_shares.sql` — Page sharing

After running migrations, create your first workspace directly in Supabase or via the CLI.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_KEY` | Yes | Supabase service role key |
| `AUTH_SECRET` | Yes | Random secret for NextAuth.js session encryption |
| `NEXTAUTH_URL` | Yes | Your app URL (e.g. `http://localhost:3000`) |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `OPENAI_API_KEY` | No | Enables AI text generation/editing |
| `API_SECRET_KEY` | No | Bearer token for external `/api/v1/*` access |
| `DEFAULT_WORKSPACE_ID` | No | Auto-join new users to this workspace on sign-up |

### Notion Migration

To import your existing Notion content:

1. Create a Notion integration at [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Share your Notion pages/databases with the integration
3. Add your Notion API key to `.env` as `NOTION_API_KEY`
4. Run: `npm run notion:migrate <workspaceId>`

### Deploy to Render

1. Push this repo to GitHub
2. Create a new **Blueprint** on Render, pointing to this repo
3. Render will use `render.yaml` to set up the web service
4. Set `NEXTAUTH_URL` to your Render app URL

## CLI

A full-featured command-line interface that mirrors the web UI. Useful for scripting, bulk operations, and working without a browser.

### Setup

The CLI reads credentials from your `.env` file automatically. You just need to identify yourself:

```bash
# Option A: pass your email each time
npm run cli -- -u you@example.com workspace list

# Option B: set it once in your shell
export MOTION_USER_EMAIL=you@example.com
npm run cli -- workspace list
```

You can also pin a default workspace:

```bash
export MOTION_WORKSPACE_ID=your-workspace-uuid
```

### Commands

Run `npm run cli -- --help` or `npm run cli -- <command> --help` for full usage details.

#### Workspaces

```bash
npm run cli -- workspace list
```

#### Pages

```bash
npm run cli -- page list                         # list root pages
npm run cli -- page list -p <parentId>           # list child pages
npm run cli -- page get <pageId>                 # page details, blocks, children
npm run cli -- page create -t "My Page"          # create a page
npm run cli -- page create -t "Tasks" --type DATABASE --view-mode table
npm run cli -- page update <pageId> --title "New Title" --icon "🚀"
npm run cli -- page delete <pageId>              # move to trash
npm run cli -- page delete <pageId> --permanent  # permanent delete (admin)
npm run cli -- page restore <pageId>             # restore from trash
npm run cli -- page lock <pageId>                # lock page (admin)
npm run cli -- page unlock <pageId>              # unlock page (admin)
npm run cli -- page favorite <pageId>            # toggle favorite
npm run cli -- page move <pageId> --parent <id>  # move under another page
npm run cli -- page search "query"               # search by title
```

#### Databases

```bash
npm run cli -- db props <pageId>                 # list properties (columns)
npm run cli -- db add-prop <pageId> -n "Priority" --type select \
  --options '{"options":[{"value":"High","color":"red"}]}'
npm run cli -- db update-prop <pageId> --id <propId> -n "Renamed"
npm run cli -- db delete-prop <pageId> --id <propId>

npm run cli -- db rows <pageId>                  # list rows as a table
npm run cli -- db add-row <pageId> -c '[{"propertyId":"...","value":"Task 1"}]'
npm run cli -- db delete-row <pageId> --row <rowId>
npm run cli -- db set-cell <pageId> --property <propId> --row <rowId> --value "Done"
```

#### Blocks

```bash
npm run cli -- block list <pageId>               # list blocks
npm run cli -- block save <pageId> -b '<json>'   # replace all blocks (also accepts stdin)
```

#### Templates

```bash
npm run cli -- template list
npm run cli -- template create -t "Meeting Notes" --from-page <pageId>
npm run cli -- template update --id <id> -t "Renamed"
npm run cli -- template delete --id <id>
```

#### Members

```bash
npm run cli -- member list
npm run cli -- member invite -e new@example.com -r EDITOR
npm run cli -- member update-role --id <memberId> -r ADMIN
npm run cli -- member remove --id <memberId>
```

#### Sharing & Guests

```bash
npm run cli -- share list <pageId>
npm run cli -- share add <pageId> --user-id <userId> --permission EDITOR
npm run cli -- share update <pageId> --share <shareId> --permission VIEWER
npm run cli -- share remove <pageId> --share <shareId>

npm run cli -- guest list <pageId>
npm run cli -- guest invite <pageId> -e external@example.com
npm run cli -- guest remove <pageId> --guest <guestId>
```

#### Comments

```bash
npm run cli -- comment list <pageId>
npm run cli -- comment add <pageId> -c "Looks good!" -q "quoted text"
npm run cli -- comment resolve <pageId> --comment <commentId>
```

#### Notifications

```bash
npm run cli -- notif list
npm run cli -- notif read <notificationId>
npm run cli -- notif read-all
```

#### Profile

```bash
npm run cli -- profile get
npm run cli -- profile update -n "New Name"
```

#### Trash

```bash
npm run cli -- trash list
npm run cli -- trash empty                       # permanent delete all (admin)
```

#### History

```bash
npm run cli -- history list <pageId>
npm run cli -- history list <pageId> -l 50 -o 0  # paginate
```

#### AI

```bash
npm run cli -- ai generate -p "Write a project brief for..."
npm run cli -- ai edit --text "Draft text here" -p "Make it more concise"
```

### JSON output

Append `--json` to any command to get raw JSON instead of formatted tables:

```bash
npm run cli -- --json page list | jq '.[].title'
npm run cli -- --json db rows <pageId> | jq '.rows | length'
```

### CLI Environment Variables

| Variable | Description |
|----------|-------------|
| `MOTION_USER_EMAIL` | Your email (avoids passing `--user` every time) |
| `MOTION_WORKSPACE_ID` | Default workspace ID (avoids passing `--workspace`) |

The CLI also reads `SUPABASE_URL`, `SUPABASE_KEY`, and `OPENAI_API_KEY` from `.env` for database access and AI features.

## License

[MIT](LICENSE)
