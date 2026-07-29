"use client";

import Header from "@/components/Header";

export default function GuidePage() {

  return (
    <main className="min-h-screen bg-orange-50 p-4">
      <div className="mx-auto max-w-xl space-y-4">

      <Header
  title="ガイド ❓"
  subtitle="Guide"
/>
        
          
          <p className="mt-2 text-sm leading-relaxed text-gray-500">
          <p>My Shopping List の基本的な使い方をまとめました。</p>
            よく買うものを登録して、買い物をもっとラクにしましょう。
          </p>
        

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-orange-100">
          <h2 className="mb-4 border-l-4 border-orange-400 pl-3 font-bold text-orange-500">
            基本の流れ
          </h2>

          <div className="space-y-3">
            <GuideItem icon="➕" title="アイテムを追加" text="買いたいものを入力してリストに追加します。" />
            <GuideItem icon="✅" title="買ったらチェック" text="買い物が終わったらチェックして管理できます。" />
            <GuideItem icon="🗑️" title="不要なら削除" text="もういらないアイテムは削除できます。" />
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-orange-100">
          <h2 className="mb-4 border-l-4 border-orange-400 pl-3 font-bold text-orange-500">
            便利な機能
          </h2>

          <div className="grid gap-3">
            <GuideItem icon="🔍" title="検索から追加" text="よく使うアイテムは検索してすぐ追加できます。" />
            <GuideItem icon="💖" title="My items" text="自分用の候補アイテムを編集・管理できます。" />
            <GuideItem icon="🕒" title="履歴" text="削除したアイテムをあとから確認できます。" />
            <GuideItem icon="👤" title="My page" text="メール確認やパスワードリセットができます。" />
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-orange-100">
          <h2 className="mb-4 border-l-4 border-orange-400 pl-3 font-bold text-orange-500">
            レシピノート 📖
          </h2>
          <div className="grid gap-3">
            <GuideItem icon="🖼️" title="画像付きで保存" text="画像、参照URL、補足メモ、お気に入り、カテゴリー、基準人数を登録できます。" />
            <GuideItem icon="🥕" title="材料・調味料" text="共通アイテムとマイアイテムを、食材・調味料として利用できます。" />
            <GuideItem icon="🛒" title="買い物リストへ追加" text="材料を個人または共有の買い物リストへ追加できます。" />
            <GuideItem icon="🔍" title="検索・絞り込み" text="レシピ検索とお気に入り絞り込みに対応しています。" />
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-orange-100">
          <h2 className="mb-4 border-l-4 border-orange-400 pl-3 font-bold text-orange-500">
            献立リスト 🍽️
          </h2>
          <div className="grid gap-3">
            <GuideItem icon="📅" title="7日間の献立" text="開始日から7日間、朝・昼・夜ごとに献立を登録できます。" />
            <GuideItem icon="📖" title="レシピを選択" text="1つの食事枠へ、レシピノートから複数のレシピを登録できます。" />
            <GuideItem icon="✏️" title="自由入力" text="外食、お弁当、残り物、各自、未定などはタイトルだけでも登録できます。" />
            <GuideItem icon="👥" title="共有献立" text="既存の共有買い物リストのメンバーが閲覧できます。Ver1では編集・削除は作成者のみ可能です。" />
          </div>
        </section>

        <section className="rounded-3xl bg-orange-100 p-5 shadow-sm ring-1 ring-orange-200">
          <h2 className="mb-2 font-bold text-orange-700">ワンポイント 🍊</h2>
          <p className="text-sm leading-relaxed text-orange-800">
            よく買うものは My items に登録しておくと、次回から検索でサッと追加できます。
            チェック済みのものは、買い物後に整理するとリストが見やすくなります。
          </p>
        </section>
      </div>



    </main>
  );
}

function GuideItem({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-3 rounded-2xl bg-orange-50 p-4 ring-1 ring-orange-100">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-xl shadow-sm">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-bold text-gray-700">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-gray-500">{text}</p>
      </div>
    </div>
  );
}
