"use client";

import Header from "@/components/Header";
import { formatMealDate, type MealPlan } from "@/lib/mealPlans";
import { supabase } from "@/lib/supabase";
import { useAppTheme } from "@/lib/useAppTheme";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function MealPlansPage() {
  const router = useRouter();
  const theme = useAppTheme();
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return router.replace("/login");
      setUserId(auth.user.id);
      const { data, error: loadError } = await supabase
        .from("meal_plans")
        .select("*, groups(id, name)")
        .order("start_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (loadError) setError(loadError.message);
      else setPlans((data ?? []) as unknown as MealPlan[]);
      setLoading(false);
    };
    void load();
  }, [router]);

  const remove = async (plan: MealPlan) => {
    if (!confirm(`「${plan.name}」を削除しますか？`)) return;
    const { error: removeError } = await supabase.from("meal_plans").delete().eq("id", plan.id);
    if (removeError) return setError(removeError.message);
    setPlans((current) => current.filter((row) => row.id !== plan.id));
  };

  return (
    <main className={`recipe-page recipe ${theme} p-4 sm:p-6`}>
      <div className="mx-auto max-w-5xl">
        <Header title="献立リスト" subtitle="WEEKLY MEAL PLANS" />
        <div className="mb-5 flex justify-end">
          <Link href="/meal-plans/new" className="recipe-accent-button rounded-2xl px-5 py-3 font-black">＋ 献立を作る</Link>
        </div>
        {error && <p className="mb-4 rounded-2xl bg-red-50 p-4 text-red-700">{error}</p>}
        {loading ? <p className="recipe-muted py-12 text-center">読み込み中…</p> : plans.length === 0 ? (
          <section className="recipe-card rounded-3xl border p-10 text-center">
            <div className="text-5xl">🍽️</div>
            <h2 className="recipe-heading mt-4 text-xl font-black">最初の献立を作りましょう</h2>
            <p className="recipe-muted mt-2 text-sm">7日分の朝・昼・夜をまとめて管理できます。</p>
          </section>
        ) : <div className="grid gap-4 sm:grid-cols-2">
          {plans.map((plan) => {
            const canEdit = plan.user_id === userId;
            return <article key={plan.id} className="recipe-card rounded-3xl border p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="recipe-heading text-xl font-black">{plan.name}</h2>
                <span className="recipe-source-badge shrink-0 rounded-full px-3 py-1 text-xs font-bold">{plan.group_id ? `共有${plan.groups?.name ? `：${plan.groups.name}` : ""}` : "個人"}</span>
              </div>
              <dl className="mt-4 grid gap-2 text-sm">
                <div><dt className="recipe-muted inline">期間：</dt><dd className="inline">{formatMealDate(plan.start_date, true)} 〜 {formatMealDate(plan.end_date, true)}</dd></div>
                {plan.servings && <div><dt className="recipe-muted inline">人数：</dt><dd className="inline">{plan.servings}人</dd></div>}
                <div><dt className="recipe-muted inline">作成日：</dt><dd className="inline">{new Intl.DateTimeFormat("ja-JP").format(new Date(plan.created_at))}</dd></div>
              </dl>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Link href={`/meal-plans/${plan.id}`} className="recipe-accent-button col-span-2 rounded-2xl px-4 py-2.5 text-center font-bold">開く</Link>
                {canEdit && <Link href={`/meal-plans/${plan.id}/edit`} className="recipe-card rounded-2xl border px-4 py-2.5 text-center font-bold">編集</Link>}
                {canEdit && <button type="button" onClick={() => void remove(plan)} className="rounded-2xl bg-red-50 px-4 py-2.5 font-bold text-red-600">削除</button>}
              </div>
            </article>;
          })}
        </div>}
      </div>
    </main>
  );
}
