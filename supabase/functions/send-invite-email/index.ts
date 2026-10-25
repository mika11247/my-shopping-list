// Retirement handler. Keep this endpoint disabled when migrating clients.
Deno.serve(() => new Response(JSON.stringify({ error: "Invitation endpoint retired" }), {
  status: 410,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
}));
