import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

export interface SecretsService {
    getSecretValue(secretName: string): Promise<Record<string, string>>;
}

export class SecretsServiceImpl implements SecretsService {
    private client: SecretsManagerClient;

    constructor(client?: SecretsManagerClient) {
        // Allow dependency injection for easier testing
        this.client = client || new SecretsManagerClient();
    }

    async getSecretValue(secretName: string): Promise<Record<string, string>> {
        try {
            const command = new GetSecretValueCommand({ SecretId: secretName });
            const response = await this.client.send(command);

            if (!response.SecretString) {
                throw new Error(`Secret '${secretName}' does not contain a valid string value.`);
            }

            return JSON.parse(response.SecretString);
        } catch (error) {
            console.error(`Failed to retrieve secret '${secretName}':`, error);
            throw new Error(`Unable to fetch secret '${secretName}'. Please check the secret's configuration.`);
        }
    }
}
