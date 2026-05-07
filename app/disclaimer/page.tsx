"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DisclaimerPage() {
  const router = useRouter();

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <main className="min-h-screen bg-gray-50 p-4">
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
            className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600 shadow ring-1 ring-gray-200 hover:bg-gray-200"
          >
            ← 戻る
          </button>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <p className="mb-2 text-3xl">⚠️</p>

          <h1 className="text-2xl font-bold text-gray-700">
            免責事項
          </h1>

          <p className="mt-2 text-sm leading-relaxed text-gray-500">
            My Shopping List は現在ベータ版として提供しています。
          </p>
        </div>

        <section className="space-y-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <p className="text-sm leading-relaxed text-gray-600">
            本アプリは、予期せぬ不具合やデータ消失が発生する可能性があります。
          </p>

          <p className="text-sm leading-relaxed text-gray-600">
            本アプリの利用により生じた損害について、運営者は責任を負いかねますのでご了承ください。
          </p>

          <p className="text-sm leading-relaxed text-gray-600">
            また、予告なく仕様変更・機能追加・提供停止を行う場合があります。
          </p>
        </section>

        <p className="text-center text-xs text-gray-400">
          最終更新日：2026年5月
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