export const RECIPE_CATEGORIES = [
  "主菜",
  "副菜",
  "汁物",
  "ご飯もの",
  "麺類",
  "パン",
  "朝食",
  "お弁当",
  "作り置き",
  "デザート",
  "その他",
] as const;

export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];
