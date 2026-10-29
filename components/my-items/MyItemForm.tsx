"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { categories } from "@/lib/categories";
import { supabase } from "@/lib/supabase";
import { createMyItem, getMyItemCapacity, myItemError, uploadMyItemImage, type MyItem, type MyItemCapacity } from "@/lib/myItems";

type Props = {
  userId: string; initialName?: string; initialCategory?: string;
  onSaved: (item: MyItem) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
};

export default function MyItemForm({ userId, initialName = "", initialCategory = "その他", onSaved, onCancel, submitLabel = "My Itemsに登録" }: Props) {
  const id = useId();
  const [name, setName] = useState(initialName);
  const [yomi, setYomi] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const [imageUrl, setImageUrl] = useState("");
  const [capacity, setCapacity] = useState<MyItemCapacity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState<MyItem | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    try { setCapacity(await getMyItemCapacity(supabase, userId)); }
    catch (e) { setCapacity(null); setError(myItemError(e)); }
  }, [userId]);
  useEffect(() => {
    let active = true;
    getMyItemCapacity(supabase, userId).then(value => { if (active) setCapacity(value); })
      .catch(e => { if (active) setError(myItemError(e)); });
    return () => { active = false; };
  }, [userId]);

  const atLimit = capacity !== null && capacity.count >= capacity.limit;
  const fieldClass = "w-full rounded-xl border bg-white px-3 py-2 text-base text-gray-800 disabled:opacity-60";

  return (
    <form aria-label="My Items登録" className="space-y-3 rounded-2xl bg-white p-4 text-gray-700 ring-1 ring-neutral-200"
      onSubmit={async event => {
        event.preventDefault();
        if (inFlight.current || (!saved && (!capacity || atLimit))) return;
        inFlight.current = true; setBusy(true); setError(""); setNotice("");
        try {
          const item = saved ?? await createMyItem(supabase, userId, { name, yomi, category, image_url: imageUrl });
          setSaved(item);
          // If the shopping-list step fails, keep the successful master and retry only the next step.
          await onSaved(item);
          setSaved(null); setName(""); setYomi(""); setImageUrl(""); setCategory("その他");
          setNotice("My Itemsに登録しました。");
        } catch (e) { setError(myItemError(e)); }
        finally { await refresh(); inFlight.current = false; setBusy(false); }
      }}>
      <p className="font-bold">新規アイテム登録</p>
      <p className="text-sm">アイテム名だけでも登録できます。</p>
      <fieldset disabled={busy || saved !== null} className="space-y-3">
        <label className="block" htmlFor={id + "-name"}>アイテム名（必須）
          <input id={id + "-name"} required value={name} onChange={e => setName(e.target.value)} className={fieldClass} />
        </label>
        <label className="block" htmlFor={id + "-yomi"}>よみ（任意）
          <input id={id + "-yomi"} value={yomi} onChange={e => setYomi(e.target.value)} placeholder="ひらがな／空欄でもOK" className={fieldClass} />
        </label>
        <div>
          <label className="block" htmlFor={id + "-category"}>カテゴリ</label>
          <select id={id + "-category"} value={category} onChange={e => setCategory(e.target.value)} className={fieldClass}>
            {categories.map(cat => <option key={cat.name} value={cat.name}>{cat.emoji} {cat.name}</option>)}
          </select>
        </div>
        <label className="block" htmlFor={id + "-image"}>画像URL・絵文字（任意）
          <input id={id + "-image"} value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="未指定の場合は🛒" className={fieldClass} />
        </label>
        {/^https?:\/\//.test(imageUrl) && <img src={imageUrl} alt="登録するアイテムの画像" className="h-20 w-20 rounded-xl object-cover" />}
        {(capacity?.plan === "special" || capacity?.plan === "pro") && (
          <label className="block" htmlFor={id + "-file"}>画像を選択（任意）
            <input id={id + "-file"} type="file" accept="image/*" disabled={atLimit}
              onChange={async event => {
                const file = event.target.files?.[0]; event.target.value = "";
                if (!file || inFlight.current) return;
                inFlight.current = true; setBusy(true); setError("");
                try { setImageUrl(await uploadMyItemImage(supabase, userId, file)); }
                catch (e) { setError(myItemError(e)); }
                finally { inFlight.current = false; setBusy(false); }
              }} className={fieldClass} />
          </label>
        )}
      </fieldset>
      <p role="status" className="text-sm">
        {capacity ? `${capacity.count} / ${capacity.limit}件` : "登録上限を確認中です"}
        {atLimit && "：上限に達しています。新規登録にはアイテムの整理またはプランの確認が必要です。"}
      </p>
      {saved && <p role="status" className="text-sm">My Itemsには登録済みです。買い物リストへの追加を再試行できます。</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy || (!saved && (!capacity || atLimit || !name.trim()))}
          className="rounded-xl bg-blue-500 px-4 py-2 text-white disabled:opacity-50">
          {busy ? "処理中…" : saved ? "買い物リストへの追加を再試行" : submitLabel}
        </button>
        <button type="button" disabled={busy} onClick={() => { setError(""); void refresh(); }} className="rounded-xl border px-3 py-2">上限を再確認</button>
        {onCancel && <button type="button" disabled={busy} onClick={onCancel} className="rounded-xl border px-3 py-2">閉じる</button>}
      </div>
    </form>
  );
}
