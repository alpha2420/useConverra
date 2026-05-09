import { NextRequest, NextResponse } from "next/server";
import connectDb from "@shared/lib/db";
import User from "@backend/models/user.model";
import UsageLog from "@backend/models/usage-log.model";
import Conversation from "@backend/models/conversation.model";
import UnansweredQuestion from "@backend/models/unanswered-question.model";
import { getSession } from "@shared/lib/getSession";

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

        await connectDb();
        const admin = await User.findById(session.user.id);
        
        // SECURE: Only allow Super Admins
        if (!admin || !admin.isSuperAdmin) {
            return NextResponse.json({ message: "Forbidden: Super Admin only" }, { status: 403 });
        }

        // 1. Global Overview
        const totalBusinesses = await User.countDocuments({ role: "owner" });
        const totalConversations = await Conversation.countDocuments();
        
        const msgAggregation = await Conversation.aggregate([
            { $project: { msgCount: { $size: "$messages" } } },
            { $group: { _id: null, total: { $sum: "$msgCount" } } }
        ]);
        const totalMessages = msgAggregation[0]?.total || 0;

        const tokenAggregation = await UsageLog.aggregate([
            { $group: { _id: null, total: { $sum: "$totalTokens" } } }
        ]);
        const totalTokens = tokenAggregation[0]?.total || 0;

        // 2. Usage Trends (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const usageTrends = await UsageLog.aggregate([
            { $match: { timestamp: { $gte: thirtyDaysAgo } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
                    requests: { $sum: 1 },
                    tokens: { $sum: "$totalTokens" }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        // 3. Model Distribution
        const modelDistribution = await UsageLog.aggregate([
            {
                $group: {
                    _id: "$model",
                    requests: { $sum: 1 }
                }
            },
            { $sort: { requests: -1 } }
        ]);

        // 4. Intent Breakdown
        const intentBreakdown = await Conversation.aggregate([
            {
                $group: {
                    _id: "$intent",
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);

        // 5. Business Leaderboard
        const leaderboardRaw = await Conversation.aggregate([
            {
                $group: {
                    _id: "$ownerId",
                    conversationCount: { $sum: 1 },
                    hotLeads: { $sum: { $cond: [{ $eq: ["$leadScore", "hot"] }, 1, 0] } }
                }
            },
            { $sort: { conversationCount: -1 } },
            { $limit: 10 }
        ]);

        const ownerIds = leaderboardRaw.map(b => b._id);
        const owners = await User.find({ _id: { $in: ownerIds } }, 'email name').lean();
        const ownerMap = owners.reduce((acc: any, curr) => ({...acc, [curr._id.toString()]: curr}), {});
        
        const businessLeaderboard = leaderboardRaw.map(b => ({
            _id: b._id,
            conversationCount: b.conversationCount,
            hotLeads: b.hotLeads,
            ownerName: ownerMap[b._id]?.name || 'Unknown',
            ownerEmail: ownerMap[b._id]?.email || 'Unknown'
        }));

        // 6. Recent Hot Leads
        const recentHotLeads = await Conversation.find({ leadScore: "hot" })
            .sort({ lastAnalyzedAt: -1, updatedAt: -1 })
            .limit(5)
            .select('contactNumber intent summary extractedName extractedBudget enriched updatedAt ownerId')
            .lean();
            
        // Map owners to recent hot leads
        const leadOwnerIds = recentHotLeads.map(l => l.ownerId);
        const leadOwners = await User.find({ _id: { $in: leadOwnerIds } }, 'name').lean();
        const leadOwnerMap = leadOwners.reduce((acc: any, curr) => ({...acc, [curr._id.toString()]: curr.name}), {});
        
        const enrichedRecentHotLeads = recentHotLeads.map(lead => ({
            ...lead,
            ownerName: leadOwnerMap[lead.ownerId] || 'Unknown'
        }));

        // 7. Retention Metrics
        const activeBusinesses = await UsageLog.distinct("ownerId", { timestamp: { $gte: thirtyDaysAgo } });
        const businessRetentionRate = totalBusinesses > 0 ? Math.round((activeBusinesses.length / totalBusinesses) * 100) : 0;

        const totalUniqueContacts = await Conversation.distinct("contactNumber").then(res => res.length);
        const returningContactsAgg = await Conversation.aggregate([
            { $group: { _id: "$contactNumber", count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } }
        ]);
        const endUserReturnRate = totalUniqueContacts > 0 ? Math.round((returningContactsAgg.length / totalUniqueContacts) * 100) : 0;

        const retentionMetrics = {
            businessRetentionRate,
            activeBusinessesCount: activeBusinesses.length,
            endUserReturnRate,
            returningEndUsersCount: returningContactsAgg.length,
            totalUniqueContacts
        };

        // 8. Product Iteration Recommendations
        const productRecommendations = [];
        
        const complaintIntent = intentBreakdown.find(i => i._id === 'complaint');
        const inquiryIntent = intentBreakdown.find(i => i._id === 'inquiry');
        
        if (complaintIntent && totalConversations > 0 && complaintIntent.count > (totalConversations * 0.1)) {
            productRecommendations.push({
                type: "critical",
                title: "High Complaint Volume Detected",
                description: `Over 10% (${complaintIntent.count}) of global conversations are complaints. Recommend auditing the recent hot leads to identify common fail points in customer service.`,
                action: "View Leads"
            });
        }
        
        if (inquiryIntent && totalConversations > 0 && inquiryIntent.count > (totalConversations * 0.4)) {
            productRecommendations.push({
                type: "warning",
                title: "High Inquiry Volume",
                description: "A large portion of conversations are simple inquiries. We recommend encouraging businesses to add structured pricing and FAQs to their AI Knowledge Base to automate these.",
                action: "Review FAQs"
            });
        }

        const topUnanswered = await UnansweredQuestion.aggregate([
            { $match: { status: "unanswered" } },
            { $group: { _id: "$category", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 3 }
        ]);

        if (topUnanswered.length > 0) {
            const topCategory = topUnanswered[0];
            if (topCategory._id && topCategory._id !== 'unknown' && topCategory.count > 5) {
                productRecommendations.push({
                    type: "insight",
                    title: `Knowledge Gap: ${topCategory._id.charAt(0).toUpperCase() + topCategory._id.slice(1)}`,
                    description: `Users frequently ask about '${topCategory._id}' but the AI lacks information. Recommend notifying business owners to update this category.`,
                    action: "Notify Owners"
                });
            }
        }

        if (productRecommendations.length === 0) {
             productRecommendations.push({
                 type: "success",
                 title: "Platform Healthy",
                 description: "Usage metrics and intent volumes look stable. No critical product iterations recommended at this time.",
                 action: "View Analytics"
             });
        }

        return NextResponse.json({
            globalOverview: {
                totalBusinesses,
                totalConversations,
                totalMessages,
                totalTokens
            },
            usageTrends,
            modelDistribution,
            intentBreakdown,
            businessLeaderboard,
            recentHotLeads: enrichedRecentHotLeads,
            retentionMetrics,
            productRecommendations
        });
    } catch (error) {
        console.error("[Admin Analytics]", error);
        return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
    }
}
