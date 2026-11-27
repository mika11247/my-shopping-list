import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { processWithdrawal, sendWithdrawalMail, withdrawalClient } from "@/lib/server/account-withdrawal";
import { pilotAccounts, withdrawalVerificationMethod } from "@/lib/server/withdrawal-pilot";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const response = (status: number, body: object) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});

function proof(user: string, session: string, code: string) {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .update([user, session, code].join(":")).digest("hex");
}

function supportsWorker(request: Request) {
  const configured = Buffer.from(process.env.WITHDRAWAL_WORKER_SECRET ?? "");
  const supplied = Buffer.from(request.headers.get("x-withdrawal-worker") ?? "");
  return configured.length >= 32 && supplied.length === configured.length && timingSafeEqual(configured, supplied);
}

export async function POST(request: Request) {
  const configuredPilot = process.env.WITHDRAWAL_PILOT_UUIDS;
  const pilot = pilotAccounts(configuredPilot);
  const scoped = configuredPilot !== undefined;
  const general = !scoped && process.env.ACCOUNT_WITHDRAWAL_GENERAL_RELEASE_ENABLED === "true";
  if (process.env.ACCOUNT_WITHDRAWAL_ENABLED !== "true" ||
    (!general && (!scoped || pilot.length === 0 || process.env.ACCOUNT_WITHDRAWAL_INTAKE_DISABLED !== "true"))) {
    return response(503, { error: "退会機能は安全性確認のため停止中です。お問い合わせください。" });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return response(400, { error: "入力を確認してください。" });
  try {
    if (body.action === "worker") {
      if (scoped && process.env.WITHDRAWAL_PILOT_WORKER_ENABLED !== "true") {
        return response(503, { error: "退会ワーカーは停止中です。" });
      }
      if (!supportsWorker(request)) return response(401, { error: "認証が必要です。" });
      await processWithdrawal(withdrawalClient(true), null, scoped ? pilot : undefined);
      return response(200, { success: true });
    }
    if (body.action === "status" && typeof body.id === "string" && uuid.test(body.id)) {
      const admin = withdrawalClient(true);
      const status = scoped
        ? await admin.rpc("pilot_withdrawal_status", { p_job: body.id, p_users: pilot })
        : await admin.rpc("account_withdrawal_status", { p_job: body.id });
      if (status.error) throw new Error("Status lookup failed");
      if (!status.data) return response(404, { error: "退会の受付情報が見つかりません。" });
      if (!scoped) await processWithdrawal(admin, body.id).catch(() => undefined);
      return response(200, { stage: status.data });
    }
    if (scoped ? process.env.WITHDRAWAL_PILOT_INTAKE_ENABLED !== "true"
      : process.env.ACCOUNT_WITHDRAWAL_INTAKE_DISABLED === "true") {
      return response(503, { error: "現在、新しい退会手続きの受付を停止しています。" });
    }

    const token = /^Bearer (\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
    if (!token) return response(401, { error: "ログインしてください。" });
    const auth = withdrawalClient();
    const authenticated = await auth.auth.getUser(token);
    const user = authenticated.data.user;
    if (authenticated.error || !user || !user.email || !user.email_confirmed_at) {
      return response(401, { error: "確認済みのアカウントでログインしてください。" });
    }
    if (scoped && !pilot.includes(user.id.toLowerCase())) return response(403, { error: "退会試験の対象外です。" });
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    const session = claims.session_id;
    if (typeof session !== "string" || !uuid.test(session)) {
      return response(401, { error: "ログインし直してください。" });
    }
    const method = withdrawalVerificationMethod(user.identities ?? [], claims.amr);
    const usePassword = method === "password";
    const admin = withdrawalClient(true);
    const activeSession = await admin.rpc("withdrawal_session_is_active", { p_user: user.id, p_session: session });
    if (activeSession.error) throw new Error("Session lookup failed");
    if (activeSession.data !== true) return response(401, { error: "ログインし直してください。" });
    if (body.action === "preview") {
      const preview = await admin.rpc("account_withdrawal_preview", { p_user: user.id });
      if (preview.error) throw new Error("Preview failed");
      return response(200, { groups: preview.data, method });
    }
    if (body.action === "code" && !usePassword) {
      const code = String(randomInt(0, 1000000)).padStart(6, "0");
      const verification = proof(user.id, session, code);
      const issued = await admin.rpc("issue_withdrawal_email_check", {
        p_user: user.id, p_session: session, p_proof: verification,
      });
      if (issued.error) throw new Error("Code issuance failed");
      if (!issued.data) return response(429, { error: "時間をおいて再度お試しください。" });
      await sendWithdrawalMail(user.email, "My Shopping List 退会確認コード",
        `退会確認コードは ${code} です。有効期限は10分です。`, "withdrawal-verify/" + verification);
      return response(200, { sent: true });
    }
    if (body.action !== "begin" || !Array.isArray(body.groups)) {
      return response(400, { error: "退会の確認内容を読み直してください。" });
    }
    let confirmed = false;
    if (usePassword && typeof body.password === "string" && body.password.length <= 1024) {
      const check = await auth.auth.signInWithPassword({ email: user.email, password: body.password });
      if (!check.error && check.data.user?.id === user.id) {
        const cleanup = await auth.auth.signOut({ scope: "local" });
        confirmed = !cleanup.error;
      }
    } else if (!usePassword && typeof body.code === "string" && /^\d{6}$/.test(body.code)) {
      const check = await admin.rpc("consume_withdrawal_email_check", {
        p_user: user.id, p_session: session, p_proof: proof(user.id, session, body.code),
      });
      confirmed = !check.error && check.data === true;
    }
    if (!confirmed) return response(403, { error: "パスワードまたは確認コードを確認してください。" });
    if (scoped && process.env.WITHDRAWAL_PILOT_BEGIN_ENABLED !== "true") {
      return response(503, { error: "現在、退会処理の確定を停止しています。" });
    }
    const result = scoped
      ? await admin.rpc("begin_pilot_withdrawal", { p_user: user.id, p_users: pilot, p_confirmed: body.groups })
      : await admin.rpc("begin_account_withdrawal", { p_user: user.id, p_confirmed: body.groups });
    if (result.error?.code === "23514") {
      return response(409, { error: "共有グループの状況が変わりました。譲渡状況と削除対象を確認してください。" });
    }
    if (result.error || typeof result.data !== "string") throw new Error("Withdrawal start failed");
    return response(202, { id: result.data, stage: "pending" });
  } catch {
    return response(503, { error: "処理を続けられませんでした。時間をおいて再度お試しください。" });
  }
}
