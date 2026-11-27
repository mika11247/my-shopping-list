"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export const withdrawalReceiptKey = "account-withdrawal-receipt";
const receiptEvent = "account-withdrawal-receipt-changed";

function subscribeReceipt(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(receiptEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(receiptEvent, callback);
  };
}

function storeReceipt(receipt?: { id: string; owner: string }) {
  if (receipt) window.localStorage.setItem(withdrawalReceiptKey, JSON.stringify(receipt));
  else window.localStorage.removeItem(withdrawalReceiptKey);
  window.dispatchEvent(new Event(receiptEvent));
}

type Group = {
  id: string; name: string; owner: boolean; otherMembers: number;
  shopping: number; history: number; mealPlans: number;
};
type Preview = { groups: Group[]; method: "password" | "email" };

async function request(body: object, authenticated = true) {
  const session = authenticated ? (await supabase.auth.getSession()).data.session : null;
  const reply = await fetch("/api/delete-user", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await reply.json();
  if (!reply.ok) throw new Error(data.error ?? "退会処理を続けられませんでした。");
  return data;
}

export default function AccountWithdrawal({ onCompleted }: { onCompleted: (value: boolean) => void }) {
  const receipt = useSyncExternalStore(subscribeReceipt,
    () => window.localStorage.getItem(withdrawalReceiptKey) ?? "", () => "");
  const [completed, setCompleted] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [credential, setCredential] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!receipt || completed) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        const { id, owner } = JSON.parse(receipt);
        const keepReceipt = async () => {
          const { data } = await supabase.auth.getSession();
          if (!active || window.localStorage.getItem(withdrawalReceiptKey) !== receipt) return false;
          if (data.session && data.session.user.id !== owner) {
            storeReceipt();
            return false;
          }
          return true;
        };
        if (!await keepReceipt()) return;
        const status = await request({ action: "status", id }, false);
        if (!await keepReceipt()) return;
        if (status.stage === "complete") {
          setCompleted(true);
          onCompleted(true);
          storeReceipt();
          const { data } = await supabase.auth.getSession();
          if (data.session?.user.id === owner) await supabase.auth.signOut({ scope: "local" });
          return;
        }
      } catch {
        if (active) setMessage("退会処理の状況を確認しています。");
      }
      if (active) timer = setTimeout(check, 4000);
    }
    void check();
    return () => { active = false; clearTimeout(timer); };
  }, [receipt, completed, onCompleted]);

  async function run(action: "preview" | "code" | "begin") {
    setBusy(true);
    setMessage("");
    try {
      if (action === "preview") {
        setAccepted(false);
        setPreview(await request({ action }));
      } else if (action === "code") {
        await request({ action });
        setMessage("確認済みメールアドレスにコードを送信しました。");
      } else if (preview && accepted) {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) throw new Error("ログインし直してください。");
        const data = await request({
          action, groups: preview.groups,
          ...(preview.method === "password" ? { password: credential } : { code: credential }),
        });
        storeReceipt({ id: data.id, owner: session.session.user.id });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "退会処理を続けられませんでした。");
    } finally {
      setBusy(false);
      if (action === "begin") setCredential("");
    }
  }

  const button = "w-full rounded-full bg-white px-4 py-3 text-sm font-bold text-red-500 shadow ring-1 ring-red-100 disabled:opacity-50";
  if (completed) return <p role="status" className="mt-4 text-sm font-bold">退会処理が完了しました。</p>;
  if (receipt) return (
    <p role="status" className="mt-4 text-sm">
      退会を受け付けました。{message || "削除処理を確認しています。完了後にメールでお知らせします。"}
    </p>
  );
  if (process.env.NEXT_PUBLIC_ACCOUNT_WITHDRAWAL_ENABLED !== "true") {
    return <button type="button" disabled className={button}>退会機能は停止中</button>;
  }
  const transferRequired = preview?.groups.some((group) => group.owner && group.otherMembers > 0);
  return (
    <section className="mt-4 space-y-3 text-sm">
      <button type="button" className={button} disabled={busy} onClick={() => void run("preview")}>
        {preview ? "削除対象を再確認" : "退会手続き"}
      </button>
      {preview && <>
        <p>個人データ、個人専用画像、アカウントを削除します。</p>
        <ul className="space-y-2">
          {preview.groups.map((group) => <li key={group.id}>
            <strong>{group.name}</strong>{" "}
            {group.owner && group.otherMembers > 0 ? "他のメンバーへの所有権譲渡が必要です。"
              : group.owner ? `グループと買い物 ${group.shopping} 件、履歴 ${group.history} 件、献立 ${group.mealPlans} 件を削除します。`
              : "共有データを保持し、あなたの所属を解除します。"}
          </li>)}
        </ul>
        {transferRequired ? <Link href="/" className="underline">共有リスト管理に戻る</Link> : <>
          {preview.method === "email" && (
            <button type="button" className={button} disabled={busy} onClick={() => void run("code")}>確認コードを送る</button>
          )}
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void run("begin"); }}>
            <label className="block">
              {preview.method === "password" ? "現在のパスワード" : "メールの確認コード"}
              <input className="mt-1 w-full rounded-xl border px-3 py-2" required
                type={preview.method === "password" ? "password" : "text"}
                autoComplete={preview.method === "password" ? "current-password" : "one-time-code"}
                inputMode={preview.method === "email" ? "numeric" : undefined}
                value={credential} onChange={(event) => setCredential(event.target.value)} />
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
              表示された削除対象を確認し、退会に同意します。
            </label>
            <button type="submit" className={button} disabled={!accepted || !credential || busy}>確認して退会する</button>
          </form>
        </>}
      </>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
