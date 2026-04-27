"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const updatePassword = async () => {
    if (!password || password.length < 6) {
      setMessage("6文字以上のパスワードを入力してください");
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: password,
    });

    if (error) {
      setMessage("パスワードの更新に失敗しました");
      return;
    }

    setMessage("パスワードを更新しました");
    
    setTimeout(() => {
      router.push("/");
    }, 2000);
  };

  return (
    <main className="min-h-screen bg-lime-50 p-4">
      <div className="mx-auto max-w-md">
        <h1 className="mb-4 text-2xl font-bold text-lime-700">
          パスワード再設定
        </h1>

        <div className="rounded-2xl bg-white p-4 shadow ring-1 ring-lime-100">
          <label className="mb-2 block text-sm text-gray-600">
            新しいパスワード
          </label>

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-lime-200 px-3 py-2 text-base outline-none focus:border-lime-500"
          />

          <button
            onClick={updatePassword}
            className="mt-4 w-full rounded-full bg-lime-500 py-2 text-sm font-bold text-white"
          >
            パスワードを更新
          </button>

          {message && (
            <p className="mt-3 text-xs text-gray-500">{message}</p>
          )}
        </div>
      </div>
    </main>
  );
}