# 退会の本番試験

事前確認はUUIDで照合し、Auth identity、確認済みメールの有無、個人行・共有行・招待・所属・所有グループ・画像と退会待ちの件数を再確認する。メール、パスワード、確認コード、JWTを記録へ出力しない。所属、新しい共有参照、所有画像、現存グループへの招待を検出した対象では試験を止める。消滅済みグループで本人宛てだけの招待は対象アカウントの削除範囲に含まれる。

## 承認前と承認後

1. 承認前は現行のFirewall、受付、ワーカー停止を維持する。隔離で `20261127000500_account_withdrawal_pilot.sql` を検証する。1〜3本目は再適用せず、アーカイブされた4本目も適用しない。
2. 本番準備を承認したら、Firewallとワークフロー停止のまま5本目とアプリを反映する。Productionに `WITHDRAWAL_PILOT_UUIDS` として承認されたUUIDだけをカンマ区切りで設定する。一般受付停止 `ACCOUNT_WITHDRAWAL_INTAKE_DISABLED=true` を維持し、`ACCOUNT_WITHDRAWAL_GENERAL_RELEASE_ENABLED` を設定しない。有効な対象設定がなければ試験を開始しない。
3. 承認済みの経路だけに退会パスを絞り、`ACCOUNT_WITHDRAWAL_ENABLED=true`、`NEXT_PUBLIC_ACCOUNT_WITHDRAWAL_ENABLED=true`、`WITHDRAWAL_PILOT_INTAKE_ENABLED=true` を反映する。最終承認前は `WITHDRAWAL_PILOT_BEGIN_ENABLED` と `WITHDRAWAL_PILOT_WORKER_ENABLED` を無効にする。この状態で確認方式を見られる。実メールの承認がある場合はGoogle用コードの受信と誤入力拒否も確認できる。有効なコードを試すと確定停止で受付されない場合もコードは消費される。確定時は新しいコードを発行する。
4. 対象とデータ範囲を再照合し、最終承認後だけ `WITHDRAWAL_PILOT_BEGIN_ENABLED=true` を反映する。本人が正しいパスワードまたはメールコードで各1件を受付ける。受付成功時点で個人DB行の削除が始まる。ブラウザーを閉じてから試験受付と確定を再停止する。試験モードの状態照会は読み取り専用。
5. 別途承認された段階でワーカーが到達できるFirewall条件に切り替え、`WITHDRAWAL_PILOT_WORKER_ENABLED` とActionsのコード上の停止条件・運用変数を更新する。手動実行1回と後続の定期実行で、指定UUIDから登録されたジョブだけが進むことを確認する。完了メール、対象Auth削除、対象外ジョブ・DB件数・共有状態を照合する。
6. 検証終了後はActionsを停止し、Firewallの退会パスdeny、試験受付・確定・API/UIの停止を復旧する。設定と件数だけを記録する。一般公開は別途承認する。
