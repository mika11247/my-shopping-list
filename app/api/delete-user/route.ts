import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const body = await req.json();
  const userId = body.userId;

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // データ削除
  await supabaseAdmin.from("shopping_items").delete().eq("user_id", userId);
  await supabaseAdmin.from("user_item_master").delete().eq("user_id", userId);
  await supabaseAdmin.from("deleted_items").delete().eq("user_id", userId);

  // ユーザー削除
  await supabaseAdmin.auth.admin.deleteUser(userId);

  return new Response(JSON.stringify({ success: true }), { status: 200 });
}