"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function GuidePage() {
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <main className="min-h-screen bg-orange-50 p-4">
      <div className="mx-auto max-w-xl space-y-4">

      <div className="flex items-center gap-2">
  <button
    type="button"
    onClick={() => setIsMenuOpen(true)}
    className="rounded-xl bg-white px-3 py-2 text-xs text-gray-600 shadow ring-1 ring-gray-200"
  >
    ☰
  </button>

  <button
    onClick={() => router.back()}
    className="w-fit rounded-full bg-orange-100 px-3 py-1 text-xs text-orange-600 shadow ring-1 ring-orange-200 hover:bg-orange-200"
  >
    ← 戻る
  </button>
</div>

        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-orange-100">
          <p className="mb-2 text-3xl">🛒</p>
          <h1 className="text-2xl font-bold text-orange-500">
            使い方ガイド
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">
            My Shopping List の基本的な使い方をまとめました。
            よく買うものを登録して、買い物をもっとラクにしましょう。
          </p>
        </div>

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-orange-100">
          <h2 className="mb-4 border-l-4 border-orange-400 pl-3 font-bold text-orange-500">
            基本の流れ
          </h2>

          <div className="space-y-3">
            <GuideItem icon="➕" title="アイテムを追加" text="買いたいものを入力してリストに追加します。" />
            <GuideItem icon="✅" title="買ったらチェック" text="買い物が終わったらチェックして管理できます。" />
            <GuideItem icon="🗑️" title="不要なら削除" text="もういらないアイテムは削除できます。" />
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-orange-100">
          <h2 className="mb-4 border-l-4 border-orange-400 pl-3 font-bold text-orange-500">
            便利な機能
          </h2>

          <div className="grid gap-3">
            <GuideItem icon="🔍" title="検索から追加" text="よく使うアイテムは検索してすぐ追加できます。" />
            <GuideItem icon="💖" title="My items" text="自分用の候補アイテムを編集・管理できます。" />
            <GuideItem icon="🕒" title="履歴" text="削除したアイテムをあとから確認できます。" />
            <GuideItem icon="👤" title="My page" text="メール確認やパスワードリセットができます。" />
          </div>
        </section>

        <section className="rounded-3xl bg-orange-100 p-5 shadow-sm ring-1 ring-orange-200">
          <h2 className="mb-2 font-bold text-orange-700">ワンポイント 🍊</h2>
          <p className="text-sm leading-relaxed text-orange-800">
            よく買うものは My items に登録しておくと、次回から検索でサッと追加できます。
            チェック済みのものは、買い物後に整理するとリストが見やすくなります。
          </p>
        </section>
      </div>

      {isMenuOpen && (
  <div
    className="fixed inset-0 z-50 bg-black/30"
    onClick={() => setIsMenuOpen(false)}
  >
    <div
      className="ml-auto h-full w-72 bg-white p-5 shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-5 flex items-center justify-between">
        <p className="text-lg font-bold text-gray-800">
          メニュー
        </p>

        <button
          type="button"
          onClick={() => setIsMenuOpen(false)}
          className="rounded-full bg-gray-100 px-3 py-1 text-gray-500"
        >
          ×
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {[
          ["TOP", "/"],
          ["My page 👤", "/profile"],
          ["My items 💖", "/master"],
          ["履歴 🕒", "/history"],
          ["ガイド ❓", "/guide"],
          ["プライバシー 🔐", "/privacy"],
          ["免責事項 ⚠️", "/disclaimer"],
        ].map(([label, path]) => (
          <button
            key={path}
            type="button"
            onClick={() => {
              setIsMenuOpen(false);
              router.push(path);
            }}
            className="rounded-xl bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  </div>
)}

    </main>
  );
}

function GuideItem({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-3 rounded-2xl bg-orange-50 p-4 ring-1 ring-orange-100">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-xl shadow-sm">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-bold text-gray-700">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-gray-500">{text}</p>
      </div>
    </div>
  );
}