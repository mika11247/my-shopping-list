import type { Recipe } from "@/lib/recipes";

export type MealType = "breakfast" | "lunch" | "dinner";

export const MEAL_TYPES: Array<{ value: MealType; label: string }> = [
  { value: "breakfast", label: "朝" },
  { value: "lunch", label: "昼" },
  { value: "dinner", label: "夜" },
];

export type MealPlanEntry = {
  id: number;
  meal_plan_id: string;
  meal_date: string;
  meal_type: MealType;
  recipe_id: string | null;
  title: string;
  sort_order: number;
  recipe: Pick<Recipe, "id" | "name" | "image_url" | "servings"> | null;
};

export type MealPlan = {
  id: string;
  user_id: string;
  group_id: string | null;
  name: string;
  start_date: string;
  end_date: string;
  servings: number | null;
  created_at: string;
  updated_at: string;
  groups?: { id: string; name: string } | null;
  meal_plan_entries?: MealPlanEntry[];
};

export type GroupOption = { id: string; name: string };

export const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
};

export const createWeek = (startDate: string) =>
  Array.from({ length: 7 }, (_, index) => addDays(startDate, index));

export const formatMealDate = (date: string, withYear = false) =>
  new Intl.DateTimeFormat("ja-JP", {
    ...(withYear ? { year: "numeric" as const } : {}),
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${date}T00:00:00`));
