"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const checkUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        router.push("/");
      }
    };

    checkUser();
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          setMessage(error.message);
          return;
        }

        setMessage(
          "確認メールを送信しました。メール内のリンクを押してからログインしてね。"
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setMessage(error.message);
          return;
        }

        router.push("/");
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
        <p className="text-sm text-neutral-500">My Shopping List</p>
        <h1 className="mt-1 text-2xl font-bold text-neutral-900">
          {mode === "login" ? "ログイン" : "新規登録"}
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          夫婦で同じアカウントを使うなら、共通のメールアドレスとパスワードでOK
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
            {loading
              ? "処理中..."
              : mode === "login"
              ? "ログイン"
              : "新規登録"}
          </button>
        </form>

        <div className="mt-4 text-center text-sm">
          {mode === "login" ? (
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setMessage("");
              }}
              className="text-blue-500"
            >
              アカウントを作る
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setMessage("");
              }}
              className="text-blue-500"
            >
              すでにアカウントがある
            </button>
          )}
        </div>
      </div>
    </main>
  );
}