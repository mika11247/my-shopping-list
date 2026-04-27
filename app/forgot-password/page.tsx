"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const sendResetEmail = async () => {
    if (!email) {
      setMessage("メールアドレスを入力してください");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setMessage("メール送信に失敗しました");
      return;
    }

    setMessage("パスワード再設定メールを送信しました");
  };

  return (
    <main className="min-h-screen bg-lime-50 p-4">
      <div className="mx-auto max-w-md">
        <h1 className="mb-4 text-2xl font-bold text-lime-700">
          パスワードを忘れた方
        </h1>

        <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-lime-100">
          <p className="mb-3 text-sm text-gray-600">
            登録しているメールアドレスを入力してください。
          </p>

          <input
            type="email"
            placeholder="example@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-lime-200 px-3 py-2 text-sm outline-none focus:border-lime-500"
          />

          <button
            onClick={sendResetEmail}
            className="mt-4 w-full rounded-full bg-lime-500 py-2 text-sm font-bold text-white"
          >
            再設定メールを送る
          </button>

          {message && (
            <p className="mt-3 text-xs text-gray-500">{message}</p>
          )}
        </div>

        <button
          onClick={() => router.push("/login")}
          className="mt-4 text-xs text-gray-500 underline"
        >
          ログインに戻る
        </button>
      </div>
    </main>
  );
}