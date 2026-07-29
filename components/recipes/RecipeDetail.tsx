"use client";

import Header from "@/components/Header";
import { getRecipeItemMaster, type Recipe, type RecipeItem, type RecipeItemType } from "@/lib/recipes";
import { addOrMergeShoppingItem } from "@/lib/shoppingItems";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function RecipeDetail({ recipeId }: { recipeId: string }) {
  type GroupOption = { id: string; name: string };
  const router = useRouter();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [target, setTarget] = useState("personal");

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return router.replace("/login");
      setUserId(auth.user.id);
      const [recipeResult, groupResult] = await Promise.all([
        supabase
          .from("recipes")
          .select("*, recipe_items(*, item_master:item_master_id(id, name, yomi, category, image_url), user_item_master:user_item_master_id(id, name, yomi, category, image_url))")
          .eq("id", recipeId)
          .single(),
        supabase
          .from("group_members")
          .select("group_id, groups(id, name)")
          .eq("user_id", auth.user.id),
      ]);
      const { data, error: loadError } = recipeResult;
      if (loadError) setError(loadError.message);
      else {
        const loaded = data as Recipe;
        loaded.recipe_items?.sort((a, b) => a.sort_order - b.sort_order);
        setRecipe(loaded);
      }
      if (groupResult.error) {
        console.warn("共有リストを取得できませんでした", groupResult.error);
      } else {
        const availableGroups = (groupResult.data ?? []).flatMap((row) => {
          const value = row.groups;
          if (!value) return [];
          return (Array.isArray(value) ? value : [value]) as GroupOption[];
        });
        setGroups(availableGroups);
        const savedTarget = localStorage.getItem("recipeShoppingTarget") ?? "personal";
        setTarget(
          savedTarget === "personal" || availableGroups.some((group) => group.id === savedTarget)
            ? savedTarget
            : "personal",
        );
      }
    };
    void load();
  }, [recipeId, router]);

  const addItems = async (items: RecipeItem[]) => {
    if (!recipe || !userId || items.length === 0) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let changed = 0;
      for (const item of items) {
        const master = getRecipeItemMaster(item);
        const result = await addOrMergeShoppingItem(supabase, {
          userId,
          groupId: target === "personal" ? null : target,
        }, {
          name: master.name,
          category: master.category,
          image_url: master.image_url,
          note: `${recipe.name}：${item.amount_text || "分量記載なし"}`,
        });
        if (result.changed) changed += 1;
      }
      setMessage(changed ? `${changed}件を買い物リストに反映しました。` : "すでに同じ内容が追加されています。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "買い物リストへの追加に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const addType = (type?: RecipeItemType) =>
    addItems((recipe?.recipe_items ?? []).filter((item) => !type || item.item_type === type));

  const targetName = target === "personal"
    ? "個人リスト"
    : groups.find((group) => group.id === target)?.name ?? "共有リスト";

  const changeTarget = (value: string) => {
    setTarget(value);
    localStorage.setItem("recipeShoppingTarget", value);
  };

  const removeRecipe = async () => {
    if (!recipe || !confirm(`「${recipe.name}」を削除しますか？`)) return;
    setBusy(true);
    const { error: deleteError } = await supabase.from("recipes").delete().eq("id", recipe.id);
    if (deleteError) {
      setError(deleteError.message);
      setBusy(false);
      return;
    }
    if (recipe.image_path) {
      const { error: imageError } = await supabase.storage.from("recipe-images").remove([recipe.image_path]);
      if (imageError) console.warn("レシピ画像を削除できませんでした", imageError);
    }
    router.push("/recipes");
  };

  if (error && !recipe) return <main className="p-6 text-red-700">{error}</main>;
  if (!recipe) return <main className="p-6 text-center text-neutral-500">読み込み中…</main>;
  const ingredients = recipe.recipe_items?.filter((item) => item.item_type === "ingredient") ?? [];
  const seasonings = recipe.recipe_items?.filter((item) => item.item_type === "seasoning") ?? [];

  return (
    <main className="min-h-screen bg-gradient-to-b from-lime-50 via-white to-sky-50 p-4 text-neutral-800 sm:p-6">
      <div className="mx-auto max-w-4xl">
        <Header title={recipe.name} subtitle="RECIPE DETAIL" />
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
          <div className="space-y-5">
            <section className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-neutral-200">
              {recipe.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={recipe.image_url} alt={recipe.name} className="max-h-[28rem] w-full object-cover" />
              ) : <div className="flex h-56 items-center justify-center bg-gradient-to-br from-lime-100 to-sky-100 text-6xl">🍽️</div>}
              <div className="p-5">
                <div className="flex items-center gap-2"><h1 className="text-2xl font-black">{recipe.name}</h1>{recipe.is_favorite && <span className="text-xl text-amber-400">★</span>}</div>
                {recipe.memo && <p className="mt-2 text-sm leading-6 text-neutral-500">{recipe.memo}</p>}
                {recipe.source_url && <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block rounded-2xl bg-sky-50 px-4 py-2 font-bold text-sky-700">参照レシピを開く ↗</a>}
              </div>
            </section>
            {recipe.instructions && <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
              {recipe.instructions && <><h2 className="font-black">作り方メモ</h2><p className="mt-2 whitespace-pre-wrap leading-7">{recipe.instructions}</p></>}
            </section>}
          </div>
          <div className="space-y-5">
            <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
              <h2 className="text-lg font-black">買い物リストへ追加</h2>
              <label className="mt-3 block text-sm font-bold" htmlFor="shopping-target">追加先</label>
              <select id="shopping-target" value={target} onChange={(event) => changeTarget(event.target.value)} className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 font-bold">
                <option value="personal">個人リスト</option>
                {groups.map((group) => <option key={group.id} value={group.id}>共有リスト：{group.name}</option>)}
              </select>
              {groups.length === 0 && <p className="mt-2 text-xs leading-5 text-neutral-500">参加中の共有リストがないため、個人リストへ追加します。</p>}
              <p className="mt-3 rounded-xl bg-neutral-50 px-3 py-2 text-sm">現在の追加先：<strong>{targetName}</strong></p>
              <div className="mt-3 grid gap-2"><button disabled={busy || !ingredients.length} onClick={() => void addType("ingredient")} className="rounded-2xl bg-lime-500 px-4 py-3 font-bold text-white disabled:opacity-40">{targetName}に食材を追加</button><button disabled={busy || !seasonings.length} onClick={() => void addType("seasoning")} className="rounded-2xl bg-sky-500 px-4 py-3 font-bold text-white disabled:opacity-40">{targetName}に調味料を追加</button><button disabled={busy || !recipe.recipe_items?.length} onClick={() => void addType()} className="rounded-2xl bg-neutral-900 px-4 py-3 font-bold text-white disabled:opacity-40">{targetName}にすべて追加</button></div>
              {message && <p className="mt-3 rounded-xl bg-green-50 p-3 text-sm text-green-700">{message}</p>}
              {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            </section>
            {([["食材", ingredients], ["調味料", seasonings]] as const).map(([label, rows]) => rows.length > 0 && <section key={label} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-neutral-200"><h2 className="font-black">{label}</h2><div className="mt-3 divide-y divide-neutral-100">{rows.map((item) => { const master = getRecipeItemMaster(item); return <div key={item.id} className="flex items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="font-bold">{master.name}<span className="ml-2 rounded-full bg-neutral-50 px-2 py-0.5 text-[11px] font-normal text-neutral-500">{master.source === "user" ? "マイアイテム" : "共通"}</span></p><p className="text-sm text-neutral-500">{item.amount_text || "分量記載なし"}</p></div><button disabled={busy} onClick={() => void addItems([item])} aria-label={`${master.name}を${targetName}に追加`} title={`${targetName}に追加`} className="h-10 w-10 shrink-0 rounded-2xl bg-lime-100 text-xl font-black text-lime-700">＋</button></div>; })}</div></section>)}
            <div className="flex gap-2"><Link href={`/recipes/${recipe.id}/edit`} className="flex-1 rounded-2xl bg-white px-4 py-3 text-center font-bold ring-1 ring-neutral-200">編集</Link><button disabled={busy} onClick={() => void removeRecipe()} className="flex-1 rounded-2xl bg-red-50 px-4 py-3 font-bold text-red-600">削除</button></div>
          </div>
        </div>
      </div>
    </main>
  );
}
