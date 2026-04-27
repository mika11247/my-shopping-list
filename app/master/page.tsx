"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type MasterItem = {
  id: number;
  name: string;
  yomi: string | null;
  category: string | null;
  user_id: string;
};

const categories = [
  "野菜・果物",
  "肉",
  "魚",
  "乳製品",
  "卵",
  "冷凍",
  "パン・穀物",
  "調味料",
  "飲み物",
  "お菓子",
  "日用品",
  "その他",
  "一時メモ",
];

const toHiragana = (text: string) => {
  return text.replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
};

const isHiragana = (text: string) => {
  return /^[\u3040-\u309F]+$/.test(text);
};

export default function MasterPage() {
  const [items, setItems] = useState<MasterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [newItem, setNewItem] = useState("");
  const [newCategory, setNewCategory] = useState("その他");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("その他");

  const [newYomi, setNewYomi] = useState("");
const [editYomi, setEditYomi] = useState("");

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
      .select("id, name, yomi, category, user_id")
      .eq("user_id", userId)
      .order("name", { ascending: true });

    if (error) {
      console.error("マスター取得エラー:", error);
    } else {
      setItems(data || []);
    }

    setLoading(false);
  };

  const addMasterItem = async () => {
    const trimmedName = newItem.trim();
if (!trimmedName || !userId) return;

let yomiToSave = newYomi.trim();

if (!yomiToSave) {
  if (isHiragana(trimmedName)) {
    yomiToSave = trimmedName;
  } else {
    yomiToSave = toHiragana(trimmedName);
  }
}

    const alreadyExists = items.some((item) => item.name === trimmedName);

    if (alreadyExists) {
      alert("すでに登録されています");
      return;
    }

    const { error } = await supabase.from("user_item_master")
    .upsert(
  [
    {
      user_id: userId,
      name: trimmedName,
      yomi: yomiToSave, // ←ここ🔥
      category: newCategory,
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
  {
    id: Date.now(),
    name: trimmedName,
    yomi: yomiToSave,
    category: newCategory,
    user_id: userId,
  },
]);

setNewItem("");
setNewYomi(""); // ←ここ🔥
setNewCategory("その他");
  };

  const updateMasterItem = async (
  id: number,
  name: string,
  yomi: string,
  category: string
) => {
  if (!userId) return;

  const { data, error } = await supabase
    .from("user_item_master")
    .update({ name, yomi, category })
    .eq("id", id)
    .eq("user_id", userId)
    .select();

  console.log("更新結果:", data);
  console.log("更新エラー:", error);

  if (error) {
    console.error("更新エラー:", error);
    alert("更新に失敗しました");
    return;
  }

  setItems((prev) =>
    prev.map((item) =>
      item.id === id ? { ...item, name, yomi, category } : item
    )
  );

  setEditingId(null);
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
        <div className="mb-4 flex items-start justify-between gap-4">
  <div>
    <h1 className="text-2xl font-bold text-pink-600">My items</h1>
    <p className="mt-1 text-sm text-gray-500">
      あなたが追加したアイテムを編集・整理できます。
    </p>
  </div>

  <button
    onClick={() => window.location.href = "/"}
    className="rounded-full bg-white px-3 py-1 text-xs text-gray-600 shadow ring-1 ring-pink-100"
  >
    戻る
  </button>
</div>

        <div className="mb-4 flex flex-col gap-2">
  <input
    value={newItem}
    onChange={(e) => setNewItem(e.target.value)}
    onKeyDown={(e) => {
      if (e.key === "Enter") {
        addMasterItem();
      }
    }}
    placeholder="アイテム追加"
    className="rounded-xl border border-pink-100 bg-white px-3 py-2 text-sm text-gray-700"
  />

  {/* 👇これ追加🔥 */}
  <input
    value={newYomi}
    onChange={(e) => setNewYomi(e.target.value)}
    placeholder="よみ（ひらがな／空欄でもOK）"
    className="rounded-xl border border-pink-100 bg-white px-3 py-2 text-sm text-gray-700"
  />

  <div className="flex gap-2">
    <select
      value={newCategory}
      onChange={(e) => setNewCategory(e.target.value)}
      className="flex-1 rounded-xl border border-pink-100 bg-white px-3 py-2 text-sm text-gray-700"
    >
      {categories.map((cat) => (
        <option key={cat} value={cat}>
          {cat}
        </option>
      ))}
    </select>

    <button
      onClick={addMasterItem}
      className="rounded-xl bg-pink-500 px-4 py-2 text-sm text-white"
    >
      追加
    </button>
  </div>
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
                className="flex items-center justify-between gap-2 rounded-2xl border border-pink-100 bg-pink-50 px-3 py-2"
              >
                {editingId === item.id ? (
                  <div className="flex flex-1 flex-col gap-2">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && editName.trim() !== "") {
                         updateMasterItem(
                         item.id,
                         editName.trim(),
                         editYomi.trim(),
                         editCategory
                         ); 
                        }
                      }}
                      className="rounded-xl border border-pink-200 bg-white px-3 py-1 text-sm text-gray-800 outline-none"
                      autoFocus
                    />
                    <input
  value={editYomi}
  onChange={(e) => setEditYomi(e.target.value)}
  placeholder="よみ（ひらがな・空欄OK）"
  className="rounded-xl border border-pink-200 bg-white px-3 py-1 text-sm text-gray-800"
/>

                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className="rounded-xl border border-pink-200 bg-white px-3 py-1 text-sm text-gray-800"
                    >
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col">
                    <span className="text-gray-800">{item.name}</span>
                    <span className="text-xs text-gray-500">
  {item.yomi ? `${item.yomi} / ` : ""}
  {item.category ?? "その他"}
</span>
                  </div>
                )}

                <div className="flex gap-2">
  {editingId === item.id ? (
    <>
      <button
  type="button"
  onClick={() => {
    console.log("💾 保存:", {
      name: editName,
      yomi: editYomi,
      category: editCategory,
    });

    if (editName.trim() !== "") {
      setTimeout(() => {
        updateMasterItem(
          item.id,
          editName.trim(),
          editYomi.trim(),
          editCategory
        );
      }, 0);
    }
  }}
  className="rounded-full bg-white px-3 py-1 text-xs text-green-600 shadow"
>
  保存
</button>

      {/* 👇これ追加🔥 */}
      <button
        onClick={() => {
  setEditingId(null);
  setEditName("");
  setEditYomi("");
  setEditCategory("その他");
}}
        className="rounded-full bg-white px-3 py-1 text-xs text-gray-500 shadow"
      >
        キャンセル
      </button>
    </>
  ) : (
    <button
      onClick={() => {
        setEditingId(item.id);
        setEditName(item.name);
        setEditYomi(item.yomi ?? "");
        setEditCategory(item.category ?? "その他");
      }}
      className="rounded-full bg-white px-3 py-1 text-xs text-pink-600 shadow"
    >
      編集
    </button>
  )}

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