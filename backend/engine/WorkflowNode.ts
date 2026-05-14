export interface WorkflowContext {
    workflowId: string;
    triggerData: any;      // The raw message/image that triggered this flow
    memory: Record<string, any>; // Extracted variables passing from node to node
}

/**
 * Base abstract class demonstrating Abstraction and Polymorphism.
 * All specific node types will inherit from this.
 */
export abstract class WorkflowNode {
    public id: string;
    public type: string;
    public nextNodeId?: string;

    constructor(id: string, type: string, nextNodeId?: string) {
        this.id = id;
        this.type = type;
        this.nextNodeId = nextNodeId;
    }

    /**
     * Executes the core logic of the node.
     * @returns The ID of the next node to execute, or null if execution stops.
     */
    abstract execute(context: WorkflowContext): Promise<string | null>;
}
