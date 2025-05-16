import type { ContentBlock } from "@aws-sdk/client-bedrock-runtime";
import { tz } from "@date-fns/tz";
import { format, getUnixTime, startOfDay, subDays } from "date-fns";
import { config } from "./config";
import { BedrockServiceImpl } from "./services/ai-service";
import { CloudWatchLogsServiceImpl } from "./services/log-service";
import { ReportServiceImpl } from "./services/report-service";
import { SecretsServiceImpl } from "./services/secrets-service";
import type { LogContent } from "./types";

// Define the query string for CloudWatch Logs Insights
const QUERY_STRING = `
    fields coalesce(content.event, content.processor_error_code, content, content.message, content.error) as msg,
    concat(content.method, content.request_path) as path
    | filter level != "info"
    | filter level != "notice"
    | filter not isblank(msg)
    | filter not isblank(level)
    | display @timestamp, msg, path
    | sort msg, path, @timestamp desc
`;

/**
 * Calculate startTime, endTime, and logStartTime.
 */
function calculateTimeRanges() {
    const timeZone = config.timeZone;
    const now = new Date();
    const startOfToday = startOfDay(now, { in: tz(timeZone) });
    const startOfYesterday = subDays(startOfToday, 1);
    const tenDaysAgo = subDays(startOfToday, 10);

    return {
        startTime: getUnixTime(startOfYesterday),
        endTime: getUnixTime(startOfToday) - 1,
        logStartTime: getUnixTime(tenDaysAgo),
        logEndTime: getUnixTime(startOfToday) - 1,
        timeZone,
    };
}

/**
 * Fetch logs from CloudWatch Logs for the specified log groups.
 */
async function fetchLogs(
    logService: CloudWatchLogsServiceImpl,
    logStartTime: number,
    logEndTime: number,
): Promise<LogContent[]> {
    const logContents: LogContent[] = [];

    for (const logGroupName of config.logGroupNames) {
        console.log(`Querying log group: ${logGroupName}`);
        const logData = await logService.queryLogGroupAsCsv(logGroupName, logStartTime, logEndTime, QUERY_STRING);
        if (logData.csvContent) {
            logContents.push(logData);
        } else {
            console.log(`No log data found for log group: ${logGroupName}`);
            logContents.push({
                logGroupName,
                csvContent: `No log data found for log group: ${logGroupName}`,
            });
        }
    }

    return logContents;
}

/**
 * Prepare the content for the AI service based on the log data.
 */
function prepareContent(logContents: LogContent[]): ContentBlock[] {
    /**
     * Normalize the file name to comply with Bedrock API restrictions.
     * - Removes any characters that are not alphanumeric, whitespace, hyphens, parentheses, or square brackets.
     * - Replaces multiple consecutive whitespace characters with a single space.
     */
    const normalizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9\s\-\(\)\[\]]/g, "").replace(/\s+/g, " ");

    const documents: ContentBlock.DocumentMember[] = logContents.map((log) => ({
        document: {
            format: "csv",
            name: normalizeFileName(`${log.logGroupName}-logs`),
            source: { bytes: Buffer.from(log.csvContent) },
        },
    }));

    return [{ text: "Please summarize the following log." }, ...documents];
}

/**
 * Prepare the instructions for the AI service.
 */
function prepareInstructions(timeZone: string, formattedStartTime: string, formattedEndTime: string): string {
    return `
# Role
You are a senior SRE engineer working in a team that develops web services.
One of your responsibilities is to review error logs on a daily basis to detect and prevent application failures.

Some error logs are output regularly and do not indicate major issues.
Therefore, you need to understand the historical trends of the error logs, assess the severity of each error, and report your findings to the application engineers.

# Rules
Please aggregate *all* error logs from **${formattedStartTime}** to **${formattedEndTime}** by their content and report the number of occurrences for each.
Additionally, by comparing the logs from the period **7 days before ${formattedStartTime}** to **${formattedEndTime}**, if you find any error logs that have rapidly increased or any unfamiliar error messages, please include them in your report as well.

# About the Input Error Logs
- The error logs will be provided in CSV format.
- The first column in the CSV contains the timestamp when the error was logged, the second column contains the error message, and the third column contains the request path where the error occurred.
- The logs contain data from the past several days. All timestamps are in UTC.
- Although the timestamps are in UTC, please perform all analysis, aggregation, and comparison in ${timeZone}.
- The logs will be pre-sorted by the error message content.

# About the Report Format
Please write the report in **Markdown format**.

First, report the time range being analyzed.

Next, for **all** error logs from **${formattedStartTime}** to **${formattedEndTime}**, report the aggregated results grouped by error content.
The aggregated results **must** include the error message and the number of log entries with that same message.
The error message in the report **should** be shown exactly as it appears in the input.
Also, be sure to report **all** error logs within the aggregation period.

Then, by comparing with the logs from the period **7 days before ${formattedStartTime}** to **${formattedEndTime}**, report **all** error logs that can be judged as important.
If there are no error logs that can be considered important, please report: **"No issues detected"**.

Only report objective facts based on the data. Do not include guesses or suggestions for improvement.
The report must be written in **Japanese**.
    `;
}

/**
 * Main handler function for the Lambda.
 */
export const handler = async () => {
    const { startTime, endTime, logStartTime, logEndTime, timeZone } = calculateTimeRanges();
    const formattedStartTime = format(new Date(startTime * 1000), "yyyy/MM/dd HH:mm:ss", { in: tz(timeZone) });
    const formattedEndTime = format(new Date(endTime * 1000), "yyyy/MM/dd HH:mm:ss", { in: tz(timeZone) });
    console.log("Start Time:", formattedStartTime);
    console.log("End Time:", formattedEndTime);

    const logService = new CloudWatchLogsServiceImpl();
    const logContents = await fetchLogs(logService, logStartTime, logEndTime);

    const content = prepareContent(logContents);
    const instructions = prepareInstructions(config.timeZone, formattedStartTime, formattedEndTime);

    const aiService = new BedrockServiceImpl();
    const responseText = await aiService.sendRequest(config.modelId, content, instructions);

    const secretsService = new SecretsServiceImpl();
    const reportService = new ReportServiceImpl(secretsService);

    const formattedYMD = format(new Date(startTime * 1000), "yyyy/MM/dd", { in: tz(timeZone) });
    const title = `Log Review (${formattedYMD}: ${config.environmentName})`;

    await reportService.execute(title, responseText);
    console.log("Log review completed successfully.");
};
