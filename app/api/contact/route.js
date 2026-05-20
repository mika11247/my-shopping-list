import { NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req) {
  try {
    const { category, email, message } = await req.json()

    if (!email || !message) {
      return NextResponse.json(
        { error: 'メールアドレスとお問い合わせ内容を入力してください。' },
        { status: 400 }
      )
    }

    await resend.emails.send({
      from: 'M.glitter <noreply@mglitter.net>',
      to: 'mglitter.info@gmail.com',
      subject: `【My Shopping List】お問い合わせ：${category || '未選択'}`,
      replyTo: email,
      text: `
【My Shopping List】お問い合わせ

■ 種別
${category || '未選択'}

■ 返信先メールアドレス
${email}

■ お問い合わせ内容
${message}
      `,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('contact api error:', error)

    return NextResponse.json(
      { error: '送信に失敗しました。時間をおいて再度お試しください。' },
      { status: 500 }
    )
  }
}