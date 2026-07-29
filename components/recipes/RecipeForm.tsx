"use client";

import Header from "@/components/Header";
import { getRecipeItemMaster, isHttpUrl, type ItemMaster, type Recipe, type RecipeItemType } from "@/lib/recipes";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type DraftItem = {
  master_id: number;
  source: "common" | "user";
  name: string;
  item_type: RecipeItemType;
  amount_text: string;
};

export default function RecipeForm({ recipeId }: { recipeId?: string }) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [instructions, setInstructions] = useState("");
  const [memo, setMemo] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [masters, setMasters] = useState<ItemMaster[]>([]);
  const [search, setSearch] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }
      setUserId(auth.user.id);
      const [commonResult, userResult] = await Promise.all([
        supabase
          .from("item_master")
          .select("id, name, yomi, category, image_url")
          .order("name"),
        supabase
          .from("user_item_master")
          .select("id, name, yomi, category, image_url")
          .eq("user_id", auth.user.id)
          .order("name"),
      ]);
      if (commonResult.error || userResult.error) {
        setError((commonResult.error ?? userResult.error)?.message ?? "アイテムの取得に失敗しました。");
        return;
      }
      setMasters([
        ...(userResult.data ?? []).map((item) => ({ ...item, source: "user" as const })),
        ...(commonResult.data ?? []).map((item) => ({ ...item, source: "common" as const })),
      ]);

      if (!recipeId) return;
      const { data, error: recipeError } = await supabase
        .from("recipes")
        .select("*, recipe_items(*, item_master:item_master_id(id, name, yomi, category, image_url), user_item_master:user_item_master_id(id, name, yomi, category, image_url))")
        .eq("id", recipeId)
        .single();
      if (recipeError) {
        setError(recipeError.message);
        return;
      }
      const recipe = data as Recipe;
      setName(recipe.name);
      setSourceUrl(recipe.source_url ?? "");
      setInstructions(recipe.instructions ?? "");
      setMemo(recipe.memo ?? "");
      setFavorite(recipe.is_favorite);
      setImageUrl(recipe.image_url);
      setImagePath(recipe.image_path);
      setItems(
        (recipe.recipe_items ?? [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((item) => {
            const master = getRecipeItemMaster(item);
            return {
              master_id: master.id,
              source: master.source,
              name: master.name,
              item_type: item.item_type,
              amount_text: item.amount_text,
            };
          }),
      );
    };
    void load();
  }, [recipeId, router]);

  const candidates = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return [];
    return masters
      .filter(
        (master) =>
          !items.some((item) => item.master_id === master.id && item.source === master.source) &&
          `${master.name} ${master.yomi ?? ""}`.toLowerCase().includes(needle),
      )
      .slice(0, 8);
  }, [items, masters, search]);

  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= items.length) return;
    setItems((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!name.trim()) return setError("レシピ名を入力してください。");
    if (!isHttpUrl(sourceUrl)) return setError("参照URLは http:// または https:// で入力してください。");
    if (!userId) return;
    setSaving(true);

    let nextPath = removeImage ? null : imagePath;
    let nextUrl = removeImage ? null : imageUrl;
    let uploadedPath: string | null = null;

    try {
      if (imageFile) {
        const extension = imageFile.name.split(".").pop()?.toLowerCase() || "jpg";
        uploadedPath = `${userId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("recipe-images")
          .upload(uploadedPath, imageFile, { contentType: imageFile.type, upsert: false });
        if (uploadError) throw uploadError;
        nextPath = uploadedPath;
        nextUrl = supabase.storage.from("recipe-images").getPublicUrl(uploadedPath).data.publicUrl;
      }

      const payload = {
        user_id: userId,
        name: name.trim(),
        source_url: sourceUrl.trim() || null,
        instructions: instructions.trim() || null,
        memo: memo.trim() || null,
        is_favorite: favorite,
        image_url: nextUrl,
        image_path: nextPath,
      };
      let savedId = recipeId;
      if (recipeId) {
        const { error: updateError } = await supabase.from("recipes").update(payload).eq("id", recipeId);
        if (updateError) throw updateError;
        const { error: deleteItemsError } = await supabase
          .from("recipe_items")
          .delete()
          .eq("recipe_id", recipeId);
        if (deleteItemsError) throw deleteItemsError;
      } else {
        const { data, error: insertError } = await supabase
          .from("recipes")
          .insert(payload)
          .select("id")
          .single();
        if (insertError) throw insertError;
        savedId = data.id;
      }
      if (items.length && savedId) {
        const { error: itemError } = await supabase.from("recipe_items").insert(
          items.map((item, index) => ({
            recipe_id: savedId,
            item_master_id: item.source === "common" ? item.master_id : null,
            user_item_master_id: item.source === "user" ? item.master_id : null,
            item_type: item.item_type,
            amount_text: item.amount_text.trim(),
            sort_order: index,
          })),
        );
        if (itemError) throw itemError;
      }

      if ((removeImage || imageFile) && imagePath && imagePath !== nextPath) {
        const { error: removeError } = await supabase.storage.from("recipe-images").remove([imagePath]);
        if (removeError) console.warn("古いレシピ画像を削除できませんでした", removeError);
      }
      router.push(`/recipes/${savedId}`);
    } catch (cause) {
      if (uploadedPath) await supabase.storage.from("recipe-images").remove([uploadedPath]);
      setError(cause instanceof Error ? cause.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-lime-50 via-white to-sky-50 p-4 text-neutral-800 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <Header title={recipeId ? "レシピを編集" : "レシピを作成"} subtitle="RECIPE NOTE" />
        <form onSubmit={save} className="space-y-5">
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
            <label className="block text-sm font-bold">レシピ名 *</label>
            <input className="mt-2 w-full rounded-2xl border border-neutral-200 px-4 py-3" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            <label className="mt-4 block text-sm font-bold">補足メモ</label>
            <input className="mt-2 w-full rounded-2xl border border-neutral-200 px-4 py-3" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={160} placeholder="例：〇〇さんのレシピ、炊飯器で作れる、夏向け" />
            <label className="mt-4 block text-sm font-bold">レシピ画像</label>
            {(imageFile || (imageUrl && !removeImage)) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageFile ? URL.createObjectURL(imageFile) : imageUrl!} alt="" className="mt-2 h-48 w-full rounded-2xl object-cover" />
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="cursor-pointer rounded-xl bg-sky-50 px-4 py-2 text-sm font-bold text-sky-700">
                写真を選ぶ
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { setImageFile(e.target.files?.[0] ?? null); setRemoveImage(false); }} />
              </label>
              {(imageUrl || imageFile) && <button type="button" className="rounded-xl bg-red-50 px-4 py-2 text-sm font-bold text-red-600" onClick={() => { setImageFile(null); setRemoveImage(true); }}>画像を削除</button>}
            </div>
            <label className="mt-4 block text-sm font-bold">参照URL</label>
            <input type="url" inputMode="url" placeholder="https://..." className="mt-2 w-full rounded-2xl border border-neutral-200 px-4 py-3" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
            <label className="mt-4 block text-sm font-bold">作り方メモ</label>
            <textarea rows={6} className="mt-2 w-full rounded-2xl border border-neutral-200 px-4 py-3" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
            <label className="mt-4 flex items-center gap-3 font-bold"><input type="checkbox" className="h-5 w-5" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} />お気に入り</label>
          </section>

          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
            <h2 className="text-lg font-black">材料・調味料</h2>
            <div className="relative mt-3">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="アイテムを検索" className="w-full rounded-2xl border border-neutral-200 px-4 py-3" />
              {candidates.length > 0 && <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200">
                {candidates.map((master) => <button type="button" key={`${master.source}-${master.id}`} onClick={() => { setItems((current) => [...current, { master_id: master.id, source: master.source, name: master.name, item_type: "ingredient", amount_text: "" }]); setSearch(""); }} className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-lime-50"><span className="min-w-0 flex-1">{master.name}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${master.source === "user" ? "bg-pink-50 text-pink-600" : "bg-sky-50 text-sky-600"}`}>{master.source === "user" ? "マイアイテム" : "共通"}</span><span className="text-xs text-neutral-400">{master.category}</span></button>)}
              </div>}
            </div>
            <div className="mt-4 space-y-3">
              {items.map((item, index) => <div key={`${item.source}-${item.master_id}`} className="rounded-2xl bg-neutral-50 p-3">
                <div className="flex items-center justify-between gap-2"><div className="min-w-0"><strong>{item.name}</strong><span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[11px] text-neutral-500">{item.source === "user" ? "マイアイテム" : "共通"}</span></div><div className="flex shrink-0 gap-1"><button type="button" aria-label="上へ" onClick={() => move(index, -1)} className="h-9 w-9 rounded-xl bg-white">↑</button><button type="button" aria-label="下へ" onClick={() => move(index, 1)} className="h-9 w-9 rounded-xl bg-white">↓</button><button type="button" onClick={() => setItems((current) => current.filter((_, i) => i !== index))} className="h-9 rounded-xl bg-red-50 px-3 text-red-600">削除</button></div></div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <select value={item.item_type} onChange={(e) => setItems((current) => current.map((row, i) => i === index ? { ...row, item_type: e.target.value as RecipeItemType } : row))} className="rounded-xl border border-neutral-200 bg-white px-3 py-2"><option value="ingredient">食材</option><option value="seasoning">調味料</option></select>
                  <input value={item.amount_text} onChange={(e) => setItems((current) => current.map((row, i) => i === index ? { ...row, amount_text: e.target.value } : row))} placeholder="分量（例：2個、少々）" className="rounded-xl border border-neutral-200 px-3 py-2" />
                </div>
              </div>)}
            </div>
          </section>
          {error && <p role="alert" className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="flex gap-3 pb-8"><button type="button" onClick={() => router.back()} className="flex-1 rounded-2xl bg-white px-5 py-3 font-bold ring-1 ring-neutral-200">戻る</button><button disabled={saving} className="flex-1 rounded-2xl bg-lime-500 px-5 py-3 font-black text-white disabled:opacity-50">{saving ? "保存中…" : "保存する"}</button></div>
        </form>
      </div>
    </main>
  );
}
