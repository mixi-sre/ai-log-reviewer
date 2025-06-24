import type { ContentBlock } from "@aws-sdk/client-bedrock-runtime";
import { tz } from "@date-fns/tz";
import { format, getUnixTime, startOfDay, subDays } from "date-fns";
import { config } from "./config";
import { BedrockServiceImpl } from "./services/ai-service";
import { CloudWatchLogsServiceImpl } from "./services/log-service";
import { ReportServiceImpl } from "./services/report-service";
import { SecretsServiceImpl } from "./services/secrets-service";
import type { LogContent } from "./types";

// Define the query string for CloudWatch Logs Insights (aggregation by date)
function getQueryString(timeZone: string): string {
    // calculate the offset in milliseconds
    const now = new Date();
    const utcDate = now;
    const localDate = new Date(`${format(now, "yyyy-MM-dd'T'HH:mm:ss.SSS", { in: tz(timeZone) })}Z`);
    const offsetMs = localDate.getTime() - utcDate.getTime();
    console.log(`Time zone: ${timeZone}, Offset in milliseconds: ${offsetMs}`);

    return `
        fields coalesce(content.event, content.processor_error_code, content, content.message, content.error) as msg,
        concat(content.method, content.request_path) as path,
        datefloor(@timestamp + ${offsetMs}, 1d) as date
        | filter level != "info"
        | filter level != "notice"
        | filter not isblank(msg)
        | filter not isblank(level)
        | stats count() as cnt by date, msg, path
        | display date, cnt, msg, path
        | sort date desc, cnt desc
    `;
}

const QUERY_STRING = getQueryString(config.timeZone);
const NO_LOG_DATA_PREFIX = "No log data found for log group:";

/**
 * Calculate startTime, endTime, and logStartTime.
 */
function calculateTimeRanges() {
    const timeZone = config.timeZone;
    const now = new Date();
    const startOfToday = startOfDay(now, { in: tz(timeZone) });
    const startOfYesterday = subDays(startOfToday, 1);
    const sevenDaysAgo = subDays(startOfToday, 7);

    return {
        startTime: getUnixTime(startOfYesterday),
        endTime: getUnixTime(startOfToday) - 1,
        logStartTime: getUnixTime(sevenDaysAgo),
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
            console.log(`${NO_LOG_DATA_PREFIX} ${logGroupName}`);
            logContents.push({
                logGroupName,
                csvContent: `${NO_LOG_DATA_PREFIX} ${logGroupName}`,
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
    const normalizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9\s\-()[\]]/g, "").replace(/\s+/g, " ");

    // Exclude logs whose csvContent starts with the NO_LOG_DATA_PREFIX so that dummy data is not sent to the AI
    const validLogs = logContents.filter((log) => !log.csvContent.trim().startsWith(NO_LOG_DATA_PREFIX));

    const documents: ContentBlock.DocumentMember[] = validLogs.map((log) => ({
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
function prepareInstructions(yesterday: string, sevenDaysAgo: string): string {
    return `
# Role
You are a senior SRE engineer working in a team that develops web services.
One of your responsibilities is to review error logs on a daily basis to detect and prevent application failures.

Some error logs are output regularly and do not indicate major issues.
Therefore, you need to understand the historical trends of the error logs, assess the severity of each error, and report your findings to the application engineers.

# About the Input Error Logs
The provided CSV data includes the following pre-aggregated information:
1. date: The date on which the error occurred
2. cnt: The number of occurrences of the error
3. msg: The error message
4. path: The request path where the error occurred

# Rules
- The report must be written in **Japanese** and in **Markdown format**.
- Only objective facts based on the data should be reported. Do not include any speculation or suggestions for improvement.

# About the Report Format
First, specify the time period being analyzed.

Then, for the error logs on ${yesterday}, compare them with the logs from the period ${sevenDaysAgo} to ${yesterday}, and report the following:
1. Critical anomalies: Critical anomalies that require immediate attention
2. New errors: New error patterns not previously observed
3. Sudden increase in frequency: Errors whose frequency has significantly increased

If there are no error logs that can be judged as important, report: **"No issues detected"**.
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

    // Fetch 7 days of logs for AI analysis
    const logContents = await fetchLogs(logService, logStartTime, logEndTime);

    // Fetch yesterday's logs only for display
    const yesterdayLogContents = await fetchLogs(logService, startTime, endTime);

    // Prepare raw aggregated data (yesterday only)
    let rawDataContent = "# Log aggregation results\n\n";
    for (const logContent of yesterdayLogContents) {
        if (!logContent.csvContent.startsWith(NO_LOG_DATA_PREFIX)) {
            rawDataContent += `## ${logContent.logGroupName}\n\n\`\`\`\n${logContent.csvContent}\n\`\`\`\n\n`;
        } else {
            rawDataContent += `## ${logContent.logGroupName}\n\n${logContent.csvContent}\n\n`;
        }
    }

    // Process with AI (using 10 days of data)
    const content = prepareContent(logContents);
    const yesterday = format(new Date(startTime * 1000), "yyyy/MM/dd", { in: tz(timeZone) });
    const sevenDaysAgo = format(new Date(logStartTime * 1000), "yyyy/MM/dd", { in: tz(timeZone) });
    const instructions = prepareInstructions(yesterday, sevenDaysAgo);

    const aiService = new BedrockServiceImpl();
    const responseText = await aiService.sendRequest(config.modelId, content, instructions);

    const secretsService = new SecretsServiceImpl();
    const reportService = new ReportServiceImpl(secretsService);

    const formattedYMD = format(new Date(startTime * 1000), "yyyy/MM/dd", { in: tz(timeZone) });

    // Combine raw data and AI interpretation into one canvas
    const combinedContent = `${rawDataContent}---\n\n# AI interpretation results\n${responseText}`;
    const title = `Log Review (${formattedYMD}: ${config.environmentName})`;

    await reportService.execute(title, combinedContent);
    console.log("Log review completed successfully.");
};
