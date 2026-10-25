import type { SupabaseClient } from "@supabase/supabase-js";

/** The DB derives the user and verified email; never send role or plan. */
export async function saveMyProfile(client: SupabaseClient, displayName: string) {
  const { error } = await client.rpc("save_my_profile", { p_display_name: displayName.trim() || "ユーザー" });
  if (error) throw new Error("プロフィールを保存できませんでした。");
}

export async function notifyShoppingInvitation(client: SupabaseClient, inviteId: string) {
  const { data: { session }, error } = await client.auth.getSession();
  if (error || !session?.access_token) throw new Error("ログインし直してください。");
  const response = await fetch("/api/group-invitations/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ inviteId }),
  });
  if (!response.ok) throw new Error("招待は登録されましたが、メールを送信できませんでした。再送してください。");
}

/** Only remove unambiguous local public URLs; Storage RLS checks references. */
export async function removeStoredImage(client: SupabaseClient, bucket: "item-images" | "recipe-images", imageUrl: string | null) {
  if (!imageUrl) return { imageRetained: false };
  if (!/[a-z0-9/%?:#\\]/i.test(imageUrl)) return { imageRetained: false };
  const prefix = client.storage.from(bucket).getPublicUrl("").data.publicUrl;
  if (!imageUrl.startsWith(prefix)) return { imageRetained: true };
  const path = imageUrl.slice(prefix.length);
  // Keep encoded/legacy names rather than risk removing a different object.
  if (!path || /[%?#\\\s]/.test(path) || path.split("/").some(part => !part || part === "." || part === "..")) return { imageRetained: true };
  try {
    const result = await client.storage.from(bucket).remove([path]);
    return { imageRetained: Boolean(result.error) || result.data?.length !== 1 };
  } catch { return { imageRetained: true }; }
}

/** Delete the owned row first; FK/RLS failure must leave its image untouched. */
export async function deleteOwnedMasterItem(client: SupabaseClient, id: number) {
  const { data, error } = await client.from("user_item_master").delete().eq("id", id).select("id,image_url");
  if (error || data?.length !== 1) throw new Error("商品を削除できませんでした。レシピでの使用状況や権限を確認してください。");
  return removeStoredImage(client, "item-images", data[0].image_url as string | null);
}
