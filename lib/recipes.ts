export type RecipeItemType = "ingredient" | "seasoning";

export type ItemMaster = {
  id: number;
  source: "common" | "user";
  name: string;
  yomi: string | null;
  category: string | null;
  image_url: string | null;
};

export type RecipeItem = {
  id: number;
  recipe_id: string;
  item_master_id: number | null;
  user_item_master_id: number | null;
  item_type: RecipeItemType;
  amount_text: string;
  sort_order: number;
  item_master: Omit<ItemMaster, "source"> | null;
  user_item_master: Omit<ItemMaster, "source"> | null;
};

export const getRecipeItemMaster = (item: RecipeItem): ItemMaster => {
  if (item.user_item_master) {
    return { ...item.user_item_master, source: "user" };
  }
  if (item.item_master) {
    return { ...item.item_master, source: "common" };
  }
  throw new Error("材料のマスター情報を取得できません。");
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
  category: string | null;
  servings: number | null;
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
