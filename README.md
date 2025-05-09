# ai-log-reviewer

`ai-log-reviewer` is an AWS Lambda function that aggregates error logs from CloudWatch Logs, analyzes them using an AI model, and posts detailed reports to Slack. It helps teams monitor error trends and quickly identify critical issues.

## Overview

`ai-log-reviewer` automates the process of reviewing error logs by leveraging AWS services and AI. It queries CloudWatch Logs, summarizes error trends, detects anomalies, and delivers daily reports to Slack so teams can respond proactively.

## Features

- Aggregates and analyzes error logs from **CloudWatch Logs Insights**
- Detects sudden increases or new types of errors by comparing with historical data
- Generates daily reports using an **AI model (Anthropic Claude via AWS Bedrock)**
- Posts formatted reports to **Slack**
- Securely manages Slack credentials via **AWS Secrets Manager**

## Architecture

- **AWS Lambda**: Executes the log aggregation and reporting logic
- **CloudWatch Logs Insights**: Queries and aggregates error logs
- **AWS Bedrock (Anthropic Claude)**: Generates natural language reports
- **Slack**: Receives reports via bot integration
- **AWS Secrets Manager**: Stores Slack credentials securely

## Configuration

### AWS Secrets Manager

Store your Slack credentials in AWS Secrets Manager as a JSON object with the following keys:

- `SLACK_BOT_TOKEN`: Slack Bot authentication token
- `SLACK_SIGNING_SECRET`: Slack app signing secret

Example command:

```bash
aws secretsmanager create-secret \
    --name ai-log-reviewer-slack-secrets \
    --description "Slack credentials for ai-log-reviewer" \
    --secret-string '{"SLACK_BOT_TOKEN":"xoxb-1234567890-abcdefghijklmnopqrstuvwx","SLACK_SIGNING_SECRET":"abcd1234efgh5678ijkl9012mnop3456"}'
```

Set the secret name in your Lambda environment variables:

```env
SLACK_SECRETS_KEY=ai-log-reviewer-slack-secrets
```

### Environment Variables

Configure the following environment variables for your Lambda function:

- `LOG_GROUP_NAMES`: Comma-separated list of CloudWatch Log Group names
- `SLACK_CHANNEL_ID`: Slack channel ID to post reports
- `ENVIRONMENT_NAME`: Environment label (e.g., "production")
- `MODEL_ID`: Bedrock model ID (e.g., `anthropic.claude-3-5-sonnet-20240620-v1:0`)
- `SLACK_TEAM_ID`: Slack team ID
- `SLACK_BASE_URL`: Slack workspace base URL
- `SLACK_SECRETS_KEY`: Name of the secret in AWS Secrets Manager

### Example CDK Integration

```typescript
new NodejsFunction(this, "LogReviewer", {
    runtime: Runtime.NODEJS_22_X,
    description: `Log Reviewer for production`,
    handler: "handler",
    entry: path.join(__dirname, "ai-log-reviewer", "index.ts"),
    timeout: Duration.seconds(900),
    role,
    environment: {
        LOG_GROUP_NAMES: ["/aws/lambda/example-log-group"],
        SLACK_CHANNEL_ID: "C12345678",
        ENVIRONMENT_NAME: "production",
        MODEL_ID: "anthropic.claude-3-5-sonnet-20240620-v1:0",
        SLACK_TEAM_ID: "T12345678",
        SLACK_BASE_URL: "https://example.slack.com",
        SLACK_SECRETS_KEY: "ai-log-reviewer-slack-secrets",
    },
});
```

## Usage

Once deployed, `ai-log-reviewer` will automatically run on a schedule (e.g., daily via EventBridge) and post reports to the specified Slack channel.

## Log Input Format

- **Format**: CSV
- **Columns**:
  1. Timestamp when the error log was generated (UTC)
  2. Error log message
  3. Request path that generated the error log
- **Sort Order**: Logs should be pre-sorted by error message

## Report Format

- **Format**: Markdown
- **Contents**:
  1. The time range covered by the report
  2. Aggregated results by error log message (including the message and occurrence count)
  3. Error logs identified as important compared to previous logs
  4. If there are no important error logs, state "No issues detected."

## Notes

- This Lambda function uses the Anthropic Claude model on AWS Bedrock. Ensure your AWS account has the necessary permissions to use Bedrock and access Secrets Manager.

## License

This project is licensed under the [ISC License](LICENSE).
