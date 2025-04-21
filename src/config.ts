import * as dotenv from "dotenv";
import type { Config } from "./types";

dotenv.config(); // Load environment variables from .env file

/**
 * Application configuration loaded from environment variables.
 */
export const config: Config = {
    slackChannelId: process.env.SLACK_CHANNEL_ID || "",
    environmentName: process.env.ENVIRONMENT_NAME || "",
    logGroupNames: process.env.LOG_GROUP_NAMES?.split(",") || [],
    modelId: process.env.MODEL_ID || "",
    slackTeamId: process.env.SLACK_TEAM_ID || "",
    slackBaseUrl: process.env.SLACK_BASE_URL || "",
    slackSecretsKey: process.env.SLACK_SECRETS_KEY || "",
    timeZone: process.env.TIME_ZONE || "Asia/Tokyo",
};

/**
 * Validates the configuration and throws an error if any required field is missing.
 */
function validateConfig(config: Config): void {
    if (!config.slackChannelId) throw new Error("SLACK_CHANNEL_ID is not set.");
    if (!config.environmentName) throw new Error("ENVIRONMENT_NAME is not set.");
    if (config.logGroupNames.length === 0) throw new Error("LOG_GROUP_NAMES is not set or empty.");
    if (!config.modelId) throw new Error("MODEL_ID is not set.");
    if (!config.slackTeamId) throw new Error("SLACK_TEAM_ID is not set.");
    if (!config.slackBaseUrl) throw new Error("SLACK_BASE_URL is not set.");
    if (!config.slackSecretsKey) throw new Error("SLACK_SECRETS_KEY is not set.");
}

validateConfig(config);
