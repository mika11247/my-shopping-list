"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [shoppingCount, setShoppingCount] = useState(0);
  const [masterCount, setMasterCount] = useState(0);
  const [historyCount, setHistoryCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const fetchProfile = async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const userEmail = user.email ?? "";

    setEmail(userEmail);
    setNewEmail(userEmail);
    setDisplayName(
      user.user_metadata?.display_name ?? userEmail.split("@")[0]
    );

    const [{ count: shopping }, { count: master }, { count: history }] =
      await Promise.all([
        supabase
          .from("shopping_items")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id),

        supabase
          .from("user_item_master")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id),

        supabase
          .from("deleted_items")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id),
      ]);

    setShoppingCount(shopping ?? 0);
    setMasterCount(master ?? 0);
    setHistoryCount(history ?? 0);
    setLoading(false);
  };

  const updateDisplayName = async () => {
    const trimmedName = displayName.trim();

    if (!trimmedName) {
      setMessage("表示名を入力してください");
      return;
    }

    const { error } = await supabase.auth.updateUser({
      data: {
        display_name: trimmedName,
      },
    });

    if (error) {
      setMessage("表示名の更新に失敗しました");
      return;
    }

    setMessage("表示名を更新しました");
  };

  const updateEmail = async () => {
    const trimmedEmail = newEmail.trim();

    if (!trimmedEmail) {
      setMessage("メールアドレスを入力してください");
      return;
    }

    if (trimmedEmail === email) {
      setMessage("現在のメールアドレスと同じです");
      return;
    }

    const { error } = await supabase.auth.updateUser({
      email: trimmedEmail,
    });

    if (error) {
      setMessage("メールアドレスの変更に失敗しました");
      return;
    }

    setMessage("確認メールを送信しました。メール内のリンクを確認してください");
  };

  const sendPasswordResetEmail = async () => {
  if (!email) {
    setMessage("メールアドレスを取得できませんでした");
    return;
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });

  if (error) {
    setMessage("パスワード再設定メールの送信に失敗しました");
    return;
  }

  setMessage("パスワード再設定メールを送信しました");
};

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleWithdraw = async () => {
  const ok = window.confirm(
    "本当に退会しますか？\nアカウントと登録データは削除されます。"
  );

  if (!ok) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    setMessage("ログイン情報を取得できませんでした");
    return;
  }

  const response = await fetch("/api/delete-user", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId: user.id }),
  });

  if (!response.ok) {
    setMessage("退会処理に失敗しました");
    return;
  }

  await supabase.auth.signOut();

router.push("/login?withdraw=1");
};

  useEffect(() => {
    fetchProfile();
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-lime-50 to-white p-4">
      <div className="mx-auto max-w-xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-lime-700">My Page</h1>
            <p className="mt-1 text-sm text-gray-500">
              アカウント情報と利用状況を確認できます。
            </p>
          </div>

          <button
            onClick={() => router.push("/")}
            className="rounded-full bg-white px-3 py-1 text-xs text-gray-600 shadow ring-1 ring-lime-100"
          >
            戻る
          </button>
        </div>

        {message && (
          <div className="mb-4 rounded-2xl bg-lime-100 px-4 py-3 text-sm font-bold text-lime-700 ring-1 ring-lime-200">
            {message}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-500">読み込み中...</p>
        ) : (
          <div className="space-y-4">
            <section className="rounded-2xl bg-white p-4 shadow ring-1 ring-lime-100">
              <p className="text-sm font-bold text-lime-700">アカウント</p>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-1 block text-xs text-gray-500">
                    表示名
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="flex-1 rounded-xl border border-lime-200 px-3 py-2 text-sm outline-none focus:border-lime-500"
                    />
                    <button
                      onClick={updateDisplayName}
                      className="rounded-xl bg-lime-500 px-3 py-2 text-xs font-bold text-white"
                    >
                      保存
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-gray-500">
                    メールアドレス
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="flex-1 rounded-xl border border-lime-200 px-3 py-2 text-sm outline-none focus:border-lime-500"
                    />
                    <button
                      onClick={updateEmail}
                      className="rounded-xl bg-lime-500 px-3 py-2 text-xs font-bold text-white"
                    >
                      変更
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    メール変更には確認メールの承認が必要です。
                  </p>
                </div>

                <div className="rounded-2xl bg-lime-50 p-3 ring-1 ring-lime-100">
  <p className="text-xs text-gray-500">パスワード</p>
  <button
    onClick={sendPasswordResetEmail}
    className="mt-2 rounded-full bg-lime-500 px-4 py-2 text-xs font-bold text-white"
  >
    パスワード再設定メールを送る
  </button>
</div>

                <div className="rounded-2xl bg-lime-50 p-3 ring-1 ring-lime-100">
                  <p className="text-xs text-gray-500">会員状況</p>
                  <p className="mt-1 text-sm font-bold text-lime-700">
                    無料会員
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl bg-white p-4 shadow ring-1 ring-lime-100">
              <p className="mb-3 text-sm font-bold text-lime-700">利用状況</p>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-lime-50 p-3 text-center ring-1 ring-lime-100">
                  <p className="text-xs text-gray-500">買い物リスト</p>
                  <p className="mt-1 text-xl font-bold text-lime-700">
                    {shoppingCount}件
                  </p>
                </div>

                <div className="rounded-2xl bg-pink-50 p-3 text-center ring-1 ring-pink-100">
                  <p className="text-xs text-gray-500">My items</p>
                  <p className="mt-1 text-xl font-bold text-pink-600">
                    {masterCount}件
                  </p>
                </div>

                <div className="rounded-2xl bg-sky-50 p-3 text-center ring-1 ring-sky-100">
                  <p className="text-xs text-gray-500">購入履歴</p>
                  <p className="mt-1 text-xl font-bold text-sky-600">
                    {historyCount}件
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl bg-white p-4 shadow ring-1 ring-lime-100">
              <p className="mb-3 text-sm font-bold text-lime-700">メニュー</p>

              <div className="space-y-2">
                <button
                  onClick={() => router.push("/")}
                  className="w-full rounded-full bg-lime-100 px-4 py-2 text-sm font-bold text-lime-700"
                >
                  お買い物リストへ戻る
                </button>

                <button
                  onClick={() => router.push("/master")}
                  className="w-full rounded-full bg-pink-100 px-4 py-2 text-sm font-bold text-pink-600"
                >
                  My items を編集する
                </button>

                <button
                  onClick={() => router.push("/history")}
                  className="w-full rounded-full bg-sky-100 px-4 py-2 text-sm font-bold text-sky-600"
                >
                  購入履歴を見る
                </button>
              </div>
            </section>

            <button
              onClick={handleLogout}
              className="w-full rounded-full bg-lime-600 px-4 py-3 text-sm font-bold text-white shadow"
            >
              ログアウト
            </button>

            <button
              onClick={handleWithdraw}
              className="w-full rounded-full bg-white px-4 py-3 text-sm font-bold text-red-500 shadow ring-1 ring-red-100"
            >
              退会する
            </button>
          </div>
        )}
      </div>
    </main>
  );
}