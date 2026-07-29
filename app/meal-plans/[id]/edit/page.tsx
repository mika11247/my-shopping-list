import MealPlanForm from "@/components/meal-plans/MealPlanForm";

export default async function EditMealPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MealPlanForm mealPlanId={id} />;
}
