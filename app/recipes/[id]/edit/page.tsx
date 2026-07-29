import RecipeForm from "@/components/recipes/RecipeForm";

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecipeForm recipeId={id} />;
}
