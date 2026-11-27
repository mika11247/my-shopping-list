"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Member = { user_id: string; display_name?: string; role: string };
type Offer = { from_user_id: string; to_user_id: string; expires_at: string };

export default function ShoppingGroupTransfer({
  groupId, userId, owner, members, onChanged,
}: {
  groupId: string; userId: string; owner: boolean; members: Member[]; onChanged: () => Promise<void>;
}) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc("shopping_group_transfer_status", { p_group_id: groupId });
    if (!error) setOffer(data?.[0] ?? null);
  }, [groupId]);

  useEffect(() => {
    const initialLoad = setTimeout(refresh, 0);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(initialLoad);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  const candidates = members.filter((member) => member.role === "member" && member.user_id !== userId);

  async function run(action: "offer" | "cancel" | "accept") {
    if (action === "accept" && !window.confirm("この共有リストの所有権を引き継ぎますか？")) return;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.rpc(`${action}_shopping_group_transfer`, {
        p_group_id: groupId,
        ...(action === "offer" ? { p_recipient: recipient } : {}),
        ...(action === "accept" ? { p_expires_at: offer?.expires_at } : {}),
      });
      if (error?.message === "TRANSFER_OWNED_GROUP_LIMIT") {
        setMessage("譲渡先の所有グループ数が上限です。所有枠を空けるか、別の譲渡先を選んでください。");
      } else if (error?.message === "TRANSFER_MEMBER_LIMIT") {
        setMessage("現在の人数が譲渡先のプラン上限を超えています。条件を満たす別の譲渡先を選んでください。");
      } else if (error) {
        setMessage("譲渡を処理できませんでした。メンバーと依頼の状況を確認してください。");
      } else if (action === "accept") {
        setMessage("所有権を引き継ぎました。");
        await onChanged();
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-3 space-y-2 text-sm">
      {owner && candidates.length > 0 && <div className="flex flex-wrap items-center gap-2">
        <label>
          譲渡先{" "}
          <select className="rounded-xl border bg-white px-2 py-1" value={recipient}
            onChange={(event) => setRecipient(event.target.value)}>
            <option value="">メンバーを選択</option>
            {candidates.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name ?? "メンバー"}</option>)}
          </select>
        </label>
        <button type="button" className="rounded-xl bg-white px-3 py-1 ring-1 ring-neutral-200"
          disabled={busy || !recipient} onClick={() => void run("offer")}>譲渡を依頼</button>
      </div>}
      {owner && offer && <p>
        {members.find((member) => member.user_id === offer.to_user_id)?.display_name ?? "メンバー"}の承諾を待っています。{" "}
        <button type="button" className="underline" disabled={busy} onClick={() => void run("cancel")}>取り消す</button>
      </p>}
      {!owner && offer?.to_user_id === userId && <p>
        この共有リストの所有権譲渡を依頼されています。{" "}
        <button type="button" className="underline" disabled={busy} onClick={() => void run("accept")}>承諾する</button>
      </p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
