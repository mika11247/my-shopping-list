import MealPlanDetail from "@/components/meal-plans/MealPlanDetail";

export default async function MealPlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MealPlanDetail mealPlanId={id} />;
}
