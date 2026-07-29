export const getLimitByPlan = (
  role: string,
  plan: string,
  type:
    | "list"
    | "memo"
    | "master"
    | "group"
    | "member"
    | "history"
    | "recipe"
    | "mealPlan"
) => {
  if (role === "admin") return 9999;

  switch (type) {
    case "list":
      if (plan === "pro") return 200;
      if (plan === "special") return 80;
      return 50;

    case "memo":
      if (plan === "pro") return 200;
      if (plan === "special") return 50;
      return 30;

    case "master":
      if (plan === "pro") return 200;
      if (plan === "special") return 50;
      return 30;

    case "group":
      if (plan === "pro") return 3;
      if (plan === "special") return 1;
      return 1;

    case "member":
      if (plan === "pro") return 5;
      if (plan === "special") return 2;
      return 2;

    case "history":
      if (plan === "pro") return 200;
      if (plan === "special") return 80;
      return 50;

    case "recipe":
      if (plan === "pro") return 500;
      if (plan === "special") return 50;
      return 20;

    case "mealPlan":
      if (plan === "pro") return 100;
      if (plan === "special") return 10;
      return 3;

    default:
      return 50;
  }
};
