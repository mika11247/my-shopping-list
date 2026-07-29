export type RecipeItemType = "ingredient" | "seasoning";

export type ItemMaster = {
  id: number;
  name: string;
  yomi: string | null;
  category: string | null;
  image_url: string | null;
};

export type RecipeItem = {
  id: number;
  recipe_id: string;
  item_master_id: number;
  item_type: RecipeItemType;
  amount_text: string;
  sort_order: number;
  item_master: ItemMaster;
};

export type Recipe = {
  id: string;
  user_id: string;
  name: string;
  image_url: string | null;
  image_path: string | null;
  source_url: string | null;
  instructions: string | null;
  memo: string | null;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  recipe_items?: RecipeItem[];
};

export const isHttpUrl = (value: string) => {
  if (!value.trim()) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

export const recipeImagePublicUrl = (path: string, supabaseUrl: string) =>
  `${supabaseUrl}/storage/v1/object/public/recipe-images/${path}`;
