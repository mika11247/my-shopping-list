"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { categories } from "@/lib/categories";
import { getLimitByPlan } from "@/lib/planLimits";



type MasterItem = {
  id: number;
  name: string;
  yomi: string | null;
  category: string | null;
  user_id: string;
  image_url?: string | null;
};

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

const [newImageUrl, setNewImageUrl] = useState("");
const [editImageUrl, setEditImageUrl] = useState("");

const [userPlan, setUserPlan] = useState<string>("free");
const [userRole, setUserRole] = useState<"admin" | "user">("user");

const [theme, setTheme] = useState("default");
const [uploading, setUploading] = useState(false);

useEffect(() => {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme) {
    setTheme(savedTheme);
  }
}, []);

const masterLimit = getLimitByPlan(userRole, userPlan, "master");

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
  
      if (!user) return;
  
      setUserId(user.id);
  
      // 👇ここ追加🔥
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role, plan")
        .eq("user_id", user.id)
        .single();
  
      if (error) {
        console.error("profile取得エラー:", error);
      } else {
        setUserPlan(profile?.plan ?? "free");
        setUserRole(profile?.role ?? "user");
      }
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
      .select("id, name, yomi, category, user_id, image_url")
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
    // 👇 追加（ここ一番上）
if (items.length >= masterLimit) {
  alert(`My itemsは${masterLimit}件まで登録できます`);
  return;
}
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

    const { data, error } = await supabase
  .from("user_item_master")
  .upsert(
    [
      {
        user_id: userId,
        name: trimmedName,
        yomi: yomiToSave,
        category: newCategory,
        image_url: newImageUrl || "🛒",
      },
    ],
    {
      onConflict: "user_id,name",
    }
  )
  .select()
  .single();

    if (error) {
      console.error("追加エラー:", error);
      return;
    }

   setItems((prev) => [...prev, data]);

setNewItem("");
setNewYomi("");
setNewImageUrl(""); // ←ここ🔥
setNewCategory("その他");
  };

  const updateMasterItem = async (
    id: number,
    name: string,
    yomi: string,
    category: string,
    image_url: string
  ) => {
  if (!userId) return;

  const currentItem = items.find((item) => item.id === id);

if (
  currentItem?.image_url?.startsWith("http") &&
  currentItem.image_url !== image_url
) {
  await deleteStorageImage(currentItem.image_url);
}

  const { data, error } = await supabase
    .from("user_item_master")
    .update({
      name,
      yomi,
      category,
      image_url,
    })
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
      item.id === id
        ? {
            ...item,
            name,
            yomi,
            category,
            image_url,
          }
        : item
    )
  );

  setEditingId(null);
};

const deleteMasterItem = async (id: number) => {
  const targetItem = items.find((item) => item.id === id);

  if (targetItem?.image_url?.startsWith("http")) {
    await deleteStorageImage(targetItem.image_url);
  }

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

const compressImage = async (file: File) => {
  return new Promise<File>((resolve) => {
    const img = new Image();
    const reader = new FileReader();

    reader.readAsDataURL(file);

    reader.onload = (event) => {
      img.src = event.target?.result as string;
    };

    img.onload = () => {
      const canvas = document.createElement("canvas");

      const maxWidth = 800;

      const scale = Math.min(1, maxWidth / img.width);

      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext("2d");

      ctx?.drawImage(
        img,
        0,
        0,
        canvas.width,
        canvas.height
      );

      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(file);

          const compressedFile = new File(
            [blob],
            file.name,
            {
              type: "image/jpeg",
            }
          );

          resolve(compressedFile);
        },
        "image/jpeg",
        0.7
      );
    };
  });
};

  const uploadImage = async (file: File) => {
    const compressedFile = await compressImage(file);
    if (!userId) return null;
  
    setUploading(true);
  
    const fileExt = file.name.split(".").pop();
    const fileName = `${userId}/${Date.now()}.${fileExt}`;
  
    const { error } = await supabase.storage
      .from("item-images")
      .upload(fileName, compressedFile);
  
    if (error) {
      console.error("画像アップロードエラー:", error);
      alert("画像のアップロードに失敗しました");
  
      setUploading(false);
      return null;
    }
  
    const { data } = supabase.storage
      .from("item-images")
      .getPublicUrl(fileName);
  
    setUploading(false);
  
    return data.publicUrl;
  };

  const extractStoragePath = (url: string) => {
    const marker = "/storage/v1/object/public/item-images/";
  
    const index = url.indexOf(marker);
  
    if (index === -1) return null;
  
    return url.substring(index + marker.length);
  };

  const deleteStorageImage = async (url: string) => {
    const path = extractStoragePath(url);
  
    if (!path) return;
  
    const { error } = await supabase.storage
      .from("item-images")
      .remove([path]);
  
    if (error) {
      console.error("画像削除エラー:", error);
    }
  };

  return (

    <main
  className={`min-h-screen p-4 ${theme} master`}
  style={{ background: "var(--bg-gradient)" }}
>
      <div className="mx-auto max-w-md rounded-3xl bg-white p-5 shadow">
        <div className="mb-4 flex items-start justify-between gap-4">
  <div>
    <h1 className="text-2xl font-bold"
style={{
  color:
    theme === "default" ? "#db2777" : "var(--main-text)",
}}>My items</h1>
    <p className="mt-1 text-sm text-gray-500">
      あなたが追加したアイテムを編集・整理できます。
    </p>
  </div>

  <button
    onClick={() => window.location.href = "/"}
    className="rounded-full px-3 py-1 text-xs shadow"
style={{
  backgroundColor:
    theme === "default" ? "#ffffff" : "var(--sub-bg)",
  color:
    theme === "default" ? "#525252" : "var(--main-text)",
  border: `1px solid ${
    theme === "default" ? "#fbcfe8" : "var(--ring-color)"
  }`,
}}
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
    className="rounded-xl border bg-white px-3 py-2 text-base text-gray-700 outline-none"
style={{
  borderColor:
    theme === "default" ? "#fbcfe8" : "var(--ring-color)",
}}
onFocus={(e) => {
  e.target.style.borderColor =
    theme === "default" ? "#ec4899" : "var(--main-color)";
}}
onBlur={(e) => {
  e.target.style.borderColor =
    theme === "default" ? "#fbcfe8" : "var(--ring-color)";
}}
  />

  {/* 👇これ追加🔥 */}
  <input
    value={newYomi}
    onChange={(e) => setNewYomi(e.target.value)}
    placeholder="よみ（ひらがな／空欄でもOK）"
    className="rounded-xl border bg-white px-3 py-2 text-base text-gray-700 outline-none"
style={{
  borderColor:
    theme === "default" ? "#fbcfe8" : "var(--ring-color)",
}}
onFocus={(e) => {
  e.target.style.borderColor =
    theme === "default" ? "#ec4899" : "var(--main-color)";
}}
onBlur={(e) => {
  e.target.style.borderColor =
    theme === "default" ? "#fbcfe8" : "var(--ring-color)";
}}
  />

<input
  value={newImageUrl}
  onChange={(e) => setNewImageUrl(e.target.value)}
  placeholder={
    userPlan === "pro" || userPlan === "special"
      ? "画像URL or 絵文字"
      : "絵文字"
  }
  className="rounded-xl border bg-white px-3 py-2 text-base text-gray-700 outline-none"
  style={{
    borderColor:
      theme === "default" ? "#fbcfe8" : "var(--ring-color)",
  }}
  onFocus={(e) => {
    e.target.style.borderColor =
      theme === "default" ? "#ec4899" : "var(--main-color)";
  }}
  onBlur={(e) => {
    e.target.style.borderColor =
      theme === "default" ? "#fbcfe8" : "var(--ring-color)";
  }}
/>

{newImageUrl?.startsWith("http") && (
  <img
    src={newImageUrl}
    className="h-20 w-20 rounded-xl object-cover shadow"
  />
)}

{(userPlan === "pro" || userPlan === "special") && (
  <label
  className="flex cursor-pointer items-center justify-center rounded-xl px-3 py-2 text-sm font-bold shadow-sm"
  style={{
    backgroundColor:
      theme === "default" ? "#fce7f3" : "var(--main-bg)",
    color:
      theme === "default" ? "#db2777" : "var(--main-text)",
    border: `1px solid ${
      theme === "default" ? "#fbcfe8" : "var(--ring-color)"
    }`,
  }}
>
  画像を選択
  <input
    type="file"
    accept="image/*"
    onChange={async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const url = await uploadImage(file);

      if (url) {
        if (newImageUrl.startsWith("http")) {
          await deleteStorageImage(newImageUrl);
        }
        setNewImageUrl(url);
      }
    }}
    className="hidden"
  />
</label>
)}



{uploading && (
  <p className="text-xs text-gray-400">
    アップロード中...
  </p>
)}

{newImageUrl?.startsWith("http") && (
  <button
    type="button"
    onClick={() => setNewImageUrl("")}
    className="text-xs text-red-500"
  >
    画像を削除
  </button>
)}

  <div className="flex gap-2">
    <select
      value={newCategory}
      onChange={(e) => setNewCategory(e.target.value)}
      className="rounded-xl border bg-white px-3 py-2 text-base text-gray-700 outline-none"
style={{
  borderColor:
    theme === "default" ? "#fbcfe8" : "var(--ring-color)",
}}
onFocus={(e) => {
  e.target.style.borderColor =
    theme === "default" ? "#ec4899" : "var(--main-color)";
}}
onBlur={(e) => {
  e.target.style.borderColor =
    theme === "default" ? "#fbcfe8" : "var(--ring-color)";
}}
    >
      {categories.map((cat) => (
        <option key={cat} value={cat}>
          {cat}
        </option>
      ))}
    </select>

    <button
      onClick={addMasterItem}
      className="rounded-xl px-4 py-2 text-sm text-white"
style={{
  backgroundColor:
    theme === "default" ? "#ec4899" : "var(--main-color)",
}}
    >
      追加
    </button>

    {items.length >= masterLimit - 5 && userPlan !== "pro" && (
  <p className="text-xs text-gray-400">
    あと{masterLimit - items.length}件で上限です
  </p>
)}

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
  className="rounded-2xl p-4 shadow-sm"
style={{
  backgroundColor:
    theme === "default" ? "#fdf2f8" : "var(--sub-bg)",
  border: `1px solid ${
    theme === "default" ? "#fbcfe8" : "var(--ring-color)"
  }`,
}}
>
  <div className="flex flex-col gap-3">
    {editingId === item.id ? (
      <>
        <div className="flex flex-col gap-2">
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="rounded-xl border bg-white px-3 py-2 text-base text-gray-800 outline-none"
style={{
  borderColor:
    theme === "default" ? "#fbcfe8" : "var(--ring-color)",
}}
onFocus={(e) => {
  e.target.style.borderColor =
    theme === "default" ? "#ec4899" : "var(--main-color)";
}}
onBlur={(e) => {
  e.target.style.borderColor =
    theme === "default" ? "#fbcfe8" : "var(--ring-color)";
}}
            placeholder="アイテム名"
          />

          <input
            value={editYomi}
            onChange={(e) => setEditYomi(e.target.value)}
            className="rounded-xl border bg-white px-3 py-2 text-base text-gray-800 outline-none"
style={{
  borderColor:
    theme === "default" ? "#fbcfe8" : "var(--ring-color)",
}}
onFocus={(e) => {
  e.target.style.borderColor =
    theme === "default" ? "#ec4899" : "var(--main-color)";
}}
onBlur={(e) => {
  e.target.style.borderColor =
    theme === "default" ? "#fbcfe8" : "var(--ring-color)";
}}
            placeholder="よみ"
          />

<input
  value={editImageUrl}
  onChange={(e) => setEditImageUrl(e.target.value)}
  className="rounded-xl border bg-white px-3 py-2 text-base text-gray-800 outline-none"
  style={{
    borderColor:
      theme === "default" ? "#fbcfe8" : "var(--ring-color)",
  }}
  onFocus={(e) => {
    e.target.style.borderColor =
      theme === "default" ? "#ec4899" : "var(--main-color)";
  }}
  onBlur={(e) => {
    e.target.style.borderColor =
      theme === "default" ? "#fbcfe8" : "var(--ring-color)";
  }}
  placeholder={
    userPlan === "pro" || userPlan === "special"
      ? "画像URL or 絵文字"
      : "絵文字"
  }
/>

{editImageUrl?.startsWith("http") && (
  <img
    src={editImageUrl}
    className="h-20 w-20 rounded-xl object-cover shadow"
  />
)}

{(userPlan === "pro" || userPlan === "special") && (
  <label
  className="flex cursor-pointer items-center justify-center rounded-xl px-3 py-2 text-sm font-bold shadow-sm"
  style={{
    backgroundColor:
      theme === "default" ? "#fce7f3" : "var(--main-bg)",
    color:
      theme === "default" ? "#db2777" : "var(--main-text)",
    border: `1px solid ${
      theme === "default" ? "#fbcfe8" : "var(--ring-color)"
    }`,
  }}
>
  画像を選択
  <input
    type="file"
    accept="image/*"
    onChange={async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const url = await uploadImage(file);

      if (url) {
        if (editImageUrl.startsWith("http")) {
          await deleteStorageImage(editImageUrl);
        }
        setEditImageUrl(url);
      }
    }}
    className="hidden"
  />
</label>
)}

{editImageUrl?.startsWith("http") && (
  <button
    type="button"
    onClick={() => setEditImageUrl("")}
    className="text-xs text-red-500"
  >
    画像を削除
  </button>
)}

<select
  value={editCategory}
  onChange={(e) => setEditCategory(e.target.value)}
  className="rounded-xl border bg-white px-3 py-2 text-base text-gray-800 outline-none"
  style={{
    borderColor:
      theme === "default" ? "#fbcfe8" : "var(--ring-color)",
  }}
  onFocus={(e) => {
    e.target.style.borderColor =
      theme === "default" ? "#ec4899" : "var(--main-color)";
  }}
  onBlur={(e) => {
    e.target.style.borderColor =
      theme === "default" ? "#fbcfe8" : "var(--ring-color)";
  }}
>
  {categories.map((cat) => (
    <option key={cat} value={cat}>
      {cat}
    </option>
  ))}
</select>
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <button
            onClick={() =>
              updateMasterItem(
                item.id,
                editName,
                editYomi,
                editCategory,
                editImageUrl
              )
            }
            className="min-w-[60px] rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-600 shadow ring-1 ring-green-200 hover:bg-green-200"
          >
            保存
          </button>

          <button
            onClick={() => {
              setEditingId(null);
              setEditName("");
              setEditYomi("");
              setEditCategory("その他");
              setEditImageUrl("");
            }}
            className="min-w-[60px] rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 shadow ring-1 ring-gray-200 hover:bg-gray-200"
          >
            キャンセル
          </button>

          <button
            onClick={() => {
              if (confirm(`「${item.name}」を削除していい？`)) {
                deleteMasterItem(item.id);
              }
            }}
            className="min-w-[60px] rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-600 shadow ring-1 ring-red-200 hover:bg-red-200"
          >
            削除
          </button>
        </div>
      </>
    ) : (
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-3">
  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-xl shadow-sm ring-1 ring-pink-100">
    {item.image_url?.startsWith("http") ? (
      <img
        src={item.image_url}
        className="h-8 w-8 rounded object-cover"
      />
    ) : (
      <span>{item.image_url ?? "🛒"}</span>
    )}
  </div>

  <div className="flex flex-col">
    <span className="text-gray-800">
      {item.name}
    </span>

    <span className="text-xs text-gray-500">
      {item.yomi ? `${item.yomi} / ` : ""}
      {item.category ?? "その他"}
    </span>
  </div>
</div>
         
        </div>

        <div className="flex gap-2">
        <button
  onClick={() => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditYomi(item.yomi ?? "");
    setEditCategory(item.category ?? "その他");
    setEditImageUrl(item.image_url ?? "🛒");
  }}
  className="rounded-full px-3 py-1 text-xs shadow"
  style={{
    backgroundColor:
      theme === "default" ? "#fce7f3" : "var(--main-bg)",
    color:
      theme === "default" ? "#db2777" : "var(--main-text)",
    border: `1px solid ${
      theme === "default" ? "#fbcfe8" : "var(--ring-color)"
    }`,
  }}
>
  編集
</button>

          <button
            onClick={() => {
              if (confirm(`「${item.name}」を削除していい？`)) {
                deleteMasterItem(item.id);
              }
            }}
            className="rounded-full bg-red-100 px-3 py-1 text-xs text-red-600 shadow ring-1 ring-red-200 hover:bg-red-200"
          >
            削除
          </button>
        </div>
      </div>
    )}
  </div>
</li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}