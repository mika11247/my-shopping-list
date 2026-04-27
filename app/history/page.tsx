"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

type DeletedItem = {
  id: number;
  name: string;
  category: string | null;
  note: string | null;
  checked: boolean | null;
  deleted_at: string;
};

export default function HistoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<DeletedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [toast, setToast] = useState("");

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 2000);
  };

  const fetchHistory = async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const { data, error } = await supabase
      .from("deleted_items")
      .select("id, name, category, note, checked, deleted_at")
      .eq("user_id", user.id)
      .order("deleted_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error(error);
      showToast("履歴の取得に失敗しました");
      return;
    }

    setItems(data || []);
    setLoading(false);
  };

  const addBackToList = async (item: DeletedItem) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const { data: existing } = await supabase
      .from("shopping_items")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", item.name)
      .limit(1);

    if (existing && existing.length > 0) {
      showToast("すでにリストにあります");
      return;
    }

    const { error } = await supabase.from("shopping_items").insert([
      {
        user_id: user.id,
        name: item.name,
        category: item.category ?? "その他",
        note: item.note ?? "",
        checked: false,
      },
    ]);

    if (error) {
      showToast("追加に失敗しました");
      return;
    }

    showToast("リストに追加しました！");
  };

  const groupedItems = useMemo(() => {
    return items.reduce((acc, item) => {
      const d = new Date(item.deleted_at);

      const date = d.toLocaleDateString("ja-JP");
      const time = d.toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
      });

      const key = `${date} ${time}`;

      if (!acc[key]) acc[key] = [];
      acc[key].push(item);

      return acc;
    }, {} as Record<string, DeletedItem[]>);
  }, [items]);

  useEffect(() => {
    fetchHistory();
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-white p-4">
      {/* 🌊トースト */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-sky-600 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-sky-600">購入履歴</h1>
          <p className="mt-1 text-sm text-gray-500">
            チェック済みを削除したアイテムの履歴です。
          </p>
        </div>

        <button
          onClick={() => router.push("/")}
          className="rounded-full bg-white px-3 py-1 text-xs text-gray-600 shadow ring-1 ring-sky-100"
        >
          戻る
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">まだ履歴はありません。</p>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedItems).map(([key, group]) => (
            <div key={key}>
              <h2 className="mb-2 text-sm font-bold text-sky-500">{key}</h2>

              <div className="space-y-3">
                {group.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl bg-white p-4 shadow-md ring-1 ring-sky-100"
                  >
                    <p className="font-bold text-gray-800">{item.name}</p>

                    <p className="mt-1 text-xs text-gray-500">
                      {item.category ?? "その他"}
                    </p>

                    {item.note && (
                      <p className="mt-1 text-xs text-gray-400">
                        {item.note}
                      </p>
                    )}

                    <button
                      onClick={() => addBackToList(item)}
                      className="mt-2 rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-600"
                    >
                      もう一回買う
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}