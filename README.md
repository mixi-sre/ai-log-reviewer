# log-reviewer

`log-reviewer` は、CloudWatch Logs のエラーログを集計し、AI モデルを活用してレポートを生成するための Lambda Function です。このレポートは Slack に投稿され、エラーの傾向や重要なエラーをチームに共有します。

## 機能

- **CloudWatch Logs Insights** を使用してエラーログをクエリ。
- 過去のエラーログと比較して、急増したエラーや新しいエラーを検出。
- **AI モデル（Anthropic Claude）** を使用してレポートを生成。
- **Slack** にレポートを投稿。

## Secrets Manager の設定

`log-reviewer` は Slack の認証情報を AWS Secrets Manager に保存して使用します。以下のキーを含むシークレットを作成してください。

### 必要なシークレットキー

- **SLACK_BOT_TOKEN**: Slack Bot の認証トークン。
- **SLACK_SIGNING_SECRET**: Slack アプリの署名シークレット。

### シークレットの作成例

AWS CLI を使用してシークレットを作成する場合、以下のコマンドを実行します：

```bash
aws secretsmanager create-secret \
    --name log-reviewer-slack-secrets \
    --description "Slack credentials for log-reviewer" \
    --secret-string '{"SLACK_BOT_TOKEN":"xoxb-1234567890-abcdefghijklmnopqrstuvwx","SLACK_SIGNING_SECRET":"abcd1234efgh5678ijkl9012mnop3456"}'
```

### 環境変数での指定

Secrets Manager に保存したシークレットの名前を環境変数 `SLACK_SECRETS_KEY` に設定してください。

例:
```env
SLACK_SECRETS_KEY=log-reviewer-slack-secrets
```

これにより、`log-reviewer` は Secrets Manager から Slack の認証情報を取得して使用します。

## 使用方法

### CDK に組み込む

以下は `log-reviewer` を CDK スタックに組み込むサンプルコードです：

```typescript
new NodejsFunction(this, "LogReviewer", {
    runtime: Runtime.NODEJS_22_X,
    description: `Log Reviewer for production`,
    handler: "handler",
    entry: path.join(__dirname, "log-reviewer", "index.ts"),
    timeout: Duration.seconds(900),
    role,
    environment: {
        LOG_GROUP_NAMES: ["/aws/lambda/example-log-group"],
        SLACK_CHANNEL_ID: "C12345678",
        ENVIRONMENT_NAME: "production",
        MODEL_ID: "anthropic.claude-3-5-sonnet-20240620-v1:0", // Claude 3.5 Sonnet
        SLACK_TEAM_ID: "T12345678",
        SLACK_BASE_URL: "https://example.slack.com",
        SLACK_SECRETS_KEY: "log-reviewer-slack-secrets",
    },
});
```

## ログの入力形式

- **形式**: CSV
- **カラム**:
  1. エラーログが出力された時刻（UTC）
  2. エラーログの内容
  3. エラーログを出力したリクエストのパス
- **ソート順**: エラーログの内容でソートされた状態で入力。

## レポート形式

- **形式**: Markdown
- **内容**:
  1. 調査対象の時間範囲。
  2. エラーログの内容ごとの集計結果（エラーメッセージと発生回数）。
  3. 過去のログと比較して重要と判定できるエラーログ。
  4. 重要なエラーログがない場合は「異常なし」と記載。

## プロンプトについて

以下の指示を英訳したものを利用しています。

```markdown
# 役割
あなたはウェブサービスを開発するチームで働いているシニアSREエンジニアです。
あなたの仕事の一つは、毎日エラーログをレビューすることで、アプリケーションの障害を検出・防止することです。

エラーログの中には日常的に出力されているもの、大きな問題がないものも存在します。
そのため、あなたはエラーログの過去傾向も把握したうえで、エラーの重要度を判定し、アプリケーションエンジニアに報告する必要があります。

# ルール
2025/04/09 00:00 ~ 2025/04/09 23:59 の全てのエラーログを内容ごとに集計して、集計数とともに報告してください。
また、2025/04/02 00:00 ~ 2025/04/09 23:59 の期間のログと比較して、特定のエラーログが急増していたり、見慣れないエラーログがある場合は、それも報告してください。

# 入力するエラーログについて
- エラーログは CSV データで渡します。
- CSV の最初のカラムはエラーログが出力された時刻、次のカラムはエラーログの内容、さらに次のカラムはエラーログを出力したリクエストのパスです。
- エラーログには過去数日のデータが含まれます。時刻のタイムゾーンは UTC です。
- エラーログはエラーログの内容でソートされた状態で入力します。

# 報告形式について
Markdown 形式で報告してください。

まず、調査対象とする時間を報告してください。

次に 2025/04/09 00:00 ~ 2025/04/09 23:59 の全てのエラーログに関して、内容ごとの集計結果を報告してください。
集計結果には、エラーログの内容と、同じエラーログを出力しているログの行数を含めてください。
報告するエラーログの内容は、入力された情報をそのまま出力してください。
また、集計対象のエラーログは「全て」報告してください。

そして、2025/04/02 00:00 ~ 2025/04/09 23:59 の期間のログと比較して、重要と判定できるエラーログを全て報告してください。
重要と判定できるエラーログが無い場合は「異常なし」と報告してください。

データに基づいた客観的な事実のみを報告し、推測や改善提案は含めないでください。
報告は、日本語で記述してください。
```

## 注意事項

- この Lambda Function は AWS Bedrock の Anthropic Claude モデルを使用します。利用には適切な権限が必要です。
