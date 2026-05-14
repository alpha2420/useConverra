import { NodeFactory } from "./NodeFactory";
import { WorkflowContext } from "./WorkflowNode";
import { Workflow } from "../models/workflow.model";

/**
 * The core execution loop of Converra.
 */
export class WorkflowEngine {
    
    /**
     * Entry point triggered by a Webhook (e.g., new WhatsApp message).
     */
    public static async trigger(workflowId: string, triggerData: any) {
        console.log(`\n🚀 [WorkflowEngine] Triggering Workflow: ${workflowId}`);
        
        try {
            // 1. Fetch Workflow from Database
            const workflowDoc = await Workflow.findById(workflowId);
            if (!workflowDoc || !workflowDoc.isActive) {
                console.log(`[WorkflowEngine] Workflow ${workflowId} is inactive or missing.`);
                return;
            }

            // 2. Use NodeFactory to rehydrate JSON into OOP classes
            const { nodeMap: nodes, startNodeId } = NodeFactory.rehydrateWorkflow(workflowDoc.nodes);
            
            // 3. Find the Start Node
            let currentNodeId: string | null = startNodeId;
            
            // 4. Initialize Execution Context (Memory)
            const context: WorkflowContext = {
                workflowId: workflowId,
                triggerData: triggerData,
                memory: {}
            };

            // 5. The Execution Loop
            while (currentNodeId && nodes[currentNodeId]) {
                const node: import('./WorkflowNode').WorkflowNode = nodes[currentNodeId];
                
                // Polymorphic execution: We don't care if it's Action or Condition
                currentNodeId = await node.execute(context);
                
                // If the node returns a valid ID, the loop continues.
                // If it returns null, execution is complete.
            }

            console.log(`🏁 [WorkflowEngine] Execution Complete. Context Memory:`, context.memory);
            
        } catch (error) {
            console.error(`💥 [WorkflowEngine] Fatal Error during execution:`, error);
            // Here we would log to an ExecutionLog table for the UI dashboard
        }
    }
}
