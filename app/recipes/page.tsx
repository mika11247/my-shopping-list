"use client";

import Header from "@/components/Header";
import type { Recipe } from "@/lib/recipes";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function RecipesPage() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }
      const { data, error: loadError } = await supabase
        .from("recipes")
        .select("*, recipe_items(id)")
        .order("is_favorite", { ascending: false })
        .order("updated_at", { ascending: false });
      if (loadError) setError(loadError.message);
      else setRecipes((data ?? []) as Recipe[]);
      setLoading(false);
    };
    void load();
  }, [router]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-lime-50 via-white to-sky-50 p-4 text-neutral-800 sm:p-6">
      <div className="mx-auto max-w-5xl">
        <Header title="レシピノート" subtitle="SHOPPING TEMPLATES" />
        <div className="mb-5 flex justify-end">
          <Link href="/recipes/new" className="rounded-2xl bg-lime-500 px-5 py-3 font-black text-white shadow-sm">＋ レシピを作る</Link>
        </div>
        {error && <p className="rounded-2xl bg-red-50 p-4 text-red-700">{error}</p>}
        {loading ? <p className="py-12 text-center text-neutral-500">読み込み中…</p> : recipes.length === 0 ? (
          <section className="rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-neutral-200">
            <div className="text-5xl">🍳</div><h2 className="mt-4 text-xl font-black">最初のレシピを作りましょう</h2><p className="mt-2 text-sm text-neutral-500">材料をまとめて買い物リストへ追加できます。</p>
          </section>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recipes.map((recipe) => <article key={recipe.id} className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-neutral-200">
              {recipe.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={recipe.image_url} alt={recipe.name} className="h-44 w-full object-cover" />
              ) : <div className="flex h-44 items-center justify-center bg-gradient-to-br from-lime-100 to-sky-100 text-5xl" aria-label="画像なし">🍽️</div>}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2"><h2 className="text-lg font-black">{recipe.name}</h2>{recipe.is_favorite && <span title="お気に入り" className="text-amber-400">★</span>}</div>
                <p className="mt-2 text-sm text-neutral-500">材料・調味料 {recipe.recipe_items?.length ?? 0}件</p>
                <Link href={`/recipes/${recipe.id}`} className="mt-4 block rounded-2xl bg-neutral-900 px-4 py-2.5 text-center text-sm font-bold text-white">詳細を見る</Link>
              </div>
            </article>)}
          </div>
        )}
      </div>
    </main>
  );
}
