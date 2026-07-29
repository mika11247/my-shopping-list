"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type HeaderProps = {
  title: string;
  subtitle?: string;
  userName?: string;
  defaultTheme?: "lime" | "pink" | "sky" | "orange" | "purple";
};

export default function Header({
  title,
  subtitle,
  userName,
  defaultTheme = "lime",
}: HeaderProps) {
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] =
  useState(false);

  const [theme, setTheme] = useState("default");
const [fontSize, setFontSize] = useState("normal");
const [density, setDensity] = useState("normal");

const [userPlan, setUserPlan] =
  useState("free");

  useEffect(() => {
  const savedTheme =
    localStorage.getItem("theme") ?? "default";

  const savedFontSize =
    localStorage.getItem("fontSize") ?? "normal";

  const savedDensity =
    localStorage.getItem("density") ?? "normal";

  const savedPlan =
    localStorage.getItem("plan") ?? "free";

  setTheme(savedTheme);
  setFontSize(savedFontSize);
  setDensity(savedDensity);
  setUserPlan(savedPlan);
}, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const menuItems = [
    ["🛒 買い物リスト", "/"],
    ["👥 個人・共有", "/"],
    ["📦 共通アイテム", "/"],
    ["❤️ マイアイテム", "/master"],
    ["🍽 献立リスト", "/meal-plans"],
    ["📖 レシピノート", "/recipes"],
    ["マイページ 👤", "/profile"],
    ["履歴 🕒", "/history"],
    ["ガイド ❓", "/guide"],
    ["お問い合わせ 📩", "/contact"],
    ["プライバシー 🔐", "/privacy"],
    ["免責事項 ⚠️", "/disclaimer"],
  ];

  const changeTheme = (newTheme: string) => {
  setTheme(newTheme);
  localStorage.setItem("theme", newTheme);

  window.dispatchEvent(
    new CustomEvent("theme-change", {
      detail: newTheme,
    })
  );
};

const changeFontSize = (size: string) => {
  setFontSize(size);

  localStorage.setItem("fontSize", size);

  const root = document.documentElement;

  const sizes = {
    small: {
      item: "13px",
      meta: "11px",
      button: "13px",
    },

    normal: {
      item: "14px",
      meta: "12px",
      button: "14px",
    },

    large: {
      item: "16px",
      meta: "13px",
      button: "15px",
    },
  };

  const current =
    sizes[size as keyof typeof sizes] ??
    sizes.normal;

  root.style.setProperty(
    "--font-item",
    current.item
  );

  root.style.setProperty(
    "--font-meta",
    current.meta
  );

  root.style.setProperty(
    "--font-button",
    current.button
  );
};

const changeDensity = (value: string) => {
  setDensity(value);

  localStorage.setItem("density", value);

  const root = document.documentElement;

  const densities = {
    compact: {
      itemPadding: "8px",
      iconSize: "32px",
      itemGap: "8px",
    },

    normal: {
      itemPadding: "12px",
      iconSize: "40px",
      itemGap: "12px",
    },
  };

  const current =
    densities[value as keyof typeof densities] ??
    densities.normal;

  root.style.setProperty(
    "--item-padding",
    current.itemPadding
  );

  root.style.setProperty(
    "--icon-size",
    current.iconSize
  );

  root.style.setProperty(
    "--item-gap",
    current.itemGap
  );
};

  return (
    <>
      <header
  className="mb-6 overflow-hidden rounded-3xl bg-white/80 shadow-sm backdrop-blur"
  style={{
    border: `1px solid ${
      theme === "lime"
        ? "#d9f99d"
        : theme === "pink"
        ? "#fbcfe8"
        : theme === "sky"
        ? "#bae6fd"
        : theme === "orange"
        ? "#fed7aa"
        : theme === "purple"
        ? "#ddd6fe"
        : defaultTheme === "pink"
        ? "#fbcfe8"
        : defaultTheme === "sky"
        ? "#bae6fd"
        : defaultTheme === "orange"
        ? "#fed7aa"
        : defaultTheme === "purple"
        ? "#ddd6fe"
        : "#d9f99d"
    }`,
  }}
>
  <div
    className="p-4"
    style={{
      background:
        theme === "lime"
          ? "linear-gradient(to bottom right, #ecfccb, #ffffff, #bae6fd)"

          : theme === "pink"
          ? "linear-gradient(to bottom right, #fce7f3, #ffffff, #e9d5ff)"

          : theme === "sky"
          ? "linear-gradient(to bottom right, #e0f2fe, #ffffff, #d1fae5)"

          : theme === "orange"
          ? "linear-gradient(to bottom right, #fff7ed, #ffffff, #fde68a)"

          : theme === "purple"
          ? "linear-gradient(to bottom right, #f3e8ff, #ffffff, #fbcfe8)"

          : defaultTheme === "pink"
          ? "linear-gradient(to bottom right, #fce7f3, #ffffff, #e9d5ff)"

          : defaultTheme === "sky"
          ? "linear-gradient(to bottom right, #e0f2fe, #ffffff, #d1fae5)"

          : defaultTheme === "orange"
          ? "linear-gradient(to bottom right, #fff7ed, #ffffff, #fde68a)"

          : defaultTheme === "purple"
          ? "linear-gradient(to bottom right, #f3e8ff, #ffffff, #fbcfe8)"

          : "linear-gradient(to bottom right, #ecfccb, #ffffff, #bae6fd)",
    }}
  >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              {subtitle && (
                <p className="mb-1 text-xs font-bold tracking-[0.18em] text-neutral-400">
                  {subtitle}
                </p>
              )}

              <h1 className="truncate text-2xl font-black tracking-tight text-neutral-900">
                {title}
              </h1>

              {userName && (
                <p className="mt-1 truncate text-xs text-neutral-500">
                  ログイン中：{userName}様
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white bg-white/90 text-lg text-neutral-700 shadow-sm transition hover:scale-105"
style={{
  backgroundColor: "rgba(255,255,255,0.9)",
}}
onMouseEnter={(e) => {
  e.currentTarget.style.backgroundColor =
    theme === "lime"
      ? "#f7fee7"
      : theme === "pink"
      ? "#fdf2f8"
      : theme === "sky"
      ? "#f0f9ff"
      : theme === "orange"
      ? "#fff7ed"
      : theme === "purple"
      ? "#faf5ff"
      : "#f7fee7";
}}
onMouseLeave={(e) => {
  e.currentTarget.style.backgroundColor =
    "rgba(255,255,255,0.9)";
}}
                aria-label="設定"
              >
                🌙
              </button>

              <button
                type="button"
                onClick={() => setIsMenuOpen(true)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white bg-white/90 text-lg text-neutral-700 shadow-sm transition hover:scale-105"
style={{
  backgroundColor: "rgba(255,255,255,0.9)",
}}
onMouseEnter={(e) => {
  e.currentTarget.style.backgroundColor =
    theme === "lime"
      ? "#f7fee7"
      : theme === "pink"
      ? "#fdf2f8"
      : theme === "sky"
      ? "#f0f9ff"
      : theme === "orange"
      ? "#fff7ed"
      : theme === "purple"
      ? "#faf5ff"
      : "#f7fee7";
}}
onMouseLeave={(e) => {
  e.currentTarget.style.backgroundColor =
    "rgba(255,255,255,0.9)";
}}
                aria-label="メニューを開く"
              >
                ☰
              </button>
            </div>
          </div>
        </div>
      </header>

      {isMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm"
          onClick={() => setIsMenuOpen(false)}
        >
          <div
  className="ml-auto h-full w-80 max-w-[85vw] overflow-y-auto p-5 shadow-2xl"
  style={{
    background:
      theme === "lime"
        ? "linear-gradient(to bottom, #f7fee7, #ffffff)"

        : theme === "pink"
        ? "linear-gradient(to bottom, #fdf2f8, #ffffff)"

        : theme === "sky"
        ? "linear-gradient(to bottom, #f0f9ff, #ffffff)"

        : theme === "orange"
        ? "linear-gradient(to bottom, #fff7ed, #ffffff)"

        : theme === "purple"
        ? "linear-gradient(to bottom, #faf5ff, #ffffff)"

        : defaultTheme === "pink"
        ? "linear-gradient(to bottom, #fdf2f8, #ffffff)"

        : defaultTheme === "sky"
        ? "linear-gradient(to bottom, #f0f9ff, #ffffff)"

        : defaultTheme === "orange"
        ? "linear-gradient(to bottom, #fff7ed, #ffffff)"

        : defaultTheme === "purple"
        ? "linear-gradient(to bottom, #faf5ff, #ffffff)"

        : "linear-gradient(to bottom, #f7fee7, #ffffff)",
  }}
  onClick={(e) => e.stopPropagation()}
>
            <div
  className="mb-5 overflow-hidden rounded-3xl p-4"
  style={{
    border: `1px solid ${
      theme === "lime"
        ? "#d9f99d"
        : theme === "pink"
        ? "#fbcfe8"
        : theme === "sky"
        ? "#bae6fd"
        : theme === "orange"
        ? "#fed7aa"
        : theme === "purple"
        ? "#ddd6fe"
        : defaultTheme === "pink"
        ? "#fbcfe8"
        : defaultTheme === "sky"
        ? "#bae6fd"
        : defaultTheme === "orange"
        ? "#fed7aa"
        : defaultTheme === "purple"
        ? "#ddd6fe"
        : "#d9f99d"
    }`,

    background:
      theme === "lime"
        ? "linear-gradient(to bottom right, #ecfccb, #ffffff, #bae6fd)"

        : theme === "pink"
        ? "linear-gradient(to bottom right, #fce7f3, #ffffff, #e9d5ff)"

        : theme === "sky"
        ? "linear-gradient(to bottom right, #e0f2fe, #ffffff, #d1fae5)"

        : theme === "orange"
        ? "linear-gradient(to bottom right, #fff7ed, #ffffff, #fde68a)"

        : theme === "purple"
        ? "linear-gradient(to bottom right, #f3e8ff, #ffffff, #fbcfe8)"

        : defaultTheme === "pink"
        ? "linear-gradient(to bottom right, #fce7f3, #ffffff, #e9d5ff)"

        : defaultTheme === "sky"
        ? "linear-gradient(to bottom right, #e0f2fe, #ffffff, #d1fae5)"

        : defaultTheme === "orange"
        ? "linear-gradient(to bottom right, #fff7ed, #ffffff, #fde68a)"

        : defaultTheme === "purple"
        ? "linear-gradient(to bottom right, #f3e8ff, #ffffff, #fbcfe8)"

        : "linear-gradient(to bottom right, #ecfccb, #ffffff, #bae6fd)",
  }}
>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-2xl">🛒</p>

                  <p className="mt-1 text-lg font-black text-neutral-800">
                    My Shopping List
                  </p>

                  <p className="mt-1 text-xs text-neutral-500">
                    毎日の買い物を、もっとシンプルに。
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsMenuOpen(false)}
                  className="rounded-full bg-white/90 px-3 py-1 text-gray-500 shadow-sm ring-1 ring-black/5"
                  aria-label="メニューを閉じる"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {menuItems.map(([label, path]) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    router.push(path);
                  }}
                 className="rounded-2xl bg-white/70 px-4 py-3 text-left text-sm font-bold text-gray-700 shadow-sm transition hover:scale-[1.01]"
style={{
  border: "1px solid rgba(255,255,255,0.7)",
}}
onMouseEnter={(e) => {
  e.currentTarget.style.backgroundColor =
    theme === "lime"
      ? "#f7fee7"
      : theme === "pink"
      ? "#fdf2f8"
      : theme === "sky"
      ? "#f0f9ff"
      : theme === "orange"
      ? "#fff7ed"
      : theme === "purple"
      ? "#faf5ff"
      : "#f7fee7";

  e.currentTarget.style.color =
    theme === "lime"
      ? "#4d7c0f"
      : theme === "pink"
      ? "#be185d"
      : theme === "sky"
      ? "#0369a1"
      : theme === "orange"
      ? "#c2410c"
      : theme === "purple"
      ? "#7e22ce"
      : "#4d7c0f";
}}
onMouseLeave={(e) => {
  e.currentTarget.style.backgroundColor =
    "rgba(255,255,255,0.7)";

  e.currentTarget.style.color = "#374151";
}}
                >
                  {label}
                </button>
              ))}

              <button
                type="button"
                onClick={handleLogout}
                className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-left text-sm font-bold text-red-500 transition hover:bg-red-100"
              >
                🚪 ログアウト
              </button>
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && (
  <div
    className="fixed inset-0 z-50 bg-black/30"
    onClick={() => setIsSettingsOpen(false)}
  >
    <div
  className="
    fixed bottom-0 left-0 right-0
    rounded-t-[32px]
    p-5
    shadow-2xl
  "
  style={{
    background:
      theme === "lime"
        ? "linear-gradient(to top, #f7fee7, #ffffff)"

        : theme === "pink"
        ? "linear-gradient(to top, #fdf2f8, #ffffff)"

        : theme === "sky"
        ? "linear-gradient(to top, #f0f9ff, #ffffff)"

        : theme === "orange"
        ? "linear-gradient(to top, #fff7ed, #ffffff)"

        : theme === "purple"
        ? "linear-gradient(to top, #faf5ff, #ffffff)"

        : "linear-gradient(to top, #f7fee7, #ffffff)",
  }}
  onClick={(e) => e.stopPropagation()}
>
      <div className="mb-5 flex justify-center">
        <div className="h-1.5 w-14 rounded-full bg-neutral-300" />
      </div>

      <div className="mb-5">
        <p className="text-sm font-medium text-neutral-500">
          Quick Settings
        </p>

        <h2 className="mt-1 text-2xl font-black text-neutral-900">
          🌙 クイック設定
        </h2>
      </div>

      <div className="space-y-3">
        <div
  className="rounded-2xl p-4 shadow-sm"
  style={{
  backgroundColor:
    theme === "lime"
      ? "#f7fee7"
      : theme === "pink"
      ? "#fdf2f8"
      : theme === "sky"
      ? "#f0f9ff"
      : theme === "orange"
      ? "#fff7ed"
      : theme === "purple"
      ? "#faf5ff"
      : "#f7fee7",
}}>
  <p className="text-sm font-bold text-neutral-800">
    🎨 テーマ
  </p>

  <p className="mt-1 text-xs text-neutral-500">
    アプリカラーを変更
  </p>

  <div className="mt-4 flex flex-wrap gap-2">
    {[
  ["default", "🌿", "デフォルト"],
  ["lime", "💚", "ライム"],
  ["pink", "🩷", "ピンク"],
  ["sky", "🩵", "スカイ"],
  ["orange", "🧡", "オレンジ"],
  ["purple", "💜", "パープル"],
].map(([value, emoji, label]) => (
  <button
    key={value}
    onClick={() => changeTheme(value)}
    className="flex items-center gap-1 rounded-full px-3 py-2 text-xs font-bold transition"
    style={{
      backgroundColor:
        theme === value ? "#111827" : "#f3f4f6",
      color: theme === value ? "#ffffff" : "#6b7280",
    }}
  >
    <span>{emoji}</span>
    <span>{theme === value ? `${label} ✓` : label}</span>
  </button>
))}

  </div>
</div>

<div
  className="rounded-2xl p-4 shadow-sm"
  style={{
  backgroundColor:
    theme === "lime"
      ? "#f7fee7"
      : theme === "pink"
      ? "#fdf2f8"
      : theme === "sky"
      ? "#f0f9ff"
      : theme === "orange"
      ? "#fff7ed"
      : theme === "purple"
      ? "#faf5ff"
      : "#f7fee7",
}}>
  <p className="text-sm font-bold text-neutral-800">
    🔠 文字サイズ
  </p>

  <p className="mt-1 text-xs text-neutral-500">
    表示サイズを変更
  </p>

  <div className="mt-4 flex flex-wrap gap-2">
    {[
      ["small", "小"],
      ["normal", "標準"],
      ["large", "大"],
    ].map(([value, label]) => (
      <button
        key={value}
        onClick={() => changeFontSize(value)}
        className="rounded-full px-3 py-2 text-xs font-bold transition"
        style={{
          backgroundColor:
            fontSize === value
              ? "#111827"
              : "#f3f4f6",

          color:
            fontSize === value
              ? "#ffffff"
              : "#6b7280",
        }}
      >
        {fontSize === value
          ? `${label} ✓`
          : label}
      </button>
    ))}
  </div>
</div>

<div
  className="rounded-2xl p-4 shadow-sm"
  style={{
  backgroundColor:
    theme === "lime"
      ? "#f7fee7"
      : theme === "pink"
      ? "#fdf2f8"
      : theme === "sky"
      ? "#f0f9ff"
      : theme === "orange"
      ? "#fff7ed"
      : theme === "purple"
      ? "#faf5ff"
      : "#f7fee7",
}}>
  <p className="text-sm font-bold text-neutral-800">
    📏 表示密度
  </p>

  <p className="mt-1 text-xs text-neutral-500">
    リスト間隔を変更
  </p>

  <div className="mt-4 flex flex-wrap gap-2">
    {[
      ["compact", "コンパクト"],
      ["normal", "標準"],
    ].map(([value, label]) => (
      <button
        key={value}
        onClick={() => changeDensity(value)}
        className="rounded-full px-3 py-2 text-xs font-bold transition"
        style={{
          backgroundColor:
            density === value
              ? "#111827"
              : "#f3f4f6",

          color:
            density === value
              ? "#ffffff"
              : "#6b7280",
        }}
      >
        {density === value
          ? `${label} ✓`
          : label}
      </button>
    ))}
  </div>
</div>

      </div>

      <button
        type="button"
        onClick={() => setIsSettingsOpen(false)}
        className="
          mt-5
          w-full
          rounded-2xl
          bg-neutral-900
          px-4
          py-4
          text-sm
          font-bold
          text-white
        "
      >
        閉じる
      </button>
    </div>
  </div>
)}
    </>
  );
}
