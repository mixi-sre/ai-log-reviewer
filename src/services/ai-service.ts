import { BedrockRuntimeClient, type ContentBlock, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

export interface AIService<InputType> {
    /**
     * Sends a request to the AI service and retrieves a response.
     * @param modelId The ID of the model to use.
     * @param input The input data for the AI service.
     * @param systemInstructions System-level instructions for the AI service.
     * @returns The response text from the AI service.
     */
    sendRequest(modelId: string, input: InputType, systemInstructions: string): Promise<string>;
}

export class BedrockServiceImpl implements AIService<ContentBlock[]> {
    private client: BedrockRuntimeClient;

    constructor(client?: BedrockRuntimeClient) {
        // Allow dependency injection for easier testing
        this.client = client || new BedrockRuntimeClient();
    }

    async sendRequest(modelId: string, input: ContentBlock[], systemInstructions: string): Promise<string> {
        try {
            const converseCommand = new ConverseCommand({
                modelId,
                // https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters.html
                // https://docs.anthropic.com/en/docs/about-claude/models/all-models#model-comparison-table
                inferenceConfig: {
                    maxTokens: 8192,
                    temperature: 0.1,
                },
                messages: [
                    {
                        role: "user",
                        content: input,
                    },
                ],
                system: [
                    {
                        text: systemInstructions,
                    },
                ],
            });

            console.log("Sending request to Bedrock...");
            const commandOutput = await this.client.send(converseCommand);
            console.log(`Received response from Bedrock: ${JSON.stringify(commandOutput)}`);

            // Extract response text
            const responseText = commandOutput.output?.message?.content?.at(0)?.text;
            if (!responseText) {
                throw new Error("No valid response text found in Bedrock response.");
            }

            return responseText;
        } catch (error) {
            console.error("Error while sending request to Bedrock:", error);
            throw new Error(
                "Failed to communicate with the AI service. Please check the input and model configuration.",
            );
        }
    }
}
