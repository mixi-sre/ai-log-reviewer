import { handler } from "../src/index";
import { BedrockServiceImpl } from "../src/services/ai-service";
import { CloudWatchLogsServiceImpl } from "../src/services/log-service";
import { ReportServiceImpl } from "../src/services/report-service";

jest.mock("../src/services/log-service");
jest.mock("../src/services/ai-service");
jest.mock("../src/services/report-service");

describe("ai-log-reviewer Lambda", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should process logs and send a report", async () => {
        // Mock CloudWatchLogsServiceImpl
        const mockLogService = CloudWatchLogsServiceImpl as jest.MockedClass<typeof CloudWatchLogsServiceImpl>;
        mockLogService.prototype.queryLogGroupAsCsv.mockResolvedValue({
            logGroupName: "test-log-group",
            csvContent: "timestamp,message,path\n2025-04-10T01:00:00Z,Error occurred,/test/path",
        });

        // Mock BedrockServiceImpl
        const mockAIService = BedrockServiceImpl as jest.MockedClass<typeof BedrockServiceImpl>;
        mockAIService.prototype.sendRequest.mockResolvedValue("AI-generated report");

        // Mock ReportServiceImpl
        const mockReportService = ReportServiceImpl as jest.MockedClass<typeof ReportServiceImpl>;
        mockReportService.prototype.execute.mockResolvedValue();

        await handler();

        // Verify log service was called
        expect(mockLogService.prototype.queryLogGroupAsCsv).toHaveBeenCalled();

        // Verify AI service was called
        expect(mockAIService.prototype.sendRequest).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(Array),
            expect.any(String),
        );

        // Verify report service was called
        expect(mockReportService.prototype.execute).toHaveBeenCalledWith(
            expect.stringContaining("Log Review"),
            "AI-generated report",
        );
    });

    it("should handle errors when AI service fails", async () => {
        const mockLogService = CloudWatchLogsServiceImpl as jest.MockedClass<typeof CloudWatchLogsServiceImpl>;
        mockLogService.prototype.queryLogGroupAsCsv.mockResolvedValue({
            logGroupName: "test-log-group",
            csvContent: "timestamp,message,path\n2025-04-10T01:00:00Z,Error occurred,/test/path",
        });

        const mockAIService = BedrockServiceImpl as jest.MockedClass<typeof BedrockServiceImpl>;
        mockAIService.prototype.sendRequest.mockRejectedValue(new Error("AI service error"));

        await expect(handler()).rejects.toThrow("AI service error");
    });
});
