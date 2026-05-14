import { WorkflowNode, WorkflowContext } from "./WorkflowNode";

export class TriggerNode extends WorkflowNode {
    public nextNodeId?: string;

    constructor(id: string, nextNodeId?: string) {
        super(id, "TRIGGER");
        this.nextNodeId = nextNodeId;
    }

    async execute(context: WorkflowContext): Promise<string | null> {
        console.log(`⚡ [TriggerNode ${this.id}] Executing Trigger... Routing to ${this.nextNodeId}`);
        return this.nextNodeId || null;
    }
}
