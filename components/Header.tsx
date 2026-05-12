"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type HeaderProps = {
  title: string;
  subtitle?: string;
  userName?: string;
};

export default function Header({
  title,
  subtitle,
  userName,
}: HeaderProps) {
  const router = useRouter();

  const [isMenuOpen, setIsMenuOpen] =
    useState(false);

    const handleLogout = async () => {
      await supabase.auth.signOut();
      window.location.href = "/login";
    };

  return (
    <>
      <header className="mb-6 flex items-center justify-between">
      <div>
  {subtitle && (
    <p className="mb-1 text-sm font-medium text-neutral-500">
      {subtitle}
    </p>
  )}

  <h1 className="text-2xl font-bold text-neutral-900">
    {title}
  </h1>

  {userName && (
    <p className="mt-1 text-xs text-neutral-500">
      ログイン中：{userName}様
    </p>
  )}
</div>

        <div className="flex items-center gap-2">
        <button
  type="button"
  onClick={() => setIsMenuOpen(true)}
  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-lg text-neutral-700 shadow-sm"
>
  ☰
</button>

<button
  type="button"
  onClick={() => alert("テーマ切替は今後追加予定です")}
  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-lg text-neutral-700 shadow-sm"
>
  🌙
</button>
        </div>
      </header>

      {isMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/30"
          onClick={() => setIsMenuOpen(false)}
        >
          <div
            className="ml-auto h-full w-72 bg-white p-5 shadow-xl"
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            <div className="mb-5 flex items-center justify-between">
              <p className="text-lg font-bold text-gray-800">
                メニュー
              </p>

              <button
                type="button"
                onClick={() =>
                  setIsMenuOpen(false)
                }
                className="rounded-full bg-gray-100 px-3 py-1 text-gray-500"
              >
                ×
              </button>
            </div>

            <div className="flex flex-col gap-2">
             
                {[
  ["TOP", "/"],
  ["マイページ 👤", "/profile"],
  ["マイアイテム 💖", "/master"],
  ["履歴 🕒", "/history"],
  ["ガイド ❓", "/guide"],
  ["お問い合わせ 📩", "/contact"],
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

<button
  type="button"
  onClick={handleLogout}
  className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-left text-sm font-medium text-red-500 hover:bg-red-100"
>
  ログアウト
</button>

            </div>
          </div>
        </div>
      )}
    </>
  );
}