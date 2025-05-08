import {
    CloudWatchLogsClient,
    GetQueryResultsCommand,
    type ResultField,
    StartQueryCommand,
} from "@aws-sdk/client-cloudwatch-logs";

export interface CloudWatchLogsService {
    queryLogGroupAsCsv(
        logGroupName: string,
        startTime: number,
        endTime: number,
        queryString: string,
    ): Promise<{ logGroupName: string; csvContent: string }>;
}

export class CloudWatchLogsServiceImpl implements CloudWatchLogsService {
    private client: CloudWatchLogsClient;
    private static readonly MAX_CSV_ROW_LENGTH = 100;

    constructor() {
        this.client = new CloudWatchLogsClient();
    }

    async queryLogGroupAsCsv(
        logGroupName: string,
        startTime: number,
        endTime: number,
        queryString: string,
    ): Promise<{ logGroupName: string; csvContent: string }> {
        const queryId = await this.startQuery(logGroupName, startTime, endTime, queryString);
        const queryResults = await this.getQueryResults(queryId, logGroupName);
        const csvContent = this.convertResultsToCsv(queryResults);

        return { logGroupName, csvContent };
    }

    private async startQuery(
        logGroupName: string,
        startTime: number,
        endTime: number,
        queryString: string,
    ): Promise<string> {
        const startQueryCommand = new StartQueryCommand({
            logGroupName,
            startTime,
            endTime,
            queryString,
        });

        const startQueryResponse = await this.client.send(startQueryCommand);
        const queryId = startQueryResponse.queryId;

        if (!queryId) {
            throw new Error(`Failed to start CloudWatch Logs Insights query for log group: ${logGroupName}`);
        }

        return queryId;
    }

    private async getQueryResults(queryId: string, logGroupName: string): Promise<ResultField[][]> {
        const maxRetries = 60;
        const retryInterval = 1000; // 1 second

        for (let retryCount = 0; retryCount < maxRetries; retryCount++) {
            const getQueryResultsCommand = new GetQueryResultsCommand({ queryId });
            const getQueryResultsResponse = await this.client.send(getQueryResultsCommand);

            if (getQueryResultsResponse.status === "Complete") {
                return getQueryResultsResponse.results || [];
            }

            await new Promise((resolve) => setTimeout(resolve, retryInterval));
        }

        console.warn(`Query timed out for log group: ${logGroupName}`);
        return [];
    }

    private convertResultsToCsv(queryResults: ResultField[][]): string {
        if (queryResults.length === 0) {
            return "";
        }

        const csvHeader = queryResults[0].map((field) => field.field).join(",");
        const csvRows = queryResults
            .map((result) => result.map((field) => field.value).join(","))
            // Truncate long rows
            .map((row) =>
                row.length > CloudWatchLogsServiceImpl.MAX_CSV_ROW_LENGTH
                    ? `${row.slice(0, CloudWatchLogsServiceImpl.MAX_CSV_ROW_LENGTH)}...`
                    : row,
            );

        return [csvHeader, ...csvRows].join("\n");
    }
}
