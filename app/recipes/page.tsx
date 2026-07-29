"use client";

import Header from "@/components/Header";
import { RECIPE_CATEGORIES } from "@/lib/recipeMetadata";
import { getRecipeItemMaster, type Recipe } from "@/lib/recipes";
import { supabase } from "@/lib/supabase";
import { useAppTheme } from "@/lib/useAppTheme";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function RecipesPage() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const theme = useAppTheme();
  const [search, setSearch] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [category, setCategory] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }
      const { data, error: loadError } = await supabase
        .from("recipes")
        .select("*, recipe_items(*, item_master:item_master_id(id, name, yomi, category, image_url), user_item_master:user_item_master_id(id, name, yomi, category, image_url))")
        .order("is_favorite", { ascending: false })
        .order("updated_at", { ascending: false });
      if (loadError) setError(loadError.message);
      else setRecipes((data ?? []) as Recipe[]);
      setLoading(false);
    };
    void load();
  }, [router]);

  const filteredRecipes = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return recipes.filter((recipe) => {
      if (favoriteOnly && !recipe.is_favorite) return false;
      if (category && recipe.category !== category) return false;
      if (!needle) return true;
      const itemNames = (recipe.recipe_items ?? []).map((item) => {
        try {
          return getRecipeItemMaster(item).name;
        } catch {
          return "";
        }
      });
      return [
        recipe.name,
        recipe.memo ?? "",
        recipe.category ?? "",
        ...itemNames,
      ].some((value) => value.toLocaleLowerCase().includes(needle));
    });
  }, [category, favoriteOnly, recipes, search]);

  const toggleFavorite = async (recipe: Recipe) => {
    const nextValue = !recipe.is_favorite;
    setRecipes((current) => current.map((row) =>
      row.id === recipe.id ? { ...row, is_favorite: nextValue } : row
    ));
    const { error: updateError } = await supabase
      .from("recipes")
      .update({ is_favorite: nextValue })
      .eq("id", recipe.id);
    if (updateError) {
      setRecipes((current) => current.map((row) =>
        row.id === recipe.id ? { ...row, is_favorite: recipe.is_favorite } : row
      ));
      setError(updateError.message);
    }
  };

  const hasActiveFilter = Boolean(search.trim() || favoriteOnly || category);

  return (
    <main className={`recipe-page recipe ${theme} p-4 sm:p-6`}>
      <div className="mx-auto max-w-5xl">
        <Header title="レシピノート" subtitle="SHOPPING TEMPLATES" />
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex rounded-2xl border p-1" style={{ borderColor: "var(--ring-color)", backgroundColor: "var(--sub-bg)" }}>
            <button type="button" onClick={() => setFavoriteOnly(false)} className={`flex-1 rounded-xl px-4 py-2 text-sm font-bold sm:flex-none ${!favoriteOnly ? "recipe-card" : "recipe-muted"}`}>すべて</button>
            <button type="button" onClick={() => setFavoriteOnly(true)} className={`flex-1 rounded-xl px-4 py-2 text-sm font-bold sm:flex-none ${favoriteOnly ? "recipe-card" : "recipe-muted"}`}>お気に入りのみ</button>
          </div>
          <Link href="/recipes/new" className="recipe-accent-button rounded-2xl px-5 py-3 text-center font-black shadow-sm">＋ レシピを作る</Link>
        </div>
        <section className="recipe-card mb-5 grid gap-3 rounded-3xl border p-4 sm:grid-cols-[minmax(0,1fr)_220px]">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="レシピを検索" className="recipe-input w-full rounded-2xl border px-4 py-3" />
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="カテゴリーで絞り込み" className="recipe-select w-full rounded-2xl border px-4 py-3">
            <option value="">すべてのカテゴリー</option>
            {RECIPE_CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </section>
        {error && <p className="mb-4 rounded-2xl bg-red-50 p-4 text-red-700">{error}</p>}
        {loading ? <p className="recipe-muted py-12 text-center">読み込み中…</p> : recipes.length === 0 ? (
          <section className="recipe-card rounded-3xl border p-10 text-center">
            <div className="text-5xl">🍳</div><h2 className="recipe-heading mt-4 text-xl font-black">最初のレシピを作りましょう</h2><p className="recipe-muted mt-2 text-sm">材料をまとめて買い物リストへ追加できます。</p>
          </section>
        ) : filteredRecipes.length === 0 ? (
          <section className="recipe-card rounded-3xl border p-10 text-center">
            <div className="text-5xl">{favoriteOnly && !search.trim() && !category ? "☆" : "🔍"}</div>
            <h2 className="recipe-heading mt-4 text-xl font-black">{favoriteOnly && !search.trim() && !category ? "お気に入りのレシピはまだありません" : "該当するレシピがありません"}</h2>
            {hasActiveFilter && <button type="button" onClick={() => { setSearch(""); setFavoriteOnly(false); setCategory(""); }} className="recipe-accent-outline mt-4 rounded-2xl border px-4 py-2 font-bold">絞り込みを解除</button>}
          </section>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredRecipes.map((recipe) => <article key={recipe.id} className="recipe-card overflow-hidden rounded-3xl border">
              {recipe.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={recipe.image_url} alt={recipe.name} className="h-44 w-full object-cover" />
              ) : <div className="recipe-soft flex h-44 items-center justify-center text-5xl" aria-label="画像なし">🍽️</div>}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2"><h2 className="recipe-heading text-lg font-black">{recipe.name}</h2><button type="button" onClick={() => void toggleFavorite(recipe)} aria-label={recipe.is_favorite ? "お気に入りから外す" : "お気に入りに追加"} aria-pressed={recipe.is_favorite} className="recipe-accent-outline h-9 w-9 shrink-0 rounded-full border text-lg">{recipe.is_favorite ? "★" : "☆"}</button></div>
                {recipe.memo && <p className="recipe-muted mt-1 line-clamp-2 text-sm leading-5">{recipe.memo}</p>}
                {(recipe.category || recipe.servings) && <div className="mt-2 flex flex-wrap gap-1.5">{recipe.category && <span className="recipe-source-badge rounded-full px-2 py-0.5 text-xs font-bold">{recipe.category}</span>}{recipe.servings && <span className="recipe-source-badge rounded-full px-2 py-0.5 text-xs font-bold">{recipe.servings}人分</span>}</div>}
                <p className="recipe-muted mt-2 text-sm">材料・調味料 {recipe.recipe_items?.length ?? 0}件</p>
                <Link href={`/recipes/${recipe.id}`} className="recipe-accent-button mt-4 block rounded-2xl px-4 py-2.5 text-center text-sm font-bold">詳細を見る</Link>
              </div>
            </article>)}
          </div>
        )}
      </div>
    </main>
  );
}
