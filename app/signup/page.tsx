"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setMessage(
      "確認メールを送信しました。メール内のリンクを押してからログインしてください。"
    );

    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
        <p className="text-sm text-neutral-500">My Shopping List</p>

        <h1 className="mt-1 text-2xl font-bold text-neutral-900">
          新規登録
        </h1>

        <p className="mt-2 text-sm text-neutral-600">
          メールアドレスとパスワードでアカウントを作成します
        </p>

        <form onSubmit={handleSignup} className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-700">
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-500"
              placeholder="example@mail.com"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-700">
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-500"
              placeholder="8文字以上がおすすめ"
              required
            />
          </div>

          {message && (
            <p className="rounded-xl bg-neutral-50 px-4 py-3 text-sm text-neutral-600 ring-1 ring-neutral-200">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-500 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "処理中..." : "アカウント作成"}
          </button>
        </form>

        <div className="mt-4 text-center text-sm">
          <button
            onClick={() => router.push("/login")}
            className="text-blue-500"
          >
            すでにアカウントがある
          </button>
        </div>
      </div>
    </main>
  );
}