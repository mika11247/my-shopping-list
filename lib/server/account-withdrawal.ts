import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export function withdrawalClient(admin = false) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = admin ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Withdrawal configuration missing");
  return createClient(url, key, options);
}

export async function sendWithdrawalMail(to: string, subject: string, text: string, key: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Withdrawal mail configuration missing");
  const endpoint = process.env.WITHDRAWAL_TEST_MAIL_URL;
  if (endpoint) {
    const url = new URL(endpoint);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" ||
      new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname !== "127.0.0.1") {
      throw new Error("Test mail requires loopback");
    }
    const reply = await fetch(url, {
      method: "POST", redirect: "error", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, text, key }),
    });
    if (!reply.ok) throw new Error("Test mail failed");
    return;
  }
  const { error } = await new Resend(apiKey).emails.send({
    from: "M.glitter <noreply@mglitter.net>", to, subject, text,
  }, { idempotencyKey: key });
  if (error) throw new Error("Withdrawal mail failed");
}

export async function notifyWithdrawalOperator(jobId: string) {
  for (const delay of [0, 250, 500]) {
    if (delay) await new Promise<void>((resolve) => setTimeout(resolve, delay));
    try {
      await sendWithdrawalMail(
        "mglitter.info@gmail.com",
        "My Shopping List 退会受付通知",
        "退会申請を受け付けました。GitHub Actionsで退会ワーカーを手動実行し、保留中の工程を確認してください。\n" +
          "https://github.com/mika11247/my-shopping-list/actions/workflows/account-withdrawal-worker.yml",
        "withdrawal-operator/" + jobId,
      );
      return;
    } catch {
      // Retry the same logical message without exposing provider response data.
    }
  }
  console.warn("Withdrawal operator notification failed after retries");
}

type WithdrawalImage = {
  id: string;
  bucket: string;
  path: string;
  owned: boolean;
  referenced: boolean;
};

async function digest(blob: Blob) {
  return createHash("sha256").update(Buffer.from(await blob.arrayBuffer())).digest("hex");
}

async function retireImage(
  client: ReturnType<typeof withdrawalClient>, image: WithdrawalImage, jobId: string, lease: string,
) {
  if (!image.owned || !["item-images", "recipe-images"].includes(image.bucket) ||
    !/^[\w./-]+$/.test(image.path) || image.path.includes("//") ||
    image.path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Image ownership or path requires review");
  }
  const bucket = client.storage.from(image.bucket);
  const replacementPath = "retained/" + image.id;
  let replacementUrl = null;
  if (image.referenced) {
    const existing = await bucket.download(replacementPath);
    if (existing.error) {
      const copy = await bucket.copy(image.path, replacementPath);
      if (copy.error) throw new Error("Shared image copy failed");
    }
    const [source, replacement] = await Promise.all([
      bucket.download(image.path), bucket.download(replacementPath),
    ]);
    if (source.error || replacement.error || await digest(source.data) !== await digest(replacement.data)) {
      throw new Error("Shared image copy could not be verified");
    }
    replacementUrl = bucket.getPublicUrl(replacementPath).data.publicUrl;
  }
  const prepared = await client.rpc("retire_account_image", {
    p_job: jobId, p_lease: lease, p_bucket: image.bucket, p_path: image.path,
    p_old_url: bucket.getPublicUrl(image.path).data.publicUrl,
    p_new_url: replacementUrl, p_new_path: replacementUrl ? replacementPath : null,
  });
  if (prepared.error) throw new Error("Image still has unresolved references");
  const removed = await bucket.remove([image.path]);
  if (removed.error) throw new Error("Original image removal failed");
}

export async function processWithdrawal(client: ReturnType<typeof withdrawalClient>, id: string | null, pilot?: string[]) {
  const lease = randomUUID();
  const claimed = pilot
    ? await client.rpc("claim_pilot_withdrawal", { p_users: pilot, p_lease: lease })
    : await client.rpc("claim_account_withdrawal", { p_job: id, p_lease: lease });
  if (claimed.error) throw new Error("Withdrawal claim failed");
  const job = claimed.data as { id: string; stage: string; email: string | null; userId: string | null } | null;
  if (!job) return;
  const advance = async (action: string) => {
    const result = await client.rpc("advance_account_withdrawal", { p_job: job.id, p_lease: lease, p_action: action });
    if (result.error || result.data !== true) throw new Error("Withdrawal checkpoint failed");
  };
  // A thrown error leaves the lease in place so failed steps are retried
  // after the lease expires. Each next claim reads the committed checkpoint.
  if (job.stage === "storage") {
    const images = await client.rpc("account_withdrawal_images", { p_job: job.id, p_lease: lease });
    if (images.error) throw new Error("Withdrawal image lookup failed");
    const image = (images.data as WithdrawalImage[])[0];
    if (image) {
      if (pilot) throw new Error("Pilot withdrawal cannot process owned images");
      await retireImage(client, image, job.id, lease);
      await advance("release");
    } else {
      await advance("storage_done");
    }
  } else if (job.stage === "auth" && job.userId) {
    const deleted = await client.auth.admin.deleteUser(job.userId);
    if (deleted.error && deleted.error.code !== "user_not_found") throw new Error("Auth deletion failed");
    await advance("auth_done");
  } else if (job.stage === "complete" && job.email) {
    await sendWithdrawalMail(job.email, "My Shopping List 退会完了",
      "My Shopping Listの退会処理が完了しました。", "withdrawal-complete/" + job.id);
    await advance("notify_done");
  }
}
