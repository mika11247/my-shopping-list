"use client";

import Header from "@/components/Header";
import { getLimitByPlan } from "@/lib/planLimits";
import { supabase } from "@/lib/supabase";
import { useAppTheme } from "@/lib/useAppTheme";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type DisplayPlan = "free" | "special" | "pro";
type LimitType =
  | "list"
  | "memo"
  | "master"
  | "group"
  | "member"
  | "history"
  | "recipe"
  | "mealPlan";

type FeatureGroup = {
  title: string;
  items: Array<{ label: string; value: string }>;
};

const PLAN_DETAILS: Record<
  DisplayPlan,
  {
    emoji: string;
    name: string;
    label: string;
    badge: string;
    description: string;
  }
> = {
  free: {
    emoji: "🌱",
    name: "Free",
    label: "基本プラン",
    badge: "無料",
    description:
      "まずはここから。買い物リスト・レシピ・献立を気軽に試せる基本プランです。",
  },
  special: {
    emoji: "🌙",
    name: "Special",
    label: "β協力者特典",
    badge: "無料特典",
    description:
      "β版に協力してくださる方向けの無料特典プランです。登録上限とカスタマイズ機能が広がります。",
  },
  pro: {
    emoji: "✨",
    name: "Pro",
    label: "正式プラン",
    badge: "準備中",
    description:
      "たくさん登録したい方や、家族との共有をより活用したい方向けに準備中の正式プランです。",
  },
};

const CUSTOMIZATION_ITEMS = [
  "all表示モード",
  "テーマ変更",
  "文字サイズ変更",
  "表示密度変更",
  "画像拡大表示",
];

function limit(plan: DisplayPlan, type: LimitType) {
  return getLimitByPlan("user", plan, type);
}

function getFeatureGroups(plan: DisplayPlan): FeatureGroup[] {
  return [
    {
      title: "基本機能",
      items: [
        { label: "買い物リスト", value: `${limit(plan, "list")}件` },
        { label: "一時メモ", value: `${limit(plan, "memo")}件` },
        { label: "マイアイテム", value: `${limit(plan, "master")}件` },
        { label: "購入履歴", value: `${limit(plan, "history")}件` },
      ],
    },
    {
      title: "共有機能",
      items: [
        { label: "共有リスト", value: `${limit(plan, "group")}個` },
        {
          label: "共有メンバー",
          value: `1リストあたり${limit(plan, "member")}人`,
        },
      ],
    },
    {
      title: "レシピ・献立",
      items: [
        { label: "レシピノート", value: `${limit(plan, "recipe")}件` },
        { label: "献立リスト", value: `${limit(plan, "mealPlan")}件` },
      ],
    },
  ];
}

export default function UpgradePage() {
  const router = useRouter();
  const theme = useAppTheme();
  const [currentPlan, setCurrentPlan] = useState<DisplayPlan | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    const fetchCurrentPlan = async () => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (!active) return;

      if (authError || !user) {
        router.replace("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, plan")
        .eq("user_id", user.id)
        .single();

      if (!active) return;

      if (profileError) {
        console.error("プロフィール取得エラー:", profileError);
        setErrorMessage("現在のプランを取得できませんでした。");
        setLoading(false);
        return;
      }

      const admin = profile?.role === "admin";
      const profilePlan = profile?.plan;
      const displayPlan: DisplayPlan = admin
        ? "pro"
        : profilePlan === "special" || profilePlan === "pro"
          ? profilePlan
          : "free";

      setIsAdmin(admin);
      setCurrentPlan(displayPlan);
      setLoading(false);
    };

    void fetchCurrentPlan();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className={`recipe-page ${theme} min-h-screen p-4`}>
      <div className="mx-auto max-w-6xl space-y-5">
        <Header subtitle="Upgrade" title="プランについて ✨" />

        <section className="overflow-hidden rounded-[2rem] border border-sky-100/80 bg-gradient-to-br from-indigo-50 via-white to-lime-50 shadow-sm">
          <div className="px-6 py-10 sm:px-10 sm:py-14">
            <p className="text-[11px] font-black tracking-[0.24em] text-indigo-400">
              MY SHOPPING LIST
            </p>
            <h1 className="mt-4 text-3xl font-black leading-[1.45] tracking-tight text-neutral-800 sm:text-4xl">
              毎日の買い物を、
              <br />
              もっと自分らしく。
            </h1>
            <p className="mt-5 text-sm leading-7 text-neutral-600 sm:text-base">
              あなたの暮らしに合わせて、
              <br />
              Free・Special・Proから選べます。
            </p>
          </div>
        </section>

        <section className="recipe-card rounded-3xl border p-5 shadow-sm sm:px-6">
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 rounded-full bg-amber-100 px-2.5 py-1 text-sm"
              aria-hidden="true"
            >
              🌱
            </span>
            <div className="min-w-0">
              <h2 className="font-black">β版のプランについて</h2>
              <p className="mt-2 text-sm leading-7 opacity-75">
                β版での利用状況やご意見をもとに、機能と上限を調整する場合があります。
                Freeでも日々の買い物・レシピ・献立をお使いいただけます。
              </p>
            </div>
          </div>
        </section>

        {loading ? (
          <section
            className="recipe-card rounded-3xl border p-8 text-center shadow-sm"
            aria-live="polite"
          >
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-current border-r-transparent opacity-50" />
            <p className="mt-4 text-sm font-bold">プラン情報を読み込み中…</p>
          </section>
        ) : errorMessage || !currentPlan ? (
          <section
            className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700 shadow-sm"
            role="alert"
          >
            {errorMessage || "現在のプランを確認できませんでした。"}
          </section>
        ) : (
          <>
            <div
              className="recipe-card rounded-2xl border px-4 py-3 text-sm shadow-sm"
              aria-live="polite"
            >
              現在のプラン：
              <strong className="ml-1">
                {PLAN_DETAILS[currentPlan].name}
                {isAdmin ? "（管理者・Pro相当）" : ""}
              </strong>
            </div>

            <section className="grid min-w-0 gap-5 lg:grid-cols-3">
              {(["free", "special", "pro"] as const).map((plan) => (
                <PlanCard
                  key={plan}
                  plan={plan}
                  currentPlan={currentPlan}
                />
              ))}
            </section>
          </>
        )}

        <div className="grid grid-cols-1 gap-2 pb-6 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => router.push("/profile")}
            className="recipe-accent-button rounded-2xl px-4 py-3 text-sm font-bold shadow-sm"
          >
            マイページへ戻る
          </button>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="recipe-card rounded-2xl border px-4 py-3 text-sm font-bold shadow-sm"
          >
            TOPへ戻る
          </button>
        </div>
      </div>
    </main>
  );
}

function PlanCard({
  plan,
  currentPlan,
}: {
  plan: DisplayPlan;
  currentPlan: DisplayPlan;
}) {
  const details = PLAN_DETAILS[plan];
  const isCurrent = plan === currentPlan;
  const styles = {
    free: {
      card: "border-neutral-200 bg-neutral-50",
      header: "border-neutral-200 bg-white text-neutral-800",
      badge: "bg-neutral-200 text-neutral-700",
      group: "border-neutral-200 bg-white/90",
      title: "text-neutral-600",
      value: "text-neutral-800",
      button: "bg-neutral-200 text-neutral-700",
      currentBadge: "bg-neutral-200 text-neutral-700 ring-neutral-300",
      currentRing: "ring-neutral-300",
    },
    special: {
      card: "border-sky-200 bg-sky-50",
      header: "border-sky-200 bg-white/90 text-sky-900",
      badge: "bg-sky-200 text-sky-800",
      group: "border-sky-200 bg-white/80",
      title: "text-sky-700",
      value: "text-sky-900",
      button: "bg-sky-200 text-sky-800",
      currentBadge: "bg-sky-200 text-sky-800 ring-sky-300",
      currentRing: "ring-sky-300",
    },
    pro: {
      card: "border-violet-200 bg-violet-50",
      header: "border-violet-200 bg-white/90 text-violet-900",
      badge: "bg-violet-200 text-violet-800",
      group: "border-violet-200 bg-white/80",
      title: "text-violet-700",
      value: "text-violet-900",
      button: "bg-violet-200 text-violet-800",
      currentBadge: "bg-violet-200 text-violet-800 ring-violet-300",
      currentRing: "ring-violet-300",
    },
  }[plan];

  let buttonLabel = "Freeプラン";
  if (plan === "pro") {
    buttonLabel = "Stripe連携準備中";
  } else if (isCurrent) {
    buttonLabel = "現在のプラン";
  } else if (plan === "special" && currentPlan === "free") {
    buttonLabel = "β協力者特典";
  } else if (plan === "special") {
    buttonLabel = "Specialプラン";
  }

  return (
    <article
      className={`min-w-0 rounded-3xl border p-4 shadow-sm sm:p-5 ${styles.card} ${
        isCurrent ? `ring-2 ring-offset-2 ${styles.currentRing}` : ""
      }`}
    >
      <div className={`rounded-2xl border p-4 ${styles.header}`}>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-2xl" aria-hidden="true">
              {details.emoji}
            </span>
            <h2 className="mt-1 text-xl font-black">{details.name}</h2>
            <p className="mt-1 text-xs font-bold opacity-70">{details.label}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {isCurrent && (
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${styles.currentBadge}`}
              >
                {details.emoji} 現在のプラン
              </span>
            )}
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${styles.badge}`}
            >
              {details.badge}
            </span>
          </div>
        </div>
        <p className="mt-3 text-xs leading-6 opacity-80">
          {details.description}
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {getFeatureGroups(plan).map((group) => (
          <FeatureGroup key={group.title} group={group} styles={styles} />
        ))}

        {plan !== "free" && (
          <div className={`rounded-2xl border p-3 ${styles.group}`}>
            <h3 className={`text-xs font-black ${styles.title}`}>
              カスタマイズ
            </h3>
            <ul className="mt-2 grid gap-1.5 text-xs">
              {CUSTOMIZATION_ITEMS.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span aria-hidden="true">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {plan === "pro" && (
          <div className="rounded-2xl border border-dashed border-violet-300 bg-violet-100/60 p-3">
            <h3 className="text-xs font-black text-violet-800">
              今後追加予定
            </h3>
            <ul className="mt-2 space-y-1 text-xs text-violet-800">
              <li>・CSV機能</li>
              <li>・画像管理</li>
            </ul>
          </div>
        )}
      </div>

      <button
        type="button"
        disabled
        className={`mt-4 w-full cursor-not-allowed rounded-2xl px-4 py-3 text-sm font-black opacity-80 ${styles.button}`}
      >
        {buttonLabel}
      </button>
    </article>
  );
}

function FeatureGroup({
  group,
  styles,
}: {
  group: FeatureGroup;
  styles: { group: string; title: string; value: string };
}) {
  return (
    <div className={`rounded-2xl border p-3 ${styles.group}`}>
      <h3 className={`text-xs font-black ${styles.title}`}>{group.title}</h3>
      <dl className="mt-2 space-y-2">
        {group.items.map((item) => (
          <div
            key={item.label}
            className="flex min-w-0 items-baseline justify-between gap-3 text-xs"
          >
            <dt className="min-w-0 text-neutral-600">{item.label}</dt>
            <dd className={`shrink-0 font-black ${styles.value}`}>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
