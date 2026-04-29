const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let body: { email?: string; inviteId?: number | string } = {};

try {
  body = await req.json();
} catch {
  return new Response(JSON.stringify({ error: "Invalid JSON or empty body" }), {
    status: 400,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

const { email, inviteId } = body;

if (!email || !inviteId) {
  return new Response(JSON.stringify({ error: "email or inviteId is missing" }), {
    status: 400,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY is missing" }),
        { status: 500, headers: corsHeaders }
      );
    }

    const origin =
      req.headers.get("origin") ?? "https://my-shopping-list-vxll.vercel.app";

    const inviteLink = `${origin}/login?invite=${inviteId}`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "onboarding@resend.dev",
        to: email,
        subject: "共有リストに招待されました",
        html: `
          <div style="margin:0; padding:24px; background:#f8fafc; font-family:Arial, sans-serif; color:#334155;">
            <div style="max-width:520px; margin:0 auto; background:#ffffff; border-radius:20px; padding:28px; border:1px solid #e5e7eb;">
              <p style="margin:0 0 8px; font-size:13px; color:#94a3b8;">
                My Shopping List
              </p>
      
              <h1 style="margin:0 0 16px; font-size:24px; color:#0f172a;">
                共有リストに招待されました ✨
              </h1>
      
              <p style="font-size:15px; line-height:1.8; margin:0 0 20px;">
                家族やパートナーと一緒に使える<br />
                お買い物リストへの招待が届いています。
              </p>
      
              <div style="text-align:center; margin:28px 0;">
                <a href="${inviteLink}"
                  style="display:inline-block; background:#3b82f6; color:#ffffff; text-decoration:none; padding:14px 24px; border-radius:999px; font-weight:bold; font-size:15px;">
                  共有リストに参加する
                </a>
              </div>
      
              <p style="font-size:13px; line-height:1.7; color:#64748b; margin:0;">
                ボタンが開けない場合は、下のURLをコピーしてブラウザで開いてください。
              </p>
      
              <p style="font-size:12px; line-height:1.6; word-break:break-all; color:#2563eb; margin-top:8px;">
                ${inviteLink}
              </p>
      
              <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;" />
      
              <p style="font-size:12px; color:#94a3b8; margin:0;">
                このメールは My Shopping List の共有リスト招待機能から送信されています。
              </p>
            </div>
          </div>
        `,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }
});