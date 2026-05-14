import { WorkflowNode, WorkflowContext } from "./WorkflowNode";
import { ToolRouter } from "../tools/ToolRouter";

/**
 * ActionNode demonstrates Inheritance and Single Responsibility.
 * It is responsible ONLY for routing an action to the external ToolRouter.
 */
export class ActionNode extends WorkflowNode {
    public toolName: string;
    public parameters: Record<string, any>;

    constructor(id: string, toolName: string, parameters: Record<string, any>, nextNodeId?: string) {
        super(id, "ACTION", nextNodeId);
        this.toolName = toolName;
        this.parameters = parameters;
    }

    async execute(context: WorkflowContext): Promise<string | null> {
        console.log(`⚡ [ActionNode ${this.id}] Executing Tool: ${this.toolName}`);
        
        try {
            const router = ToolRouter.getInstance();
            
            // Map context memory variables to tool parameters dynamically if needed
            // (e.g. replacing "{{leadId}}" with actual memory data)
            const processedArgs = { ...this.parameters };
            if (context.memory.extractedData) {
               Object.assign(processedArgs, context.memory.extractedData);
            }

            // Extract ownerId from context (assuming it is set during trigger)
            const ownerId = context.triggerData?.ownerId || "default-owner-id";

            // Execute the specific tool
            const result = await router.execute(ownerId, this.toolName, processedArgs);
            
            // Save result to memory for future nodes
            context.memory[`${this.id}_result`] = result;

            console.log(`✅ [ActionNode ${this.id}] Completed successfully.`);
            return this.nextNodeId || null;
            
        } catch (error: any) {
            console.error(`❌ [ActionNode ${this.id}] Failed:`, error.message);
            // In a production system, we'd throw a specific RetryableError here
            return null; 
        }
    }
}
