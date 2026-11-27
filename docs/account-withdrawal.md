# 退会機能の検証と本番反映

## 隔離検証

次の操作は、架空データ専用のDockerプロジェクトだけを対象にする。Supabaseのリンク・本番の環境変数・Previewは使わない。AuthとStorageが起動したことを確認してから、新規の隔離DBにfixtureを一度適用する。

```powershell
docker compose -p shopping-withdrawal-cron -f tests/account-withdrawal.compose.yml up -d --pull never
node tests/account-withdrawal-fixture.cjs | docker exec -i shopping-withdrawal-cron-db-1 psql -U postgres -v ON_ERROR_STOP=1
Get-Content -Raw tests/account-withdrawal-recovery.sql | docker exec -i shopping-withdrawal-cron-db-1 psql -U postgres -v ON_ERROR_STOP=1
Get-Content -Raw tests/account-withdrawal-storage-delegation.sql | docker exec -i shopping-withdrawal-cron-db-1 psql -U postgres -v ON_ERROR_STOP=1
node --test tests/account-withdrawal-cron.test.cjs
node --test tests/account-withdrawal.storage.test.cjs
node --test tests/account-withdrawal.browser.test.cjs
node --test tests/my-items.unit.test.cjs
node --test tests/my-items.database.test.cjs
```

ブラウザー試験はChromeと `@playwright/test` を使用する。必要な場合は `WITHDRAWAL_PLAYWRIGHT_PATH` でローカルにあるパッケージを指定できる。専用ブラウザーからのネットワークアクセスはNext.jsと隔離APIのループバックに限定し、完了メールを専用のローカル受信箱で捕捉する。Google利用者は、退会に対するGoogle認証時刻を確認できる経路を導入するまで、確認済みメールのコードを使う。

## 本番反映の順序

### 公開前に確定する項目

- **メール**。既存の招待メール経路と同じResend SDK、`RESEND_API_KEY`、`M.glitter <noreply@mglitter.net>` を使用する。2026-11-27時点で、Vercel Productionにキーの設定があり、Resendで `mglitter.net` は検証済み・送信有効。キーの送信スコープと実配信は、承認後に管理画面と専用宛先で確認する。
- **定期実行**。Supabase Cron・pg_net・Vaultを使う。実行可能な退会・通知処理がある場合だけ、1分ごとに既存POSTワーカーを呼ぶ。
- **Googleアカウント**。本番とは別のSupabaseとOAuthクライアントに、専用Googleテストアカウントと許可済みのコールバックを限定する。ログイン後、同じユーザーの確認済みメールにコードが届くこと、別セッション・誤入力・期限切れ・再利用が拒否されることを確認する。最後に、その隔離アカウントだけで退会完了と通知を確認する。現在のPreviewは本番Supabaseに接続する。
- **Storage・復元**。本番の `postgres` はStorage表の所有者権限を持たず、ポリシー操作の委譲設定に対象が含まれる。隔離環境では同形式の委譲設定で、非所有者による同じ3種の制限的ポリシーの作成を確認した。DB保全とは別に、画像本体と元パス・所有者・ハッシュを対応付ける。隔離試験では、ハード削除した架空のパスワード利用者を同じAuth UUIDで再作成し、認証付きアップロードで元パス・内容・`owner_id` を復元した。本番の既存Auth属性・Google ID連携・関連データの完全復元は別途確認する。同一UUIDを再作成する復旧では、古いJWTでアクセスが戻らないよう失効・期限切れや別のアクセス制限を確認してから利用を再開する。
- **Preview抑止**。`vercel.json` で `feature/account-withdrawal-isolated` の自動デプロイを停止する。公開用に別ブランチを作る場合は、push前にそのブランチも対象にする。手動デプロイや本番ブランチへの反映は別管理とする。

1. 本番反映の明示承認後、対象SHA、配備先、Auth外部キー、共有行の `user_id` 制約、既存RLS、バケットとStorageポリシー作成権限を読み取り確認する。DBと画像の復旧手順を確認する。既存の `authorization.sql` の再適用は不要。
2. Firewallの遮断と2つの有効化設定を止めた状態で、次のマイグレーションを番号順に確認・適用する。

   - `20261127000100_shopping_group_transfer.sql` は譲渡依頼・承諾とプラン判定を追加する。
   - `20261127000200_account_withdrawal.sql` は共有帰属情報の整理、本人確認コード、ジョブ・画像処理・通知の記録を追加する。
   - `20261127000300_account_withdrawal_write_fence.sql` は退会受付後の直接書き込みを遮断する制限的なRLSを追加する。StorageのDDL権限がなければ公開を保留する。
   - `20261127000400_account_withdrawal_cron.sql` は拡張、Vault／HTTPキューのアプリロールからのアクセス制限、DB内整理、条件付き送信を追加する。適用前に既存のVault／pg_net利用とACLを確認する。このマイグレーションの適用時点ではジョブを登録しない。

3. `ACCOUNT_WITHDRAWAL_ENABLED` はAPI用、`NEXT_PUBLIC_ACCOUNT_WITHDRAWAL_ENABLED` は画面用。明示的に `true` を設定した環境だけが有効となる。既存のSupabase公開キー・サービスロールキーと、メール送信に既存の `RESEND_API_KEY` を利用する。 `WITHDRAWAL_TEST_MAIL_URL` は本番に設定しない。
4. 画面を閉じた後の再開のため、下記のジョブを承認後に登録する。退会受付は停止したまま、ワーカーへの到達を許可した段階で専用アカウントの疎通を確認する。現在のFirewallのパス遮断はワーカーにも適用される。
5. テスト専用アカウントで、受付後の書き戻し拒否、保持したデータ・画像の利用、Auth削除、通知、ブラウザーを閉じた後の再開を確認してから公開範囲を広げる。既存データの画像参照が曖昧な処理は保留し、参照と所有権を確認する。
6. 新規受付だけを止めるときは `ACCOUNT_WITHDRAWAL_INTAKE_DISABLED=true` を設定する。全通信を止める必要がある場合はFirewallを再遮断する。受付済み処理は工程を確認し、承認済みの経路で再開する。配備やDDLの切り戻しで削除済みデータの復元はできない。

## ジョブの登録・停止・再開

本番設定は別途承認後に行う。管理者が32バイト以上のランダム値を生成し、Vercel Productionの `WITHDRAWAL_WORKER_SECRET` と、Supabase DashboardのVaultにある `account_withdrawal_worker_secret` に同じ値を保存する。ジョブのSQLとURLには値を記載しない。平文のヘッダーが送信待ちキューに載るため、一般ロールのVault・キュー・HTTP送信関数へのアクセス拒否を確認し、ヘッダー付きの行をログ・サポート資料へ出力しない。

DBの運用管理ロールで次のジョブを登録する。URLは承認済みの正規Production HTTPS URLに置き換える。専用ブランチのPreview URLやリダイレクト先を使用しない。隔離用のHTTP許可設定 `app.withdrawal_cron_allow_isolated_http` は本番に設定しない。

```sql
SELECT cron.schedule('account-withdrawal-dispatch', '* * * * *',
  $$SELECT app_private.dispatch_account_withdrawal('https://PRODUCTION_HOST/api/delete-user')$$);
SELECT cron.schedule('account-withdrawal-history-cleanup', '17 3 * * *',
  $$SELECT app_private.prune_account_withdrawal_cron_history()$$);
```

1分ジョブは完了から30日を過ぎた処理記録をDB内で整理し、実行可能な要求があるときだけPOSTをキューに入れる。短いDBトランザクションの排他と未送信の重複確認を行い、ワーカーの既存リースを実際の処理の排他に使う。HTTP失敗やキュー消失時は、保存済みの要求を後続ジョブで拾い直す。既存ワーカーの1回1工程は維持する。

日次ジョブは同じ運用ロールが所有するこの2ジョブの終了済み履歴を7日で整理する。Cronの実行成功はHTTPの成功を意味しない。管理者は新しい `net._http_response` のステータスと退会工程の滞留を照合し、失敗回数とDB使用量を監視する。履歴整理の対象にするため、通常の停止はジョブ削除を避け、`cron.alter_job(jobid, active := false)` を使用する。停止済みジョブの古い履歴を廃棄する場合は、削除前に対象ジョブIDを特定する。

ワーカーを止める場合は受付停止を確認してディスパッチジョブを無効化する。すでにキューに入ったHTTPや実行中の処理は残るため、停止が急を要する場合は既存のFirewall遮断も使用する。再開時は承認済みURL、認証設定、残存リース、キューを確認し、ジョブを有効化する。完了記録の30日整理は1分ジョブの再開時にも行われる。
