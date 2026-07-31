export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(run(env));
  },
  async fetch(_request, env) {
    const result = await run(env);
    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  }
};

async function run(env) {
  const site = String(env.FSRP_SITE_URL || "").replace(/\/$/, "");
  const token = String(env.WATCHDOG_CRON_TOKEN || "").trim();
  if (!site || !token) throw new Error("FSRP_SITE_URL and WATCHDOG_CRON_TOKEN are required.");
  const response = await fetch(`${site}/api/command-suite`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-watchdog-token": token },
    body: JSON.stringify({ action: "watchdog-cron" })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Watchdog scan failed (${response.status}).`);
  return { ok: true, alerts: data.newAlerts?.length || 0, autoActions: data.autoActions?.length || 0, scannedAt: new Date().toISOString() };
}
