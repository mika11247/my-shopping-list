'use client'

import { useState } from 'react'
import Header from '@/components/Header'

export default function ContactPage() {
  const [category, setCategory] = useState('不具合報告')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSent(false)

    if (!email.trim() || !message.trim()) {
      setError('メールアドレスとお問い合わせ内容を入力してください。')
      return
    }

    try {
      setLoading(true)

      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, email, message }),
      })

      const data: { error?: string } = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '送信に失敗しました。')
      }

      setSent(true)
      setCategory('不具合報告')
      setEmail('')
      setMessage('')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '送信に失敗しました。'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-sky-50 p-4">
      <div className="mx-auto max-w-xl space-y-4">
        <Header subtitle="Contact" title="お問い合わせ 📩" />

        <section className="rounded-3xl border border-sky-100 bg-white p-5 shadow-sm">
          <p className="text-sm leading-6 text-gray-600">
            不具合報告・ご要望・使い方についてのお問い合わせはこちらから送信できます。
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="text-sm font-bold text-gray-700">
                お問い合わせ種別
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-sky-100 bg-white px-4 py-3 text-sm text-gray-700 outline-none focus:border-sky-300"
              >
                <option>不具合報告</option>
                <option>機能リクエスト</option>
                <option>使い方について</option>
                <option>アカウント関連</option>
                <option>その他</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-bold text-gray-700">
                メールアドレス
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="返信先のメールアドレス"
                className="mt-2 w-full rounded-2xl border border-sky-100 bg-white px-4 py-3 text-sm text-gray-700 outline-none focus:border-sky-300"
              />
            </div>

            <div>
              <label className="text-sm font-bold text-gray-700">
                お問い合わせ内容
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={7}
                placeholder="できるだけ詳しくご記入ください。"
                className="mt-2 w-full rounded-2xl border border-sky-100 bg-white px-4 py-3 text-sm leading-7 text-gray-700 outline-none focus:border-sky-300"
              />
            </div>

            {error && (
              <p className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-500">
                {error}
              </p>
            )}

            {sent && (
              <p className="rounded-2xl bg-green-50 p-3 text-sm font-bold text-green-600">
                送信しました。お問い合わせありがとうございます。
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-600 disabled:opacity-60"
            >
              {loading ? '送信中...' : '送信する'}
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}