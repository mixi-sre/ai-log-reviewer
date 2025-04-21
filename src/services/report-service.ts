import { SlackClientImpl } from "../clients/slack-client";
import { config } from "../config";
import type { SecretsService } from "./secrets-service";

export interface ReportService {
    execute(title: string, contents: string): Promise<void>;
}

type SlackSecrets = {
    SLACK_BOT_TOKEN: string;
    SLACK_SIGNING_SECRET: string;
};

export class ReportServiceImpl implements ReportService {
    constructor(private secretsService: SecretsService) {}

    async execute(title: string, contents: string): Promise<void> {
        const slackSecrets = await this.fetchSlackSecrets();
        const slackService = this.initializeSlackClient(slackSecrets);

        const sanitizedContents = slackService.sanitizeMarkdown(contents);
        const canvasId = await this.createCanvas(slackService, title, sanitizedContents);

        await this.setCanvasAccess(slackService, canvasId);
        await this.postCanvasLink(slackService, canvasId);
    }

    private async fetchSlackSecrets(): Promise<SlackSecrets> {
        console.log("Fetching Slack secrets...");
        const slackSecrets = await this.secretsService.getSecretValue(config.slackSecretsKey);

        if (!slackSecrets.SLACK_BOT_TOKEN || !slackSecrets.SLACK_SIGNING_SECRET) {
            throw new Error("Missing required Slack secrets: SLACK_BOT_TOKEN or SLACK_SIGNING_SECRET.");
        }

        return slackSecrets as SlackSecrets;
    }

    private initializeSlackClient(slackSecrets: SlackSecrets): SlackClientImpl {
        return new SlackClientImpl(slackSecrets.SLACK_BOT_TOKEN, slackSecrets.SLACK_SIGNING_SECRET);
    }

    private async createCanvas(slackService: SlackClientImpl, title: string, contents: string): Promise<string> {
        console.log("Creating canvas...");
        const canvasId = await slackService.createCanvas(title, contents);
        console.log("Canvas ID:", canvasId);
        return canvasId;
    }

    private async setCanvasAccess(slackService: SlackClientImpl, canvasId: string): Promise<void> {
        await slackService.setCanvasAccess(canvasId, config.slackChannelId);
    }

    private async postCanvasLink(slackService: SlackClientImpl, canvasId: string): Promise<void> {
        const link = `${config.slackBaseUrl}/docs/${config.slackTeamId}/${canvasId}`;
        await slackService.postMessage(config.slackChannelId, `ログレビューを作成しました。\n${link}`);
    }
}
