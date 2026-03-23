import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createHash } from "crypto";
import { rateLimit } from "@/lib/rate-limit";

export interface ApiAuthContext {
  workspaceId: string;
}

export function getApiKey(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

async function validateWorkspaceApiKey(
  key: string,
  workspaceId: string
): Promise<boolean> {
  // Check per-workspace API keys (gracefully handles missing table during migration)
  try {
    const hash = hashKey(key);
    const { data, error } = await supabase
      .from("api_keys")
      .select("id")
      .eq("key_hash", hash)
      .eq("workspace_id", workspaceId)
      .is("revoked_at", null)
      .limit(1)
      .single();

    if (!error && data) {
      supabase
        .from("api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", data.id)
        .then(() => {});
      return true;
    }
  } catch {
    // api_keys table may not exist yet; fall through to legacy check
  }

  // Fallback: accept the legacy global key during migration period
  const secret = process.env.API_SECRET_KEY;
  if (secret && key === secret) return true;

  return false;
}

export async function authenticateApiRequest(
  request: Request,
  { requireWorkspace = true }: { requireWorkspace?: boolean } = {}
): Promise<
  | { ok: true; workspaceId: string }
  | { ok: false; response: NextResponse }
> {
  const rateLimited = rateLimit(request, "api-v1", { limit: 60, windowSeconds: 60 });
  if (rateLimited) {
    return { ok: false as const, response: rateLimited };
  }

  const key = getApiKey(request);
  if (!key) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid or missing API key" },
        { status: 401 }
      ),
    };
  }

  if (!requireWorkspace) {
    // Even without requireWorkspace, we still need a workspaceId for scoping
    // Try to get it from the request
    const body = await request.clone().json().catch(() => ({}));
    const workspaceId =
      body.workspaceId ||
      new URL(request.url).searchParams.get("workspaceId");

    if (!workspaceId) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "workspaceId is required" },
          { status: 400 }
        ),
      };
    }

    if (!(await validateWorkspaceApiKey(key, workspaceId))) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Invalid or missing API key" },
          { status: 401 }
        ),
      };
    }

    return { ok: true, workspaceId };
  }

  const body = await request.clone().json().catch(() => ({}));
  const workspaceId =
    body.workspaceId ||
    new URL(request.url).searchParams.get("workspaceId");

  if (!workspaceId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      ),
    };
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .single();

  if (!workspace) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      ),
    };
  }

  if (!(await validateWorkspaceApiKey(key, workspaceId))) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid or missing API key" },
        { status: 401 }
      ),
    };
  }

  return { ok: true, workspaceId };
}
