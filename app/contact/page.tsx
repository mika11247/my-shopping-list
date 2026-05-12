// app/contact/page.tsx
import Header from "@/components/Header";

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-sky-50 p-4">
      <div className="mx-auto max-w-xl space-y-4">
        <Header
          subtitle="Contact"
          title="お問い合わせ 📩"
        />

        <section className="rounded-3xl border border-sky-100 bg-white p-5 shadow-sm">
          <p className="text-sm leading-6 text-gray-600">
            不具合報告・ご要望・使い方についてのお問い合わせは、
            M.glitterのお問い合わせフォームよりお願いいたします。
          </p>

          <a
            href="https://m-glitter.com/contact/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 block rounded-2xl bg-sky-500 px-4 py-3 text-center text-sm font-semibold text-white shadow-sm"
          >
            お問い合わせフォームへ
          </a>
        </section>
      </div>
    </main>
  );
}