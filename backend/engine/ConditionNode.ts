import { WorkflowNode, WorkflowContext } from "./WorkflowNode";
// We would import an AI strategy here, for example:
// import { GeminiStrategy } from "../services/ai/GeminiStrategy";

/**
 * ConditionNode encapsulates the "AI Understanding Layer".
 * Evaluates a plain-English rule against the current context.
 */
export class ConditionNode extends WorkflowNode {
    public plainEnglishRule: string;
    public truePathNodeId?: string;
    public falsePathNodeId?: string;

    constructor(
        id: string, 
        rule: string, 
        truePath?: string, 
        falsePath?: string
    ) {
        super(id, "CONDITION");
        this.plainEnglishRule = rule;
        this.truePathNodeId = truePath;
        this.falsePathNodeId = falsePath;
    }

    async execute(context: WorkflowContext): Promise<string | null> {
        console.log(`🧠 [ConditionNode ${this.id}] Evaluating Rule: "${this.plainEnglishRule}"`);
        
        try {
            const { WorkflowAIStrategy } = await import("./strategies/WorkflowAIStrategy");
            const aiDecidesTrue = await WorkflowAIStrategy.evaluateCondition(this.plainEnglishRule, context.triggerData);

            if (aiDecidesTrue) {
                console.log(`🟢 [ConditionNode ${this.id}] Evaluated TRUE -> routing to ${this.truePathNodeId}`);
                return this.truePathNodeId || null;
            } else {
                console.log(`🔴 [ConditionNode ${this.id}] Evaluated FALSE -> routing to ${this.falsePathNodeId}`);
                return this.falsePathNodeId || null;
            }
        } catch (error: any) {
            console.error(`❌ [ConditionNode ${this.id}] AI Evaluation Failed:`, error.message);
            return null; // Stop workflow if AI fails
        }
    }
}
