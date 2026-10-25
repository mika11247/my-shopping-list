import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { invitationEmailHandler } from "@/lib/server/invitation-email";

function client(token?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Auth unavailable");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
}

export const POST = invitationEmailHandler({
  async authenticate(token) {
    const { data, error } = await client().auth.getUser(token);
    return error ? null : data.user;
  },
  async loadInvitation(token, id) {
    const { data, error } = await client(token).from("invitations")
      .select("id,email,group_id,invited_by,status,expires_at").eq("id", id).maybeSingle();
    return error ? null : data;
  },
  async ownsGroup(token, groupId, userId) {
    const { data, error } = await client(token).from("groups").select("id")
      .eq("id", groupId).eq("owner_user_id", userId).maybeSingle();
    return !error && Boolean(data);
  },
  async claimDelivery(token, id) {
    const { data, error } = await client(token).rpc("claim_shopping_invitation_email", { p_invite_id: id });
    return !error && data === true;
  },
  async send(invitation) {
    if (!process.env.RESEND_API_KEY) throw new Error("Mail unavailable");
    const link = new URL("/login", "https://my-shopping-list-vxll.vercel.app");
    link.searchParams.set("invite", invitation.id);
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: "M.glitter <noreply@mglitter.net>", to: invitation.email,
      subject: "共有リストに招待されました",
      text: `My Shopping Listの共有リストに招待されました。対象メールのアカウントでログインし、参加を確認してください。\n${link.href}`,
    });
    if (error) throw new Error("Mail failed");
  },
});
