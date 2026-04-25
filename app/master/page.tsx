"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type MasterItem = {
  id: number;
  name: string;
  user_id: string;
};

export default function MasterPage() {
  const [items, setItems] = useState<MasterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
const [editName, setEditName] = useState("");
const [newItem, setNewItem] = useState("");

const addMasterItem = async () => {
  const trimmedName = newItem.trim();
  if (!trimmedName || !userId) return;

  const alreadyExists = items.some((item) => item.name === trimmedName);

  if (alreadyExists) {
    alert("すでに登録されています");
    return;
  }

  const { error } = await supabase
    .from("user_item_master")
    .upsert(
      [
        {
          user_id: userId,
          name: trimmedName,
        },
      ],
      {
        onConflict: "user_id,name",
      }
    );

  if (error) {
    console.error("追加エラー:", error);
    return;
  }

  setItems((prev) => [
    ...prev,
    { id: Date.now(), name: trimmedName, user_id: userId },
  ]);

  setNewItem("");
};

const updateMasterItem = async (id: number, name: string) => {
  const { error } = await supabase
    .from("user_item_master")
    .update({ name })
    .eq("id", id);

  if (error) {
    console.error("更新エラー:", error);
  } else {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, name } : item
      )
    );
    setEditingId(null);
  }
};

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id || null);
    };

    getUser();
  }, []);

  useEffect(() => {
    if (userId) {
      fetchMasterItems();
    }
  }, [userId]);

  const fetchMasterItems = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("user_item_master")
      .select("*")
      .eq("user_id", userId)
      .order("name", { ascending: true });

    if (error) {
      console.error("マスター取得エラー:", error);
    } else {
      setItems(data || []);
    }

    setLoading(false);
  };

  const deleteMasterItem = async (id: number) => {
    const { error } = await supabase
      .from("user_item_master")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("削除エラー:", error);
    } else {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }
  };

  return (
    <main className="min-h-screen bg-pink-50 p-4">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-5 shadow">
        <h1 className="mb-2 text-2xl font-bold text-pink-600">
          My items
        </h1>

        <p className="mb-4 text-sm text-gray-500">
          あなたが追加したアイテムを編集・整理できます。
        </p>

        <div className="mb-4 flex gap-2">
  <input
    value={newItem}
    onChange={(e) => setNewItem(e.target.value)}
    placeholder="アイテム追加"
    className="flex-1 rounded-xl border px-3 py-2 text-sm"
  />

  <button
    onClick={addMasterItem}
    className="rounded-xl bg-pink-500 px-4 py-2 text-sm text-white"
  >
    追加
  </button>
</div>

        {loading ? (
          <p className="text-gray-500">読み込み中...</p>
        ) : items.length === 0 ? (
          <p className="text-gray-500">
            まだ登録されているアイテムがありません。
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-2xl border border-pink-100 bg-pink-50 px-3 py-2"
              >
                {editingId === item.id ? (
  <input
    value={editName}
    onChange={(e) => setEditName(e.target.value)}
    onKeyDown={(e) => {
      if (e.key === "Enter" && editName.trim() !== "") {
        updateMasterItem(item.id, editName.trim());
      }
    }}
    className="flex-1 rounded-xl border border-pink-200 bg-white px-3 py-1 text-sm text-gray-800 outline-none"
    autoFocus
  />
) : (
  <span className="text-gray-800">{item.name}</span>
)}

                <div className="flex gap-2">

  {editingId === item.id ? (
    <button
      onClick={() => {
        if (editName.trim() !== "") {
          updateMasterItem(item.id, editName.trim());
        }
      }}
      className="rounded-full bg-white px-3 py-1 text-xs text-green-600 shadow"
    >
      保存
    </button>
  ) : (
    <button
      onClick={() => {
        setEditingId(item.id);
        setEditName(item.name);
      }}
      className="rounded-full bg-white px-3 py-1 text-xs text-pink-600 shadow"
    >
      編集
    </button>
  )}

  {/* ←これを常に表示 */}
  <button
    onClick={() => deleteMasterItem(item.id)}
    className="rounded-full bg-white px-3 py-1 text-xs text-red-500 shadow"
  >
    削除
  </button>

</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}