"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PrivacyPage() {
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <main className="min-h-screen bg-purple-50 p-4">
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
    className="rounded-full bg-purple-100 px-3 py-1 text-xs text-purple-600 shadow ring-1 ring-purple-200 hover:bg-purple-200"
  >
    ← 戻る
  </button>
</div>

        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-purple-100">
          <p className="mb-2 text-3xl">🔐</p>
          <h1 className="text-2xl font-bold text-purple-500">
            プライバシーポリシー
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            My Shopping List における個人情報の取り扱いについて定めます。
          </p>
        </div>

        <Section title="1. 取得する情報">
          本アプリでは、ログイン機能のためにメールアドレスを取得します。
          また、ユーザーが入力した買い物リスト、カテゴリ、メモ等の情報を保存します。
        </Section>

        <Section title="2. 利用目的">
          取得した情報は、ログイン認証、買い物リスト機能の提供、
          ユーザーごとのデータ管理、サービス改善のために利用します。
        </Section>

        <Section title="3. 外部サービスの利用">
          本アプリでは、認証およびデータ保存のために Supabase を利用しています。
          入力された情報は、Supabase のデータベースに保存されます。
        </Section>

        <Section title="4. 第三者提供について">
          法令に基づく場合を除き、取得した個人情報を本人の同意なく第三者へ提供することはありません。
        </Section>

        <Section title="5. 安全管理">
          取得した情報は、適切な方法で管理し、不正アクセス、紛失、漏えい等の防止に努めます。
        </Section>

        <Section title="6. データの削除について">
          ユーザーから削除の希望があった場合、本人確認のうえ、可能な範囲で対応します。
        </Section>

        <Section title="7. プライバシーポリシーの変更">
          本ポリシーは、必要に応じて内容を変更することがあります。
          変更後の内容は、本ページに掲載した時点で適用されます。
        </Section>

        <Section title="8. お問い合わせ">
          本ポリシーに関するお問い合わせは、運営者までご連絡ください。
        </Section>

        <p className="text-center text-xs text-gray-400">
          制定日：2026年4月27日
        </p>
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-purple-100">
      <h2 className="mb-2 border-l-4 border-purple-400 pl-3 font-bold text-purple-500">
        {title}
      </h2>
      <p className="text-sm leading-relaxed text-gray-600">{children}</p>
    </section>
  );
}