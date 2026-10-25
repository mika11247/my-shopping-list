type Invitation = { id: string; email: string; group_id: string; invited_by: string | null; status: string; expires_at: string };
type Services = {
  authenticate: (token: string) => Promise<{ id: string } | null>;
  loadInvitation: (token: string, id: string) => Promise<Invitation | null>;
  ownsGroup: (token: string, groupId: string, userId: string) => Promise<boolean>;
  claimDelivery: (token: string, id: string) => Promise<boolean>;
  send: (invitation: Invitation) => Promise<void>;
};

export function invitationEmailHandler(services: Services) {
  return async (request: Request) => {
    const reply = (status: number) => Response.json({ success: status === 200 }, { status, headers: { "Cache-Control": "no-store" } });
    const token = /^Bearer (\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
    if (!token) return reply(401);
    try {
      const user = await services.authenticate(token);
      if (!user) return reply(401);
      const body: unknown = await request.json();
      if (!body || typeof body !== "object" || !("inviteId" in body) || typeof body.inviteId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.inviteId)) return reply(400);
      const invitation = await services.loadInvitation(token, body.inviteId);
      if (!invitation || invitation.status !== "pending" || !Number.isFinite(Date.parse(invitation.expires_at)) || Date.parse(invitation.expires_at) <= Date.now() || invitation.invited_by !== user.id) return reply(403);
      if (!await services.ownsGroup(token, invitation.group_id, user.id)) return reply(403);
      if (!await services.claimDelivery(token, invitation.id)) return reply(429);
      // Recipient and link target never come from request body or Origin.
      await services.send(invitation);
      return reply(200);
    } catch { return reply(500); }
  };
}
