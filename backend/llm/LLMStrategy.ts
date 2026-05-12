export interface LLMResponse {
    canAnswer: boolean;
    reply: string;
}

export interface LLMStrategy {
    generate(prompt: string, options?: { isComplex?: boolean, ownerId?: string }): Promise<LLMResponse | null>;
}
