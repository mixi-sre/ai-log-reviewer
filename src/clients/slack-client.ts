import { App } from "@slack/bolt";

export interface SlackClient {
    sanitizeMarkdown(markdown: string): string;
    postMessage(channel: string, text: string): Promise<void>;
    createCanvas(title: string, markdown: string): Promise<string>;
    setCanvasAccess(canvasId: string, channelId: string): Promise<void>;
}

export class SlackClientImpl implements SlackClient {
    private app: App;

    constructor(token: string, signingSecret: string) {
        this.app = new App({ token, signingSecret });
    }

    sanitizeMarkdown(markdown: string): string {
        let sanitizedMarkdown = markdown; // Use a local variable

        // Flatten nested lists (e.g., bullet lists within numbered lists)
        sanitizedMarkdown = sanitizedMarkdown.replace(/(\d+\.\s.*\n)(\s+-\s.*\n)+/g, (match) => {
            return match
                .split("\n")
                .map((line) => line.trim().replace(/^-/, "*")) // Convert bullets to top-level items
                .join("\n");
        });

        // Remove unsupported list types (e.g., nested numbered lists)
        sanitizedMarkdown = sanitizedMarkdown.replace(/(\d+\.\s.*\n)(\s+\d+\.\s.*\n)+/g, (match) => {
            return match
                .split("\n")
                .map((line) => line.trim().replace(/^\d+\./, "*")) // Convert nested numbered lists to bullets
                .join("\n");
        });

        // Replace unsupported Markdown elements (e.g., tables) with plain text
        sanitizedMarkdown = sanitizedMarkdown.replace(/\|.*\|/g, (match) => {
            return match.replace(/\|/g, " "); // Replace table pipes with spaces
        });

        // Remove excessive newlines
        sanitizedMarkdown = sanitizedMarkdown.replace(/\n{3,}/g, "\n\n");

        return sanitizedMarkdown;
    }

    async postMessage(channel: string, text: string): Promise<void> {
        await this.app.client.chat.postMessage({ channel, text });
    }

    async createCanvas(title: string, markdown: string): Promise<string> {
        const response = await this.app.client.canvases.create({
            title,
            document_content: { type: "markdown", markdown },
        });
        return response.canvas_id as string;
    }

    async setCanvasAccess(canvasId: string, channelId: string): Promise<void> {
        await this.app.client.canvases.access.set({
            canvas_id: canvasId,
            access_level: "read",
            channel_ids: [channelId],
        });
    }
}
