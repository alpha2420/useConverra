import Conversation from "@backend/models/conversation.model";
import Lead from "@backend/models/lead.model";
import UnansweredQuestion from "@backend/models/unanswered-question.model";

export class AnalyticsService {
    /**
     * Aggregates all dashboard statistics for a given business owner.
     * Extracts complex MongoDB aggregation pipelines from the API routes for better maintainability.
     */
    static async getDashboardStats(ownerId: string) {
        const now = new Date();
        
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);

        const startOf7Days = new Date(now);
        startOf7Days.setDate(now.getDate() - 6);
        startOf7Days.setHours(0, 0, 0, 0);

        const startOf30Days = new Date(now);
        startOf30Days.setDate(now.getDate() - 29);
        startOf30Days.setHours(0, 0, 0, 0);

        // ── Run all aggregations in parallel ──────────────────────────────
        const [
            totalConversations,
            newToday,
            leadCounts,
            stageCounts,
            intentCounts,
            urgencyCounts,
            last7DaysRaw,
            topUnanswered,
            channelCounts,
            totalMessages,
            hotLeadsThisWeek,
            wonCount,
            hourlyRaw,
            csatCounts,
            responseTimeRaw,
            dailySolvedRaw,
        ] = await Promise.all([

            // Total conversations
            Conversation.countDocuments({ ownerId }),

            // New conversations today
            Conversation.countDocuments({ ownerId, createdAt: { $gte: startOfToday } }),

            // Lead score breakdown
            Lead.aggregate([
                { $match: { ownerId } },
                { $group: { _id: "$leadScore", count: { $sum: 1 } } },
            ]),

            // Stage breakdown
            Lead.aggregate([
                { $match: { ownerId } },
                { $group: { _id: "$stage", count: { $sum: 1 } } },
            ]),

            // Intent breakdown
            Conversation.aggregate([
                { $match: { ownerId } },
                { $group: { _id: "$intent", count: { $sum: 1 } } },
            ]),

            // Urgency breakdown
            Conversation.aggregate([
                { $match: { ownerId } },
                { $group: { _id: "$urgency", count: { $sum: 1 } } },
            ]),

            // Conversations per day — last 7 days
            Conversation.aggregate([
                { $match: { ownerId, createdAt: { $gte: startOf7Days } } },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { _id: 1 } },
            ]),

            // Top 5 unanswered questions
            UnansweredQuestion.find({ ownerId, status: "unanswered" })
                .sort({ createdAt: -1 })
                .limit(5)
                .select("question source createdAt")
                .lean(),

            // Channel breakdown (whatsapp vs widget) from unanswered
            Conversation.aggregate([
                { $match: { ownerId } },
                { $group: { _id: "$source", count: { $sum: 1 } } },
            ]),

            // Total messages sent (across all conversations)
            Conversation.aggregate([
                { $match: { ownerId } },
                { $project: { messageCount: { $size: "$messages" } } },
                { $group: { _id: null, total: { $sum: "$messageCount" } } },
            ]),

            // Hot leads this week
            Lead.countDocuments({
                ownerId,
                leadScore: "hot",
                lastContactAt: { $gte: startOf7Days },
            }),

            // Won deals
            Lead.countDocuments({ ownerId, stage: "won" }),

            // Hourly message engagement overall
            Conversation.aggregate([
                { $match: { ownerId } },
                { $unwind: "$messages" },
                {
                    $group: {
                        _id: { $hour: { date: "$messages.timestamp", timezone: "America/New_York" } },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { _id: 1 } },
            ]),

            // CSAT (Sentiment)
            Conversation.aggregate([
                { $match: { ownerId } },
                { $group: { _id: "$sentiment", count: { $sum: 1 } } },
            ]),

            // First Reply Time buckets
            Conversation.aggregate([
                { $match: { ownerId, firstReplyTime: { $ne: null } } },
                {
                    $project: {
                        bucket: {
                            $cond: [
                                { $lte: ["$firstReplyTime", 3600] }, "0-1h",
                                { $cond: [
                                    { $lte: ["$firstReplyTime", 28800] }, "1-8h",
                                    { $cond: [{ $lte: ["$firstReplyTime", 86400] }, "8-24h", ">24h"] }
                                ]}
                            ]
                        }
                    }
                },
                { $group: { _id: "$bucket", count: { $sum: 1 } } }
            ]),

            // Daily Solved (last 7 days)
            Lead.aggregate([
                { $match: { 
                    ownerId, 
                    stage: { $in: ["won", "lost"] },
                    updatedAt: { $gte: startOf7Days }
                }},
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$updatedAt" } },
                        count: { $sum: 1 },
                    },
                },
            ]),
        ]);

        // ── Helper to convert aggregate array to object ───────────────────
        const toMap = (arr: any[]) =>
            arr.reduce((acc, item) => { acc[item._id || "unknown"] = item.count; return acc; }, {} as Record<string, number>);

        // ── Build daily resolution data (last 7 days) ────────────────────
        const dailyResolution: { label: string; created: number; solved: number }[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            const key = d.toISOString().split("T")[0];
            const label = d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
            
            const cFound = last7DaysRaw.find((r: any) => r._id === key);
            const sFound = dailySolvedRaw.find((r: any) => r._id === key);
            
            dailyResolution.push({ 
                label, 
                created: cFound ? cFound.count : 0, 
                solved: sFound ? sFound.count : 0 
            });
        }

        const totalMsgs = (totalMessages[0]?.total) || 0;

        // format hourly data (0 to 23 hours)
        const hourlyData = Array.from({ length: 24 }).map((_, i) => {
            const found = hourlyRaw.find((r: any) => r._id === i);
            return { hour: i, count: found ? found.count : 0 };
        });

        return {
            overview: {
                totalConversations,
                newToday,
                totalMessages: totalMsgs,
                hotLeadsThisWeek,
                wonDeals: wonCount,
                avgMessagesPerConvo: totalConversations > 0 ? Math.round(totalMsgs / totalConversations) : 0,
            },
            leads: toMap(leadCounts),
            stages: toMap(stageCounts),
            intents: toMap(intentCounts),
            urgency: toMap(urgencyCounts),
            csat: toMap(csatCounts),
            responseTime: toMap(responseTimeRaw),
            channels: toMap(channelCounts),
            dailyResolution,
            last7Days: last7DaysRaw.map((r: any) => ({
                date: r._id,
                label: r._id, // Format this or use directly
                count: r.count
            })),
            hourlyData,
            topUnanswered,
        };
    }
}
