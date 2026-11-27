# GitHub Actions による退会ワーカー運用

本番のスケジューラーは GitHub Actions。適用済みのDBマイグレーションは `20261127000100`、`20261127000200`、`20261127000300` の3本。旧Supabase Cron SQLは `supabase/archive/` に保管する。権限の安全チェックは維持し、本番のマイグレーション対象から外す。

## 停止状態で配備

1. Vercel Firewallの `/api/delete-user` のdenyを確認する。Productionの退会APIとUIは無効のまま配備し、受付を停止する。専用ブランチのPreview抑止を維持する。
2. 32バイトのランダム値を64桁の16進文字列として生成し、同じ値をGitHubのリポジトリActions SecretとVercelのProduction専用Sensitive環境変数 `WITHDRAWAL_WORKER_SECRET` に保存する。設定画面、Git、ログ、シェルのコマンド履歴、チャットに値を残さない。GitHub ActionsにSupabaseのキーを渡さない。Vercelでは環境変数の変更後に配備が必要。
3. GitHubの `ACCOUNT_WITHDRAWAL_WORKER_ENABLED` は未設定または `false` にする。初回配備にはコード上の停止条件も含める。ワークフローに5分間隔と手動実行を登録するが、停止中は両方ともジョブがスキップされ、HTTPを送信しない。ワークフロー自体を無効化すると待機実行も止まる。

## 検証と公開

隔離環境ではワークフローの通信処理、既存POSTワーカー、リース再開、30日整理を検証する。本番では別途承認を得て、新規受付を停止した状態でワーカーの疎通を確認する。現行Firewall denyはワーカーのPOSTも遮断する。疎通確認後、別途承認を得た差分でワークフローの `false &&` を削除し、変数を有効化する。Firewallの段階切替と専用テストアカウントは [本番反映判定](account-withdrawal-release.md) を参照。承認済みの専用テストを完了してから一般受付を判断する。

GitHub Actionsは `main` でのみ実行し、トークン権限は付与しない。1回のPOSTで最大1工程を処理する。HTTP非2xx、接続エラー、タイムアウトを失敗として記録し、秘密情報や応答本文は出さない。次回実行で残存要求を拾い、5分リースとDBの工程記録で再開する。処理待ちがなくても呼び出すことで、完了から30日を超えた記録を既存ワーカーが整理する。

## 停止・再開と60日間の活動停止

- 停止時はGitHub変数を `false` にし、実行中のジョブとDBリースを確認する。必要に応じてワークフロー自体を無効化する。受付停止とFirewallは別操作として維持する。
- 公開リポジトリで60日間活動がないと、GitHubが定期実行を無効化する場合がある。維持管理ではActions画面で有効状態と最終成功時刻を確認する。再開を承認したらワークフローを再有効化し、受付停止とFirewallの状態を照合したうえで、変数を `true` にして `main` の「Run workflow」で1回実行する。失敗したらHTTPステータスとDBの滞留を照合する。

[GitHub定期実行の仕様](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
