export interface ITool {
    name: string;
    description: string;
    parameters: any; // JSON Schema for parameters
    execute(ownerId: string, args: Record<string, any>): Promise<string>;
}
