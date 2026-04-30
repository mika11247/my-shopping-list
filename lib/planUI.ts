export const getPlanLabel = (plan: string) => {
    switch (plan) {
      case "pro":
        return "Pro会員";
      case "beta":
        return "β版会員";
      case "special":
        return "スペシャル会員";
      case "early_supporter":
        return "特別会員";
      default:
        return "無料会員";
    }
  };
  
  export const getPlanColor = (plan: string) => {
    switch (plan) {
      case "pro":
        return "text-yellow-600";
      case "beta":
        return "text-blue-600";
      case "special":
        return "text-purple-600";
      case "early_supporter":
        return "text-purple-600";
      default:
        return "text-lime-700";
    }
  };