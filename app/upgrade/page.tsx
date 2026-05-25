"use client";

import Header from "@/components/Header";
import { useRouter } from "next/navigation";

export default function UpgradePage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-lime-50 p-4">
      <div className="mx-auto max-w-xl space-y-5">
        <Header subtitle="Upgrade" title="プランについて 🌙" />

        <section className="overflow-hidden rounded-3xl border border-indigo-100 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-indigo-50 via-sky-50 to-lime-50 p-5">
            <p className="text-xs font-bold tracking-[0.2em] text-indigo-400">
              MY SHOPPING LIST
            </p>

            <h2 className="mt-2 text-2xl font-bold text-neutral-800">
              毎日の買い物を、もっと自分らしく。
            </h2>

            <p className="mt-3 text-sm leading-7 text-neutral-600">
              My Shopping List は、無料でも毎日しっかり使えることを大切にしています。
              <br />
              プランは「機能を奪うため」ではなく、
              もっと快適に、もっと自分好みに使うための仕組みです。
            </p>
          </div>

          <div className="p-5">
            <div className="rounded-2xl bg-lime-50 p-4 ring-1 ring-lime-100">
              <p className="text-sm font-bold text-lime-700">
                🌱 現在β版として育成中です
              </p>

              <p className="mt-2 text-xs leading-6 text-neutral-600">
                Specialプランは、β版にご協力いただいている方への無料特典です。
                将来的には、よりたくさん使いたい方向けに Pro プランを用意していく予定です。
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <PlanCard
            emoji="🆓"
            name="Free"
            label="基本プラン"
            badge="無料"
            tone="free"
            lead="まずはここから。毎日の買い物メモとして十分使えるプランです。"
            items={[
              "買い物リスト 50件",
              "一時メモ 30件",
              "My items 30件",
              "共有リスト 1個",
              "メンバー 2人",
              "履歴 50件",
            ]}
          />

          <PlanCard
            emoji="🌙"
            name="Special"
            label="β協力者特典"
            badge="β特典 / 無料"
            tone="special"
            lead="β版に協力してくださる方向けの特典プランです。自分好みに使いやすくできます。"
            items={[
              "買い物リスト 80件",
              "一時メモ 50件",
              "My items 50件",
              "all表示モード",
              "テーマ変更",
              "文字サイズ変更",
              "表示密度変更",
              "画像拡大表示",
            ]}
          />

          <PlanCard
            emoji="✨"
            name="Pro"
            label="今後追加予定の正式プラン"
            badge="準備中"
            tone="pro"
            lead="たくさん使いたい方、共有や履歴をしっかり活用したい方向けに準備中です。"
            items={[
              "買い物リスト 200件",
              "一時メモ 200件",
              "My items 200件",
              "共有リスト 3個",
              "メンバー 5人",
              "履歴 200件",
              "CSV機能（予定）",
              "画像管理（予定）",
            ]}
          />
        </section>

        <section className="rounded-3xl border border-amber-100 bg-amber-50 p-5 shadow-sm">
          <h2 className="text-base font-bold text-amber-800">
            🌙 プラン内容について
          </h2>

          <p className="mt-2 text-sm leading-7 text-amber-700">
            プラン内容や上限は、β版での使いやすさを見ながら調整する場合があります。
            無料でも使いやすく、必要な方にはもっと快適に使っていただける形を目指しています。
          </p>
        </section>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => router.push("/profile")}
            className="rounded-2xl bg-neutral-800 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:scale-[1.01]"
          >
            マイページへ戻る
          </button>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-neutral-700 shadow-sm ring-1 ring-neutral-200 transition hover:scale-[1.01]"
          >
            TOPへ戻る
          </button>
        </div>
      </div>
    </main>
  );
}

function PlanCard({
  emoji,
  name,
  label,
  badge,
  lead,
  items,
  tone,
}: {
  emoji: string;
  name: string;
  label: string;
  badge: string;
  lead: string;
  items: string[];
  tone: "free" | "special" | "pro";
}) {
  const styles = {
    free: {
      card: "border-neutral-200 bg-white",
      head: "bg-neutral-50 text-neutral-700 ring-neutral-100",
      badge: "bg-neutral-100 text-neutral-600",
      item: "bg-white text-neutral-700 ring-neutral-100",
    },
    special: {
      card: "border-sky-200 bg-sky-50",
      head: "bg-white text-sky-700 ring-sky-100",
      badge: "bg-sky-100 text-sky-700",
      item: "bg-white/80 text-sky-800 ring-sky-100",
    },
    pro: {
      card: "border-violet-200 bg-violet-50",
      head: "bg-white text-violet-700 ring-violet-100",
      badge: "bg-violet-100 text-violet-700",
      item: "bg-white/80 text-violet-800 ring-violet-100",
    },
  }[tone];

  return (
    <article className={`rounded-3xl border p-5 shadow-sm ${styles.card}`}>
      <div className={`rounded-2xl p-4 ring-1 ${styles.head}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-2xl">{emoji}</p>

            <h2 className="mt-1 text-xl font-bold">
              {name}
            </h2>

            <p className="mt-1 text-xs font-medium opacity-80">
              {label}
            </p>
          </div>

          <span className={`rounded-full px-3 py-1 text-xs font-bold ${styles.badge}`}>
            {badge}
          </span>
        </div>

        <p className="mt-3 text-xs leading-6 opacity-80">
          {lead}
        </p>
      </div>

      <div className="mt-4 grid gap-2">
        {items.map((item) => (
          <p
            key={item}
            className={`rounded-2xl px-3 py-2 text-sm shadow-sm ring-1 ${styles.item}`}
          >
            {item}
          </p>
        ))}
      </div>
    </article>
  );
}