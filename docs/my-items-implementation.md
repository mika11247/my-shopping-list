# My Items修正（未コミット・本番未適用）

## 基準と変更範囲
- feature/my-items-limit-form / HEAD 589ff9edf3b1a4f4f5227c0045ef45429496ac5f。
- 実装開始時にGitHub main・origin/mainも同じSHAであることを確認。
- app/page.tsx、app/master/page.tsxを共通フォームと登録処理へ移行。
- components/my-items/MyItemForm.tsx、lib/myItems.tsを追加。
- 退会API、既存authorization.sql、Storageポリシー、共有RPC、レシピ/献立ソースは変更しない。

## 登録操作
- トップの専用My Itemsボタンのみで詳細フォームを開く。入力中の名前とカテゴリを引き継ぐ。
- 名前必須、よみ任意（未指定時は既存どおり名前のカタカナをひらがなへ変換）、カテゴリはその他、画像は🛒が初期値。
- 画像URL/絵文字入力とspecial/proの画像アップロードを共通化。新しいUUIDパスにJPEGで保存し、既存オブジェクトを上書きしない。
- 通常追加/一時追加/候補選択は維持。Enterは詳細フォームを開かず従来のクイック追加を維持し、My Items自動保存も共通チェックを通す。
- 共通保存処理はサーバー取得の本人ID・プロフィール・正確な件数を確認。取得失敗時は保存しない。
- 登録はINSERTのみ。同名データをupsertで意図せず上書きしない。
- トップ詳細登録はMy Items→買い物リストの順。後者が失敗した場合、登録済みMy Itemsを保持して買い物リスト操作のみ再試行する。
- Enterでは従来どおり買い物リストを先に保存する。My Items保存失敗時は部分成功を案内し、入力を残す。
- 二重送信を抑止し、上限エラー時も入力を保持。上限の再確認ボタンあり。

## DBマイグレーション
supabase/migrations/20261029053800_my_items_quota.sql（固定版Supabase CLI migration newで作成、本番未適用）

- October authorizationのapp_private/live_userが前提。旧authorization.sqlは再実行しない。
- 非公開app_private.my_item_usageに現在件数を初期集計。既存アイテムは削除・再作成しない。
- 全件数をユーザー単位のカウンター行で原子的に更新。AFTER INSERT/DELETEで実際に増減した行のみ数え、upsertの更新やDO NOTHINGは件数を消費しない。
- 複数行失敗・トランザクション失敗はアイテムとカウンターを一緒にロールバック。
- REPEATABLE READ/SERIALIZABLEでもカウンターの書込み競合が生じ、上限超過を許容せず片方が失敗する。
- 所有者変更は拒否。既存アイテムの編集・削除は上限到達時も可能。
- Auth外部キーは設けず、Auth不在の既存行と件数を保持。同じUUIDのAuth復旧で既存枠を引き継ぐ。元のMy Itemsが0件になったときだけ空カウンターを整理。
- 非公開テーブルはRLS有効・一般ユーザーの権限なし。SECURITY DEFINERは非公開トリガー関数の内部カウンター参照/更新に限定し、search_path固定、PUBLIC/anon/authenticatedから直接実行不可。
- free/未知値30、special50、pro200、admin9999。planLimits.tsとの一致をテスト。
- 初期化中は対象テーブルの書込みをロック。lock_timeout 5秒、適用失敗時はトランザクションごと中止。
- 既に上限を超えるユーザーはデータを残し、新規追加のみ拒否。

## 本番適用前の確認
今回は本番DB・設定を読み書きしていない。
1. 適用対象SHA、既存10月認可適用状態を確認する。今回はユーザー方針でバックアップを取得しない。残存リスクと局所復旧手順はmy-items-release-safety.mdを参照。
2. 新規関数/テーブル/トリガー名の衝突とAuth不在データを集計だけで確認する。Auth不在の既存1件は保持して移行可能。想定外の差分は自動削除せず停止。
3. 検証済みSQLだけを適用する。旧authorization.sqlは再実行しない。
4. 件数カウンターと実件数、各プランの境界・同時登録を専用テストユーザーで確認してから画面を反映する。
5. 本番への適用・コミット・push・デプロイは別途指示後。今の本番にはDBガードはまだ存在しない。

## ローカル検証
- 単体10ケース：入力補完、各プラン上限、本人確認失敗/件数取得失敗の拒否、DBエラー案内、INSERT payload。
- PostgreSQL 17実DB28ケース：初期データ保持、各プラン、bulk rollback、upsert/DO NOTHING、3分離レベルで2接続競合、初回並列登録、削除/rollback、レシピFK、他人/退会済みユーザー拒否、カウンター権限、Auth復旧/再集計、移行失敗/撤去/再適用、Storage/RLS維持。
- ブラウザ7シナリオ：専用ボタン/詳細入力、名前だけ/二重送信、両画面の上限、通常追加/Enter、DB拒否時の入力保持、special画像アップロードと失敗時に画像を削除しないこと、部分成功の再試行。
- 既存退会503・招待認可13テストを新worktreeソースに対して再実行。
- npm run build成功（コンパイル/TypeScript/23ページ生成）。接続先はloopback、公開キーとResendキーは無効なダミー値。
- 新共通コードのESLintはエラー0、img推奨警告1。変更した既存ページは基準コミットにもあるLintエラー24件が残るが増加なし。
- DBテストは架空データのみの専用clusterを一時フォルダに作成し、終了時に停止。既存DBは使用しない。
- ブラウザは認証/REST/Storageをモック。本物のSupabase Auth/Storage/PostgRESTを通した結合E2Eは未実施。
- PC/390pxの画面をキャプチャして表示を確認。新規アップロードの中断/登録失敗で未参照画像が残る場合がある。既存の参照保護を迂回する自動削除は追加していない。

## 再実行
ルートのnpm ci済み依存に加えて、npm ci --prefix tests --ignore-scriptsで固定版Playwrightを導入。
- node --test tests/my-items.unit.test.cjs tests/my-items.database.test.cjs
- node --test tests/my-items.browser.test.cjs

DBテストはWindowsのPostgreSQL17を使用。必要ならMY_ITEMS_PG_BINで別のローカルバイナリディレクトリを指定。
ブラウザテストはインストール済みChromeを使用し、localhost以外の実API接続を禁止する。
ブラウザテスト・next dev・next buildは同じworktreeで重複実行しない。
