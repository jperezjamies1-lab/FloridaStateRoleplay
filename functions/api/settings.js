export async function onRequest(context) {
  const { request, env } = context;
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type,x-admin-token",
    "access-control-allow-methods": "GET,PUT,OPTIONS"
  };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (!env.SITE_SETTINGS) return json({ error: "SITE_SETTINGS KV binding is missing" }, 500, headers);
  if (request.method === "GET") {
    const settings = await env.SITE_SETTINGS.get("live", { type: "json" }) || {};
    return json({ ok: true, settings }, 200, headers);
  }
  if (request.method === "PUT") {
    const supplied = request.headers.get("x-admin-token") || "";
    if (!env.ADMIN_TOKEN || supplied !== env.ADMIN_TOKEN) return json({ error: "Unauthorized" }, 401, headers);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400, headers); }
    if (!body || typeof body.settings !== "object" || Array.isArray(body.settings)) return json({ error: "Invalid settings" }, 400, headers);
    const serialized = JSON.stringify(body.settings);
    if (serialized.length > 500000) return json({ error: "Settings too large" }, 413, headers);
    await env.SITE_SETTINGS.put("live", serialized);
    return json({ ok: true, updatedAt: new Date().toISOString() }, 200, headers);
  }
  return json({ error: "Method not allowed" }, 405, headers);
}
function json(value, status, headers) { return new Response(JSON.stringify(value), { status, headers }); }
