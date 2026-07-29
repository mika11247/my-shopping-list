"use client";

import Header from "@/components/Header";
import { createWeek, formatMealDate, MEAL_TYPES, type MealPlan, type MealPlanEntry, type MealType } from "@/lib/mealPlans";
import type { Recipe } from "@/lib/recipes";
import { supabase } from "@/lib/supabase";
import { useAppTheme } from "@/lib/useAppTheme";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ActiveSlot = { date: string; mealType: MealType } | null;

export default function MealPlanDetail({ mealPlanId }: { mealPlanId: string }) {
  const router = useRouter();
  const theme = useAppTheme();
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [userId, setUserId] = useState("");
  const [activeSlot, setActiveSlot] = useState<ActiveSlot>(null);
  const [method, setMethod] = useState<"recipe" | "custom">("recipe");
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadPlan = async () => {
    const { data, error: loadError } = await supabase
      .from("meal_plans")
      .select("*, groups(id, name), meal_plan_entries(*, recipe:recipe_id(id, name, image_url, servings))")
      .eq("id", mealPlanId)
      .single();
    if (loadError) return setError(loadError.message);
    const loaded = data as unknown as MealPlan;
    loaded.meal_plan_entries?.sort((a, b) => a.sort_order - b.sort_order);
    setPlan(loaded);
  };

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return router.replace("/login");
      setUserId(auth.user.id);
      const recipeResult = await supabase
        .from("recipes")
        .select("id, name, image_url, servings, category")
        .order("is_favorite", { ascending: false })
        .order("name");
      if (!recipeResult.error) setRecipes((recipeResult.data ?? []) as Recipe[]);
      await loadPlan();
    };
    void load();
    // loadPlan only depends on the route id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mealPlanId, router]);

  const closeModal = () => {
    setActiveSlot(null);
    setMethod("recipe");
    setSelectedRecipeId("");
    setCustomTitle("");
    setError("");
  };

  const addEntry = async () => {
    if (!activeSlot || !plan) return;
    const recipe = recipes.find((row) => row.id === selectedRecipeId);
    const title = method === "recipe" ? recipe?.name.trim() : customTitle.trim();
    if (!title) return setError(method === "recipe" ? "レシピを選択してください。" : "タイトルを入力してください。");
    const slotEntries = (plan.meal_plan_entries ?? []).filter(
      (entry) => entry.meal_date === activeSlot.date && entry.meal_type === activeSlot.mealType,
    );
    setSaving(true);
    const { error: insertError } = await supabase.from("meal_plan_entries").insert({
      meal_plan_id: plan.id,
      meal_date: activeSlot.date,
      meal_type: activeSlot.mealType,
      recipe_id: method === "recipe" ? selectedRecipeId : null,
      title,
      sort_order: slotEntries.length,
    });
    setSaving(false);
    if (insertError) return setError(insertError.message);
    closeModal();
    await loadPlan();
  };

  const removeEntry = async (entry: MealPlanEntry) => {
    if (!confirm(`「${entry.title}」を献立から削除しますか？`)) return;
    const { error: removeError } = await supabase.from("meal_plan_entries").delete().eq("id", entry.id);
    if (removeError) return setError(removeError.message);
    setPlan((current) => current ? {
      ...current,
      meal_plan_entries: current.meal_plan_entries?.filter((row) => row.id !== entry.id),
    } : current);
  };

  if (!plan) return <main className={`recipe-page recipe ${theme} p-6`}><p className={error ? "text-red-700" : "recipe-muted"}>{error || "読み込み中…"}</p></main>;
  const canEdit = plan.user_id === userId;

  return (
    <main className={`recipe-page recipe ${theme} p-4 sm:p-6`}>
      <div className="mx-auto max-w-6xl">
        <Header title={plan.name} subtitle="WEEKLY MEAL PLAN" />
        <section className="recipe-card mb-5 rounded-3xl border p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="recipe-source-badge rounded-full px-3 py-1 text-sm font-bold">{plan.group_id ? `共有${plan.groups?.name ? `：${plan.groups.name}` : ""}` : "個人"}</span>
            {plan.servings && <span className="recipe-source-badge rounded-full px-3 py-1 text-sm font-bold">{plan.servings}人</span>}
          </div>
          <p className="recipe-muted mt-3 text-sm">{formatMealDate(plan.start_date, true)} 〜 {formatMealDate(plan.end_date, true)}</p>
          {!canEdit && <p className="recipe-soft mt-3 rounded-xl p-3 text-sm">共有メンバーとして閲覧中です。Ver1では作成者のみ編集できます。</p>}
        </section>

        <div className="space-y-4">
          {createWeek(plan.start_date).map((date) => <section key={date} className="recipe-card rounded-3xl border p-4 sm:p-5">
            <h2 className="recipe-heading text-lg font-black">{formatMealDate(date)}</h2>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              {MEAL_TYPES.map((meal) => {
                const entries = (plan.meal_plan_entries ?? []).filter(
                  (entry) => entry.meal_date === date && entry.meal_type === meal.value,
                );
                return <div key={meal.value} className="recipe-soft min-w-0 rounded-2xl p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-black">{meal.label}</h3>
                    {canEdit && <button type="button" onClick={() => setActiveSlot({ date, mealType: meal.value })} className="recipe-accent-outline rounded-xl border px-3 py-1.5 text-sm font-bold">＋追加</button>}
                  </div>
                  <div className="mt-3 space-y-2">
                    {entries.length === 0 && <p className="recipe-muted py-3 text-center text-sm">未定</p>}
                    {entries.map((entry) => <article key={entry.id} className="recipe-card overflow-hidden rounded-2xl border">
                      {entry.recipe?.image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={entry.recipe.image_url} alt="" className="h-24 w-full object-cover" />
                      )}
                      <div className="p-3">
                        <p className="font-bold">{entry.title}</p>
                        {entry.recipe?.servings && <p className="recipe-muted mt-1 text-xs">基準：{entry.recipe.servings}人分</p>}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {entry.recipe_id && <Link href={`/recipes/${entry.recipe_id}`} className="recipe-accent-outline rounded-xl border px-3 py-1.5 text-xs font-bold">レシピを見る</Link>}
                          {canEdit && <button type="button" onClick={() => void removeEntry(entry)} className="rounded-xl bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600">削除</button>}
                        </div>
                      </div>
                    </article>)}
                  </div>
                </div>;
              })}
            </div>
          </section>)}
        </div>
        <div className="mt-5 flex gap-3 pb-8">
          <Link href="/meal-plans" className="recipe-card flex-1 rounded-2xl border px-4 py-3 text-center font-bold">一覧へ</Link>
          {canEdit && <Link href={`/meal-plans/${plan.id}/edit`} className="recipe-accent-button flex-1 rounded-2xl px-4 py-3 text-center font-bold">献立を編集</Link>}
        </div>
      </div>

      {activeSlot && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={closeModal}>
        <section role="dialog" aria-modal="true" aria-label="食事を追加" className="recipe-card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border p-5" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between gap-3">
            <div><p className="recipe-muted text-sm">{formatMealDate(activeSlot.date)}・{MEAL_TYPES.find((meal) => meal.value === activeSlot.mealType)?.label}</p><h2 className="recipe-heading text-xl font-black">食事を追加</h2></div>
            <button type="button" onClick={closeModal} className="recipe-card h-10 w-10 rounded-full border" aria-label="閉じる">×</button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMethod("recipe")} className={`rounded-2xl border px-3 py-2 font-bold ${method === "recipe" ? "recipe-accent-button" : "recipe-accent-outline"}`}>レシピから選択</button>
            <button type="button" onClick={() => setMethod("custom")} className={`rounded-2xl border px-3 py-2 font-bold ${method === "custom" ? "recipe-accent-button" : "recipe-accent-outline"}`}>自由入力</button>
          </div>
          {method === "recipe" ? <label className="mt-4 block font-bold">レシピ
            <select value={selectedRecipeId} onChange={(event) => setSelectedRecipeId(event.target.value)} className="recipe-select mt-2 w-full rounded-2xl border px-4 py-3 font-normal">
              <option value="">選択してください</option>
              {recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}{recipe.servings ? `（${recipe.servings}人分）` : ""}</option>)}
            </select>
          </label> : <label className="mt-4 block font-bold">タイトル
            <input value={customTitle} onChange={(event) => setCustomTitle(event.target.value)} maxLength={120} placeholder="例：外食、お弁当、残り物、各自、未定" className="recipe-input mt-2 w-full rounded-2xl border px-4 py-3 font-normal" />
          </label>}
          {method === "recipe" && recipes.length === 0 && <p className="recipe-muted mt-3 text-sm">選択できるレシピがありません。先にレシピノートへ登録するか、自由入力をご利用ください。</p>}
          {error && <p role="alert" className="mt-3 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button type="button" disabled={saving} onClick={() => void addEntry()} className="recipe-accent-button mt-5 w-full rounded-2xl px-4 py-3 font-black disabled:opacity-50">{saving ? "追加中…" : "この食事を追加"}</button>
        </section>
      </div>}
    </main>
  );
}
