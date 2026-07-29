"use client";

import Header from "@/components/Header";
import { addDays, type GroupOption, type MealPlan } from "@/lib/mealPlans";
import { getLimitByPlan } from "@/lib/planLimits";
import { supabase } from "@/lib/supabase";
import { useAppTheme } from "@/lib/useAppTheme";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const today = () => {
  const value = new Date();
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
};

export default function MealPlanForm({ mealPlanId }: { mealPlanId?: string }) {
  const router = useRouter();
  const theme = useAppTheme();
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [servings, setServings] = useState("");
  const [target, setTarget] = useState("personal");
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [originalStartDate, setOriginalStartDate] = useState("");
  const [hasEntries, setHasEntries] = useState(false);
  const [userPlan, setUserPlan] = useState("free");
  const [userRole, setUserRole] = useState<"admin" | "user">("user");
  const [mealPlanCount, setMealPlanCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return router.replace("/login");
      setUserId(auth.user.id);
      const [profileResult, countResult] = await Promise.all([
        supabase.from("profiles").select("role, plan").eq("user_id", auth.user.id).single(),
        supabase.from("meal_plans").select("id", { count: "exact", head: true }).eq("user_id", auth.user.id),
      ]);
      if (profileResult.data) {
        setUserPlan(profileResult.data.plan ?? "free");
        setUserRole(profileResult.data.role ?? "user");
      }
      setMealPlanCount(countResult.count ?? 0);
      const groupResult = await supabase
        .from("group_members")
        .select("group_id, groups(id, name)")
        .eq("user_id", auth.user.id);
      if (!groupResult.error) {
        setGroups((groupResult.data ?? []).flatMap((row) => {
          const value = row.groups;
          if (!value) return [];
          return (Array.isArray(value) ? value : [value]) as GroupOption[];
        }));
      }
      if (!mealPlanId) return;
      const { data, error: loadError } = await supabase
        .from("meal_plans")
        .select("*")
        .eq("id", mealPlanId)
        .single();
      if (loadError) return setError(loadError.message);
      const plan = data as MealPlan;
      setName(plan.name);
      setStartDate(plan.start_date);
      setOriginalStartDate(plan.start_date);
      setServings(plan.servings?.toString() ?? "");
      setTarget(plan.group_id ?? "personal");
      const { count } = await supabase
        .from("meal_plan_entries")
        .select("id", { count: "exact", head: true })
        .eq("meal_plan_id", mealPlanId);
      setHasEntries((count ?? 0) > 0);
    };
    void load();
  }, [mealPlanId, router]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!name.trim()) return setError("献立名を入力してください。");
    if (!mealPlanId) {
      const { count, error: countError } = await supabase
        .from("meal_plans")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      if (countError) return setError(countError.message);
      const limit = getLimitByPlan(userRole, userPlan, "mealPlan");
      if ((count ?? 0) >= limit) {
        setMealPlanCount(count ?? 0);
        return setError(`現在のプランで作成できる献立リスト数の上限に達しました。献立リスト ${count ?? 0} / ${limit}件`);
      }
    }
    const parsedServings = servings ? Number(servings) : null;
    if (parsedServings !== null && (!Number.isInteger(parsedServings) || parsedServings < 1)) {
      return setError("人数は1以上の整数で入力してください。");
    }
    setSaving(true);
    const payload = {
      user_id: userId,
      group_id: target === "personal" ? null : target,
      name: name.trim(),
      start_date: startDate,
      end_date: addDays(startDate, 6),
      servings: parsedServings,
    };
    const result = mealPlanId
      ? await supabase.from("meal_plans").update(payload).eq("id", mealPlanId).select("id").single()
      : await supabase.from("meal_plans").insert(payload).select("id").single();
    setSaving(false);
    if (result.error) return setError(result.error.message);
    router.push(`/meal-plans/${result.data.id}`);
  };

  return (
    <main className={`recipe-page recipe ${theme} p-4 sm:p-6`}>
      <div className="mx-auto max-w-2xl">
        <Header title={mealPlanId ? "献立を編集" : "献立を作成"} subtitle="MEAL PLAN" />
        <form onSubmit={save} className="recipe-card space-y-5 rounded-3xl border p-5 sm:p-6">
          {!mealPlanId && <div className="recipe-soft rounded-2xl px-4 py-3 text-sm font-bold">
            <p>献立リスト {mealPlanCount} / {getLimitByPlan(userRole, userPlan, "mealPlan")}件</p>
            {mealPlanCount >= getLimitByPlan(userRole, userPlan, "mealPlan") && <p className="mt-1 text-red-700">現在のプランで作成できる献立リスト数の上限に達しました。</p>}
          </div>}
          <label className="block font-bold">献立名
            <input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="例：今週の献立" className="recipe-input mt-2 w-full rounded-2xl border px-4 py-3 font-normal" />
          </label>
          <label className="block font-bold">開始日
            <input required disabled={Boolean(mealPlanId && hasEntries)} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="recipe-input mt-2 w-full rounded-2xl border px-4 py-3 font-normal disabled:opacity-60" />
          </label>
          {mealPlanId && hasEntries && startDate === originalStartDate && <p className="recipe-muted -mt-3 text-xs">登録済みの食事を保持するため、開始日は変更できません。</p>}
          <div className="recipe-soft rounded-2xl p-4 text-sm">
            期間：{startDate} 〜 {addDays(startDate, 6)}（7日間）
          </div>
          <label className="block font-bold">人数
            <input type="number" min={1} step={1} inputMode="numeric" value={servings} onChange={(event) => setServings(event.target.value)} placeholder="例：4" className="recipe-input mt-2 w-full rounded-2xl border px-4 py-3 font-normal" />
          </label>
          <label className="block font-bold">種類
            <select value={target} onChange={(event) => setTarget(event.target.value)} className="recipe-select mt-2 w-full rounded-2xl border px-4 py-3 font-normal">
              <option value="personal">個人</option>
              {groups.map((group) => <option key={group.id} value={group.id}>共有：{group.name}</option>)}
            </select>
          </label>
          {groups.length === 0 && <p className="recipe-muted text-sm">参加中の共有リストがないため、個人献立のみ作成できます。</p>}
          {error && <p role="alert" className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => router.back()} className="recipe-card flex-1 rounded-2xl border px-4 py-3 font-bold">戻る</button>
            <button disabled={saving || !userId || (!mealPlanId && mealPlanCount >= getLimitByPlan(userRole, userPlan, "mealPlan"))} className="recipe-accent-button flex-1 rounded-2xl px-4 py-3 font-black disabled:opacity-50">{saving ? "保存中…" : "保存する"}</button>
          </div>
        </form>
      </div>
    </main>
  );
}
