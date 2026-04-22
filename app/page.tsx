"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type ShoppingItem = {
  id: number;
  name: string;
  category: string;
  note: string;
  checked: boolean;
  created_at?: string;
};

type CandidateItem = {
  name: string;
  yomi?: string;
  category?: string;
  note?: string;
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
  "その他"
];

const toHiragana = (text: string) => {
  return text.replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
};

export default function Home() {
  const router = useRouter();
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [candidateItems, setCandidateItems] = useState<CandidateItem[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("その他");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("その他");
  const [editNote, setEditNote] = useState("");

  const handleLogout = async () => {
  await supabase.auth.signOut();
  window.location.href = "/login";
};

  useEffect(() => {
  fetchItems();
  fetchCandidateItems();
}, []);

useEffect(() => {
  const checkUser = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
    }
  };

  checkUser();
}, []);

  const fetchCandidateItems = async () => {
  const [
    { data: defaultData, error: defaultError },
    { data: userData, error: userError },
  ] = await Promise.all([
    supabase
      .from("item_master")
      .select("name, yomi, category, note")
      .order("id", { ascending: true }),

    supabase
      .from("user_item_master")
      .select("name")
      .order("id", { ascending: false }),
  ]);

  console.log("default candidate data:", defaultData);
  console.log("user candidate data:", userData);
  console.log("default candidate error:", defaultError);
  console.log("user candidate error:", userError);

  if (defaultError || userError) {
    console.error("候補取得エラー:", defaultError || userError);
    alert(
      `候補の読み込みに失敗しました: ${
        defaultError?.message || userError?.message
      }`
    );
    return;
  }

  const defaultCandidates: CandidateItem[] = (defaultData || []).map((item) => ({
    name: item.name,
    yomi: item.yomi ?? "",
    category: item.category ?? "その他",
    note: item.note ?? "",
  }));

  const userCandidates: CandidateItem[] = (userData || []).map((item) => ({
    name: item.name,
    yomi: "",
    category: "その他",
    note: "",
  }));

  const merged = [...userCandidates, ...defaultCandidates];

  const uniqueCandidates = Array.from(
    new Map(
      merged.map((item) => [item.name.trim().toLowerCase(), item])
    ).values()
  );

  setCandidateItems(uniqueCandidates);
};

  const fetchItems = async () => {
    const { data, error } = await supabase
      .from("shopping_items")
      .select("*")
      .order("checked", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("取得エラー:", error);
      alert(`読み込みに失敗しました: ${error.message}`);
      return;
    }

    setShoppingItems(data || []);
  };

   const filteredItems = candidateItems.filter((item) => {
  const normalizedSearch = toHiragana(search);
  const normalizedName = toHiragana(item.name);
  const normalizedYomi = toHiragana(item.yomi ?? "");

  return (
    normalizedName.includes(normalizedSearch) ||
    normalizedYomi.includes(normalizedSearch) ||
    search === ""
  );
});

  const groupedItems = useMemo(() => {
    return categories.map((category) => ({
      category,
      items: shoppingItems.filter((item) => item.category === category),
    }));
  }, [shoppingItems]);

  const addItem = async (item: Omit<ShoppingItem, "id" | "checked">) => {
    const trimmedName = item.name.trim();

    if (!trimmedName) return;

    const alreadyExists = shoppingItems.some(
      (shoppingItem) =>
        shoppingItem.name === trimmedName && !shoppingItem.checked
    );

    if (alreadyExists) {
      alert(`${trimmedName} はすでに追加されています`);
      return;
    }

    const { error } = await supabase.from("shopping_items").insert([
      {
        name: trimmedName,
        category: item.category,
        note: item.note,
        checked: false,
      },
    ]);

    if (error) {
      console.error("追加エラー:", error);
      alert(`保存に失敗しました: ${error.message}`);
      return;
    }

await supabase.from("user_item_master").upsert(
  [
    {
      name: trimmedName,
    },
  ],
  {
    onConflict: "name",
  }
);

    await fetchItems();
await fetchCandidateItems();
setSearch("");
setSelectedCategory("その他");
  };

  const toggleItem = async (id: number, currentChecked: boolean) => {
    const { error } = await supabase
      .from("shopping_items")
      .update({ checked: !currentChecked })
      .eq("id", id);

    if (error) {
      console.error("チェック更新エラー:", error);
      alert(`チェック更新に失敗しました: ${error.message}`);
      return;
    }

    await fetchItems();
  };

  const deleteItem = async (id: number) => {
    const { error } = await supabase
      .from("shopping_items")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("削除エラー:", error);
      alert(`削除に失敗しました: ${error.message}`);
      return;
    }

    await fetchItems();
  };

  const startEdit = (item: ShoppingItem) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditCategory(item.category);
    setEditNote(item.note);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditCategory("その他");
    setEditNote("");
  };

  const saveEdit = async () => {
    if (editingId === null) return;

    const trimmedName = editName.trim();

    if (!trimmedName) {
      alert("アイテム名を入れてね");
      return;
    }

    const { error } = await supabase
      .from("shopping_items")
      .update({
        name: trimmedName,
        category: editCategory,
        note: editNote,
      })
      .eq("id", editingId);

    if (error) {
      console.error("編集エラー:", error);
      alert(`編集に失敗しました: ${error.message}`);
      return;
    }

    await fetchItems();
    cancelEdit();
  };

const deleteCheckedItems = async () => {
  const checkedItems = shoppingItems.filter((item) => item.checked);

  if (checkedItems.length === 0) {
    alert("チェック済みの項目がありません");
    return;
  }

  const confirmed = confirm("チェック済みの項目をまとめて削除する？");

  if (!confirmed) return;

  const checkedIds = checkedItems.map((item) => item.id);

  const { error } = await supabase
    .from("shopping_items")
    .delete()
    .in("id", checkedIds);

  if (error) {
    console.error("一括削除エラー:", error);
    alert(`一括削除に失敗しました: ${error.message}`);
    return;
  }

  await fetchItems();
};

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8">
      <div className="mx-auto max-w-xl">
        <header className="mb-6 flex justify-between items-start">
  <div>
    <p className="text-sm text-neutral-500">My Shopping List</p>
    <h1 className="text-3xl font-bold text-neutral-900">お買い物リスト</h1>
    <p className="mt-2 text-sm text-neutral-600">
      よく使うアイテムを検索して、かんたんに追加できます
      <span className="ml-1 text-xs text-neutral-400">（β版）</span>
    </p>
  </div>

  <button
    onClick={handleLogout}
    className="rounded-xl bg-neutral-200 px-3 py-2 text-sm text-neutral-700"
  >
    ログアウト
  </button>
</header>

        <div className="mb-4 flex justify-end">
  <button
    onClick={deleteCheckedItems}
    className="rounded-xl bg-red-500 px-4 py-2 text-sm text-white"
  >
    チェック済みを削除
  </button>
</div>

        <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
          <label className="mb-2 block text-sm font-medium text-neutral-700">
            アイテムを検索
          </label>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="たまご、牛乳…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && search.trim() !== "") {
                  addItem({
                    name: search,
                    category: selectedCategory,
                    note: "",
                  });
                }
              }}
              className="flex-1 rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-neutral-500"
            />

            <button
  type="button"
  onClick={() => {
    if (!search.trim()) return;

    addItem({
      name: search,
      category: selectedCategory,
      note: "",
    });
  }}
  className="rounded-xl bg-blue-500 px-4 py-3 text-sm text-white"
>
  追加
</button>
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-2 text-sm"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {search.trim() !== "" && (
  <div className="mt-3">
    {filteredItems.length > 0 ? (
      <div className="flex flex-wrap gap-2">
        {filteredItems.map((item) => (
          <button
            key={item.name}
            type="button"
            onClick={() =>
  addItem({
    name: item.name,
    category: item.category ?? "その他",
    note: item.note ?? "",
  })
}
            className="rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-700 transition hover:bg-neutral-200"
          >
            {item.name}
          </button>
        ))}
      </div>
    ) : (
      <div className="rounded-xl bg-neutral-50 p-3 ring-1 ring-neutral-200">
        <p className="text-sm text-neutral-500">
          該当するアイテムがありません
        </p>

        <button
          type="button"
          onClick={() =>
            addItem({
              name: search,
              category: selectedCategory,
              note: "",
            })
          }
          className="mt-2 rounded-lg bg-blue-500 px-3 py-2 text-sm text-white"
        >
          「{search}」を追加する
        </button>
      </div>
    )}
  </div>
)}
        </section>

        <section className="space-y-4">
          {groupedItems.map(({ category, items }) => (
            <div
              key={category}
              className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-neutral-200"
            >
              <h2 className="mb-3 text-lg font-semibold text-neutral-800">
                {category}
              </h2>

              {items.length === 0 ? (
                <p className="text-sm text-neutral-400">まだありません</p>
              ) : (
                <div className="space-y-3">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 rounded-xl border border-neutral-100 p-3"
                    >
                      {editingId === item.id ? (
                        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-start">
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                            placeholder="食材名"
                          />

                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                          >
                            {categories.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>

                          <input
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                            placeholder="メモ"
                          />

                          <button
                            onClick={saveEdit}
                            className="rounded-lg bg-blue-500 px-3 py-2 text-sm text-white"
                          >
                            保存
                          </button>

                          <button
                            onClick={cancelEdit}
                            className="rounded-lg bg-neutral-200 px-3 py-2 text-sm text-neutral-700"
                          >
                            キャンセル
                          </button>
                        </div>
                      ) : (
                        <>
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={() => toggleItem(item.id, item.checked)}
                            className="mt-1 h-4 w-4"
                          />

                          <div className="flex-1">
                            <p
                              className={`font-medium ${
                                item.checked
                                  ? "text-neutral-400 line-through opacity-60"
                                  : "text-neutral-900"
                              }`}
                            >
                              {item.name}
                            </p>
                            <p className="text-sm text-neutral-500">
                              {item.note}
                            </p>
                          </div>

                          <button
                            onClick={() => startEdit(item)}
                            className="text-sm text-blue-500"
                          >
                            編集
                          </button>

                          <button
                            onClick={() => {
                              if (confirm("削除していい？")) {
                                deleteItem(item.id);
                              }
                            }}
                            className="ml-2 text-sm text-red-500"
                          >
                            削除
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}