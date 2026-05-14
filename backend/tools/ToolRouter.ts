import { ITool } from "./ITool";
import { CRMTool } from "./impl/CRMTool";
import { TicketTool } from "./impl/TicketTool";
import { VisitTool } from "./impl/VisitTool";
import { ResourceTool } from "./impl/ResourceTool";
import { SlackTool } from "./impl/SlackTool";
import { GoogleSheetsTool } from "./impl/GoogleSheetsTool";
import { WorkflowCRMTool } from "./impl/WorkflowCRMTool";

/**
 * ToolRouter — Singleton Pattern
 * 
 * Acts as the central registry of all available tools.
 * The AI can query getToolDefinitions() to understand what it CAN do,
 * then we intercept the AI's function call requests and route them here.
 * 
 * To add a new tool in the future: simply add it to the `tools` array.
 * The rest of the system automatically picks it up (Open/Closed Principle).
 */
export class ToolRouter {
    private static instance: ToolRouter;
    private tools: Map<string, ITool> = new Map();

    private constructor() {
        // Register all available tools at startup
        this.register(new CRMTool());
        this.register(new TicketTool());
        this.register(new VisitTool());
        this.register(new ResourceTool());
        // Workflow Engine Tools
        this.register(new SlackTool());
        this.register(new GoogleSheetsTool());
        this.register(new WorkflowCRMTool());
    }

    /** Singleton: returns a single shared instance */
    static getInstance(): ToolRouter {
        if (!ToolRouter.instance) {
            ToolRouter.instance = new ToolRouter();
        }
        return ToolRouter.instance;
    }

    /** Registers a new tool */
    private register(tool: ITool): void {
        this.tools.set(tool.name, tool);
    }

    /**
     * Returns tool definitions in Gemini's `functionDeclarations` format.
     * The AI reads these definitions to know what actions it can take.
     */
    getToolDefinitions(): any[] {
        return Array.from(this.tools.values()).map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
        }));
    }

    /**
     * Executes a tool by name.
     * Called after the AI responds with a function call request.
     */
    async execute(ownerId: string, toolName: string, args: Record<string, any>): Promise<string> {
        const tool = this.tools.get(toolName);
        if (!tool) {
            return `Error: Tool "${toolName}" is not registered.`;
        }
        console.log(`[ToolRouter] Executing tool: "${toolName}" for owner: "${ownerId}" | args:`, args);
        return tool.execute(ownerId, args);
    }
}
