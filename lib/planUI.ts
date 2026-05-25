export const getPlanLabel = (plan: string) => {
  switch (plan) {
    case "pro":
      return "Pro会員";

    case "special":
      return "Special会員";

    default:
      return "無料会員";
  }
};

export const getPlanColor = (plan: string) => {
  switch (plan) {
    case "pro":
      return "text-violet-600";

    case "special":
      return "text-sky-600";

    default:
      return "text-lime-700";
  }
};