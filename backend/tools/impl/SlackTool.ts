import { ITool } from "../ITool";

/**
 * SlackTool — Sends a real-time alert to a Slack webhook URL.
 *
 * Setup: Go to api.slack.com/apps → Create App → Incoming Webhooks → Add New Webhook to Workspace
 * Paste the Webhook URL into your .env.local as SLACK_WEBHOOK_URL
 */
export class SlackTool implements ITool {
    name = "SlackTool";
    description = "Sends a real-time notification to your team's Slack channel. Use this to alert the team about high-priority leads or important events.";
    parameters = {
        type: "object",
        properties: {
            message: {
                type: "string",
                description: "The full message to send to Slack"
            }
        },
        required: ["message"]
    };

    async execute(ownerId: string, args: Record<string, any>): Promise<string> {
        const webhookUrl = process.env.SLACK_WEBHOOK_URL;

        if (!webhookUrl) {
            console.warn("[SlackTool] SLACK_WEBHOOK_URL is not set in .env.local. Notification skipped.");
            return "Warning: Slack not configured. Add SLACK_WEBHOOK_URL to your environment variables.";
        }

        const { message, contactNumber, contactName } = args;

        const slackPayload = {
            blocks: [
                {
                    type: "header",
                    text: { type: "plain_text", text: "🚨 Converra Workflow Alert", emoji: true }
                },
                {
                    type: "section",
                    fields: [
                        { type: "mrkdwn", text: `*Message:*\n${message || "No message provided"}` },
                        { type: "mrkdwn", text: `*Contact:*\n${contactName || "Unknown"} (${contactNumber || "N/A"})` }
                    ]
                },
                {
                    type: "context",
                    elements: [{ type: "mrkdwn", text: `Triggered by *Converra* workflow for owner \`${ownerId}\` at ${new Date().toLocaleTimeString()}` }]
                }
            ]
        };

        try {
            const response = await fetch(webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(slackPayload),
            });

            if (!response.ok) {
                throw new Error(`Slack API returned status: ${response.status}`);
            }

            console.log(`[SlackTool] Notification sent successfully for owner: ${ownerId}`);
            return "Success: Slack notification delivered to your team channel.";
        } catch (err: any) {
            console.error("[SlackTool] Failed to send notification:", err.message);
            return `Failed: Could not send Slack notification. Error: ${err.message}`;
        }
    }
}
