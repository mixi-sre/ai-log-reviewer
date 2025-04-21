/**
 * Configuration interface for the application.
 */
export interface Config {
    slackChannelId: string;
    environmentName: string;
    logGroupNames: string[];
    modelId: string;
    slackTeamId: string;
    slackBaseUrl: string;
    slackSecretsKey: string;
    timeZone: string;
}

/**
 * Represents the structure of a log entry with its CSV content.
 */
export interface LogContent {
    logGroupName: string;
    csvContent: string;
}
