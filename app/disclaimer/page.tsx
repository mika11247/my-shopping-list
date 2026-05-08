"use client";

import Header from "@/components/Header";

export default function DisclaimerPage() {
  
  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-xl space-y-4">

      <Header
  title="免責事項 ⚠️"
  subtitle="Disclaimer"
/>
          

          <p className="mt-2 text-sm leading-relaxed text-gray-500">
            My Shopping List は現在ベータ版として提供しています。
          </p>
        

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

    </main>
  );
}