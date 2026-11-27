# 退会機能の検証と本番反映

## 隔離検証

次の操作は、架空データ専用のDockerプロジェクトだけを対象にする。Supabaseのリンク・本番の環境変数・Previewは使わない。AuthとStorageが起動したことを確認してから、新規の隔離DBにfixtureを一度適用する。

```powershell
docker compose -p shopping-withdrawal-isolated -f tests/account-withdrawal.compose.yml up -d --pull never
node tests/account-withdrawal-fixture.cjs | docker exec -i shopping-withdrawal-isolated-db-1 psql -U postgres -v ON_ERROR_STOP=1
Get-Content -Raw tests/account-withdrawal-recovery.sql | docker exec -i shopping-withdrawal-isolated-db-1 psql -U postgres -v ON_ERROR_STOP=1
node --test tests/account-withdrawal.storage.test.cjs
node --test tests/account-withdrawal.browser.test.cjs
node --test tests/my-items.unit.test.cjs
node --test tests/my-items.database.test.cjs
```

ブラウザー試験はChromeと `@playwright/test` を使用する。必要な場合は `WITHDRAWAL_PLAYWRIGHT_PATH` でローカルにあるパッケージを指定できる。専用ブラウザーからのネットワークアクセスはNext.jsと隔離APIのループバックに限定し、完了メールを専用のローカル受信箱で捕捉する。Google利用者は、退会に対するGoogle認証時刻を確認できる経路を導入するまで、確認済みメールのコードを使う。

## 本番反映の順序

### 公開前に確定する項目

- **メール**。既存の招待メール経路と同じResend SDK、`RESEND_API_KEY`、`M.glitter <noreply@mglitter.net>` を使用する。2026-11-27時点で、Vercel Productionにキーの設定があり、Resendで `mglitter.net` は検証済み・送信有効。キーの送信スコープと実配信は、承認後に管理画面と専用宛先で確認する。
- **定期実行**。現行ワーカーはPOSTと `x-withdrawal-worker` を要求する。Vercel Cronを採用する場合は、Production専用のGETルートで `Authorization: Bearer <CRON_SECRET>` を検証して同じワーカーを呼び出す追加実装と隔離検証が必要。Hobbyは日次、Pro／Enterpriseは最短1分。接続したチーム情報から契約区分を確認できなかった。1回1工程の現行ワーカーには1分間隔を想定し、日次だけの運用は公開条件を満たさない。契約アップグレードや有料ランナーは費用確認と別途承認を要する。
- **Googleアカウント**。本番とは別のSupabaseとOAuthクライアントに、専用Googleテストアカウントと許可済みのコールバックを限定する。ログイン後、同じユーザーの確認済みメールにコードが届くこと、別セッション・誤入力・期限切れ・再利用が拒否されることを確認する。最後に、その隔離アカウントだけで退会完了と通知を確認する。現在のPreviewは本番Supabaseに接続する。
- **Storage・復元**。本番の `postgres` はStorage表の所有者権限を持たず、ポリシー操作の委譲設定に対象が含まれる。制限的ポリシーの作成が委譲経由でも成功することを反映前の確認条件にする。DB保全とは別に、画像本体と元パス・所有者・ハッシュを対応付けて保全する。元所有者まで維持した復元を隔離環境で確認する。
- **Preview抑止**。`vercel.json` で `feature/account-withdrawal-isolated` の自動デプロイを停止する。公開用に別ブランチを作る場合は、push前にそのブランチも対象にする。手動デプロイや本番ブランチへの反映は別管理とする。

1. 本番反映の明示承認後、対象SHA、配備先、Auth外部キー、共有行の `user_id` 制約、既存RLS、バケットとStorageポリシー作成権限を読み取り確認する。DBと画像の復旧手順を確認する。既存の `authorization.sql` の再適用は不要。
2. Firewallの遮断と2つの有効化設定を止めた状態で、次のマイグレーションを番号順に確認・適用する。

   - `20261127000100_shopping_group_transfer.sql` は譲渡依頼・承諾とプラン判定を追加する。
   - `20261127000200_account_withdrawal.sql` は共有帰属情報の整理、本人確認コード、ジョブ・画像処理・通知の記録を追加する。
   - `20261127000300_account_withdrawal_write_fence.sql` は退会受付後の直接書き込みを遮断する制限的なRLSを追加する。StorageのDDL権限がなければ公開を保留する。

3. `ACCOUNT_WITHDRAWAL_ENABLED` はAPI用、`NEXT_PUBLIC_ACCOUNT_WITHDRAWAL_ENABLED` は画面用。明示的に `true` を設定した環境だけが有効となる。既存のSupabase公開キー・サービスロールキーと、メール送信に既存の `RESEND_API_KEY` を利用する。 `WITHDRAWAL_TEST_MAIL_URL` は本番に設定しない。
4. 画面を閉じた後の処理再開と30日経過後の記録削除のため、既存の承認済みスケジューラーから `POST /api/delete-user` に `{"action":"worker"}` を定期送信する。ヘッダー `x-withdrawal-worker` の値は `WITHDRAWAL_WORKER_SECRET` と一致させる。32文字以上の高エントロピーな値を秘密設定に保管する。1回で最大1工程を実行する。タイムアウトや失敗はリース期限後に再開する。定期実行の監視と、Firewallがこの経路を許可する段階での疎通確認を公開条件とする。
5. テスト専用アカウントで、受付後の書き戻し拒否、保持したデータ・画像の利用、Auth削除、通知、ブラウザーを閉じた後の再開を確認してから公開範囲を広げる。既存データの画像参照が曖昧な処理は保留し、参照と所有権を確認する。
6. 新規受付だけを止めるときは `ACCOUNT_WITHDRAWAL_INTAKE_DISABLED=true` を設定する。全通信を止める必要がある場合はFirewallを再遮断する。受付済み処理は工程を確認し、承認済みの経路で再開する。配備やDDLの切り戻しで削除済みデータの復元はできない。
