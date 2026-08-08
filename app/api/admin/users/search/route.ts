import { NextResponse } from "next/server";
import { getDbClient } from "@/lib/db/client";
import { getSessionState } from "@/lib/session";

export const runtime = "nodejs";

function normalizeLimit(value: string | null) {
  return Math.max(1, Math.min(20, Number(value || 8) || 8));
}

export async function GET(request: Request) {
  const session = await getSessionState();
  if (!session.isAdminAuthenticated) {
    return NextResponse.json({ ok: false, error: "Admin authentication required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("query") ?? "").trim();
  const limit = normalizeLimit(url.searchParams.get("limit"));
  const db = getDbClient();

  const result = query
    ? await db.execute({
        sql: `select users.id, users.username, users.email, users.name
              from users
              left join profiles on profiles.user_id = users.id
              where users.is_deleted = 0
                and (users.id like ? or users.username like ? or users.email like ? or users.name like ?)
              order by profiles.role = 'admin' asc, users.created_at desc
              limit ?`,
        args: [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, limit],
      })
    : await db.execute({
        sql: `select users.id, users.username, users.email, users.name
              from users
              left join profiles on profiles.user_id = users.id
              where users.is_deleted = 0
              order by profiles.role = 'admin' asc, users.created_at desc
              limit ?`,
        args: [limit],
      });

  return NextResponse.json({
    ok: true,
    users: result.rows.map((row) => ({
      id: String(row.id),
      username: String(row.username),
      email: String(row.email),
      name: String(row.name),
    })),
  });
}
