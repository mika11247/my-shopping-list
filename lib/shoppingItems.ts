import type { SupabaseClient } from "@supabase/supabase-js";

type ShoppingSourceItem = {
  name: string;
  category: string | null;
  image_url?: string | null;
  note: string;
};

type AddContext = {
  userId: string;
  groupId?: string | null;
};

export type AddShoppingResult = {
  created: boolean;
  changed: boolean;
};

const appendUniqueNote = (current: string | null, addition: string) => {
  const existing = (current ?? "").trim();
  const line = addition.trim();
  if (!line) return existing;
  if (existing.split(/\r?\n/).some((value) => value.trim() === line)) {
    return existing;
  }
  return existing ? `${existing}\n${line}` : line;
};

/** Shared shopping-list insert/update path used by manual and recipe additions. */
export async function addOrMergeShoppingItem(
  supabase: SupabaseClient,
  context: AddContext,
  item: ShoppingSourceItem,
): Promise<AddShoppingResult> {
  let query = supabase
    .from("shopping_items")
    .select("id, note")
    .eq("name", item.name)
    .eq("checked", false);

  query = context.groupId
    ? query.eq("group_id", context.groupId)
    : query.eq("user_id", context.userId).is("group_id", null);

  const { data: existing, error: findError } = await query.maybeSingle();
  if (findError) throw findError;

  if (existing) {
    const nextNote = appendUniqueNote(existing.note, item.note);
    if (nextNote === (existing.note ?? "").trim()) {
      return { created: false, changed: false };
    }
    const { error } = await supabase
      .from("shopping_items")
      .update({ note: nextNote })
      .eq("id", existing.id);
    if (error) throw error;
    return { created: false, changed: true };
  }

  const { error } = await supabase.from("shopping_items").insert({
    user_id: context.userId,
    group_id: context.groupId ?? null,
    name: item.name,
    category: item.category ?? "その他",
    image_url: item.image_url ?? null,
    note: item.note,
    checked: false,
  });
  if (error) throw error;
  return { created: true, changed: true };
}
