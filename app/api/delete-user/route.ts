// Firewall denial remains required. Defense in depth if a different hostname
// or deployment reaches the application: do not instantiate any DB client.
export async function POST() {
  return Response.json({ success: false, error: "退会機能は安全性確認のため停止中です。お問い合わせください。" }, {
    status: 503,
    headers: { "Cache-Control": "no-store", "Retry-After": "86400" },
  });
}
