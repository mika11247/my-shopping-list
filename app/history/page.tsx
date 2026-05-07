"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import { getLimitByPlan } from "@/lib/planLimits";

type DeletedItem = {
  id: number;
  name: string;
  category: string | null;
  note: string | null;
  checked: boolean | null;
  deleted_at: string;
  group_id: string | null;
  purchased_by_name: string | null;
};

export default function HistoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<DeletedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [userPlan, setUserPlan] = useState<string>("free");

  const [toast, setToast] = useState("");

  const [theme, setTheme] = useState("default");

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

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
    
    const { data: profile } = await supabase
  .from("profiles")
  .select("role, plan")
  .eq("user_id", user.id)
  .single();

const currentRole = profile?.role ?? "user";
const currentPlan = profile?.plan ?? "free";

    setUserPlan(currentPlan);
  
    const { data: memberships } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", user.id);
  
    const groupIds = (memberships || []).map((m) => m.group_id);
  
    let query = supabase
      .from("deleted_items")
      .select("id, name, category, note, checked, deleted_at, group_id, purchased_by_name")
      .order("deleted_at", { ascending: false })
      .limit(getLimitByPlan(currentRole, currentPlan, "history"))

    if (groupIds.length > 0) {
      query = query.or(
        `and(user_id.eq.${user.id},group_id.is.null),group_id.in.(${groupIds.join(",")})`
      );
    } else {
      query = query
        .eq("user_id", user.id)
        .is("group_id", null);
    }
  
    const { data, error } = await query;
  
    if (error) {
      console.error(error);
      showToast("履歴の取得に失敗しました");
      setLoading(false);
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
        group_id: item.group_id ?? null,
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
    <main
  className={`min-h-screen p-4 ${theme} history`}
  style={{ background: "var(--bg-gradient)" }}
>
      {/* 🌊トースト */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm text-white shadow-lg"
        style={{
          backgroundColor:
            theme === "default" ? "#0284c7" : "var(--main-color)",
        }}>
          {toast}
        </div>
      )}

      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold"
style={{
  color:
    theme === "default" ? "#0284c7" : "var(--main-text)",
}}>購入履歴</h1>
          <p className="mt-1 text-sm text-gray-500">
            チェック済みを削除したアイテムの履歴です。
          </p>
        </div>

        <button
          onClick={() => router.push("/")}
          className="rounded-full px-3 py-1 text-xs shadow"
style={{
  backgroundColor:
    theme === "default" ? "#ffffff" : "var(--sub-bg)",
  color:
    theme === "default" ? "#525252" : "var(--main-text)",
  border: `1px solid ${
    theme === "default" ? "#bae6fd" : "var(--ring-color)"
  }`,
}}
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
        <h2 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-bold"
style={{
  color:
    theme === "default"
      ? "#0ea5e9"
      : "var(--main-text)",
}}>
          <span>{key}</span>

          {group[0]?.purchased_by_name && (
            <span className="rounded-full px-2 py-0.5 text-xs font-normal"
            style={{
              backgroundColor:
                theme === "default"
                  ? "#e0f2fe"
                  : "var(--sub-bg)",
              color:
                theme === "default"
                  ? "#0284c7"
                  : "var(--main-text)",
              border: `1px solid ${
                theme === "default"
                  ? "#bae6fd"
                  : "var(--ring-color)"
              }`,
            }}>
              {group[0].purchased_by_name}さんが購入
            </span>
          )}
        </h2>

        <div className="space-y-3">
          {group.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl bg-white p-4 shadow-md"
style={{
  border: `1px solid ${
    theme === "default"
      ? "#bae6fd"
      : "var(--ring-color)"
  }`,
}}
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
                className="mt-2 rounded-full px-3 py-1 text-xs font-medium"
style={{
  backgroundColor:
    theme === "default"
      ? "#e0f2fe"
      : "var(--main-bg)",
  color:
    theme === "default"
      ? "#0284c7"
      : "var(--main-text)",
  border: `1px solid ${
    theme === "default"
      ? "#bae6fd"
      : "var(--ring-color)"
  }`,
}}
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