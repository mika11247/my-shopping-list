# 退会処理の手動運用

一般公開の承認後に使用する。受付通知は、既存のお問い合わせ用管理者メールボックスに、既存のResend送信元から届く。通知には申請者情報を載せない。受付を確定してから送信し、失敗しても退会ジョブは保持される。送信の再試行には同じジョブの冪等キーを使う。最終失敗時は個人情報を含まない警告をVercelに記録する。

## 通知を受けたら

1. 翌営業日までを目安に、GitHubの `Account withdrawal worker` を `main` で手動実行する。送信先はProductionの正規ドメインで、既存の専用シークレットを使用する。
2. 1回の実行は最大1工程。成功はHTTPの成功を示すので、DBの未完了件数を確認し、必要な回数だけ再実行する。`complete` でも通知メール待ちの行は未完了として数える。
3. 3営業日以内の完了を運用目安とする。通知に気づかない場合や送信失敗に備え、担当者のカレンダーで週1回、同じ集計を確認する。

```sql
select count(*) as pending_jobs, min(created_at) as oldest_request
from app_private.account_withdrawals
where stage <> 'complete' or email is not null;
```

## 失敗からの再開

ActionsのHTTPステータスとVercelの警告を確認する。稼働中のリースがある場合は期限まで待ち、原因を解消して同じワークフローを手動実行する。DB・Storage・Auth・完了メールの処理は保存済み工程から再開する。ジョブを直接編集したり、別の退会申請を作ったりしない。長引く場合は新規受付を止め、既存ジョブの処理範囲を確認する。

## 完了記録の整理

定期起動は公開条件に含めない。週次確認時に下記で30日を過ぎた完了記録の件数を確認し、該当がある場合は既存ワーカーを手動実行する。通常のジョブ取得処理に組み込まれた整理を利用するため、手動SQLで削除する必要はない。ワーカーは同じ実行で保留中のジョブを1工程進めることがある。

```sql
select count(*) as expired_completed_jobs
from app_private.account_withdrawals
where completed_at < now() - interval '30 days';
```
