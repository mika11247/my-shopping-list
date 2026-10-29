import type { SupabaseClient } from "@supabase/supabase-js";
import { getLimitByPlan } from "./planLimits";

export type MyItem = {
  id: number; user_id: string; name: string; yomi: string | null;
  category: string | null; image_url: string | null;
};
export type MyItemDraft = { name: string; yomi?: string; category?: string; image_url?: string };
export type MyItemCapacity = { count: number; limit: number; plan: string; userId: string };

export function normalizeMyItem(draft: MyItemDraft) {
  const name = draft.name.trim();
  if (!name) throw new Error("アイテム名を入力してください。");
  return {
    name,
    yomi: draft.yomi?.trim() || name.replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)),
    category: draft.category?.trim() || "その他",
    image_url: draft.image_url?.trim() || "🛒",
  };
}

export function myItemError(error: unknown): string {
  const e = error as { code?: string; message?: string };
  if (e?.code === "23514" && e.message?.includes("MY_ITEMS_LIMIT")) {
    return "My Itemsの登録上限に達しました。不要なアイテムを整理するか、プランをご確認ください。";
  }
  if (e?.code === "23505") return "このアイテムはすでにMy Itemsに登録されています。";
  if (e?.code === "42501" || e?.code === "PGRST301") return "登録権限を確認できません。ログインし直してください。";
  return error instanceof Error ? error.message : "My Itemsを保存できませんでした。入力を残しているので、再試行してください。";
}

export async function getMyItemCapacity(client: SupabaseClient, expectedUserId: string): Promise<MyItemCapacity> {
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user || auth.user.id !== expectedUserId) throw new Error("ログインし直してください。");
  const [profile, count] = await Promise.all([
    client.from("profiles").select("role,plan").eq("user_id", auth.user.id).single(),
    client.from("user_item_master").select("id", { count: "exact", head: true }).eq("user_id", auth.user.id),
  ]);
  if (profile.error || !profile.data || count.error || count.count === null) {
    throw new Error("登録上限を確認できませんでした。再読み込みしてからお試しください。");
  }
  return { count: count.count, limit: getLimitByPlan(profile.data.role ?? "user", profile.data.plan ?? "free", "master"),
    plan: profile.data.plan ?? "free", userId: auth.user.id };
}

export async function createMyItem(client: SupabaseClient, userId: string, draft: MyItemDraft): Promise<MyItem> {
  const normalized = normalizeMyItem(draft);
  const capacity = await getMyItemCapacity(client, userId);
  if (capacity.count >= capacity.limit) throw new Error(`My Itemsは${capacity.limit}件まで登録できます。不要なアイテムを整理するか、プランをご確認ください。`);
  // INSERT only: registration must never overwrite an existing item's details.
  // The database trigger enforces capacity even when this preflight becomes stale.
  const { data, error } = await client.from("user_item_master")
    .insert({ ...normalized, user_id: capacity.userId }).select("id,user_id,name,yomi,category,image_url").single();
  if (error) throw new Error(myItemError(error));
  if (!data) throw new Error("登録結果を確認できませんでした。一覧を確認してください。");
  return data as MyItem;
}

// A new upload is never allowed to overwrite an existing/shared image.
// Do not delete images on cancel or failure; existing Storage reference guards stay authoritative.
export async function uploadMyItemImage(client: SupabaseClient, userId: string, file: File) {
  const capacity = await getMyItemCapacity(client, userId);
  if (capacity.count >= capacity.limit) throw new Error(`My Itemsは${capacity.limit}件まで登録できます。`);
  if (capacity.plan !== "pro" && capacity.plan !== "special") throw new Error("画像アップロードはspecial・proプランで利用できます。");
  const bitmap = await createImageBitmap(file);
  let blob: Blob;
  try {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 800 / bitmap.width);
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("画像を読み込めませんでした。");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      value => value ? resolve(value) : reject(new Error("画像を変換できませんでした。")), "image/jpeg", 0.7));
  } finally { bitmap.close(); }
  const path = `${capacity.userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await client.storage.from("item-images").upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error("画像をアップロードできませんでした。");
  return client.storage.from("item-images").getPublicUrl(path).data.publicUrl;
}
