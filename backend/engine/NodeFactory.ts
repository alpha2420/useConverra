import { WorkflowNode } from "./WorkflowNode";
import { ActionNode } from "./ActionNode";
import { ConditionNode } from "./ConditionNode";
import { TriggerNode } from "./TriggerNode";

export class NodeFactory {
    
    public static createNode(nodeData: any, nextNodeId?: string): WorkflowNode {
        switch (nodeData.type) {
            case "TRIGGER":
                return new TriggerNode(
                    nodeData.id,
                    nextNodeId
                );

            case "ACTION":
                return new ActionNode(
                    nodeData.id,
                    nodeData.config?.tool || "UnknownTool",
                    nodeData.config?.parameters || {},
                    nextNodeId
                );
                
            case "CONDITION":
                // In a linear builder, a FALSE condition typically stops the workflow or routes elsewhere.
                // We'll set truePath to the next node, and falsePath to null (stop) for now.
                return new ConditionNode(
                    nodeData.id,
                    nodeData.config?.rule || "",
                    nextNodeId,
                    undefined // Stops if condition fails
                );

            default:
                throw new Error(`Unknown node type: ${nodeData.type}`);
        }
    }

    /**
     * Rehydrates an entire array of nodes from JSON (Linear array from UI)
     */
    public static rehydrateWorkflow(nodesJson: any[]): { nodeMap: Record<string, WorkflowNode>, startNodeId: string | null } {
        const nodeMap: Record<string, WorkflowNode> = {};
        
        if (!nodesJson || nodesJson.length === 0) {
            return { nodeMap, startNodeId: null };
        }

        for (let i = 0; i < nodesJson.length; i++) {
            const json = nodesJson[i];
            const nextJson = nodesJson[i + 1];
            
            const node = this.createNode(json, nextJson?.id);
            nodeMap[node.id] = node;
        }

        return { nodeMap, startNodeId: nodesJson[0].id };
    }
}
