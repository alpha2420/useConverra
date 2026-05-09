"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { 
    Users, 
    MessageSquare, 
    Activity, 
    Zap,
    ShieldCheck,
    ChevronLeft,
    TrendingUp,
    BarChart,
    Lightbulb,
    AlertTriangle,
    AlertCircle,
    CheckCircle,
    Target
} from "lucide-react";
import { motion } from "framer-motion";
import { 
    AreaChart, 
    Area, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    BarChart as RechartsBarChart,
    Bar
} from 'recharts';

interface AnalyticsData {
    globalOverview: {
        totalBusinesses: number;
        totalConversations: number;
        totalMessages: number;
        totalTokens: number;
    };
    usageTrends: Array<{
        _id: string;
        requests: number;
        tokens: number;
    }>;
    modelDistribution: Array<{
        _id: string;
        requests: number;
    }>;
    intentBreakdown: Array<{
        _id: string;
        count: number;
    }>;
    businessLeaderboard: Array<{
        _id: string;
        ownerName: string;
        ownerEmail: string;
        conversationCount: number;
        hotLeads: number;
    }>;
    recentHotLeads: Array<{
        _id: string;
        contactNumber: string;
        intent: string;
        summary: string;
        extractedName: string;
        extractedBudget: string;
        updatedAt: string;
        ownerName: string;
    }>;
    retentionMetrics: {
        businessRetentionRate: number;
        activeBusinessesCount: number;
        endUserReturnRate: number;
        returningEndUsersCount: number;
        totalUniqueContacts: number;
    };
    productRecommendations: Array<{
        type: "critical" | "warning" | "insight" | "success";
        title: string;
        description: string;
        action: string;
    }>;
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#3b82f6'];

export default function SuperAdminAnalytics() {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const router = useRouter();

    useEffect(() => {
        fetchAnalytics();
    }, []);

    async function fetchAnalytics() {
        try {
            const res = await fetch("/api/admin/analytics");
            if (res.status === 403) {
                setError("You do not have Super Admin privileges.");
                return;
            }
            if (!res.ok) throw new Error("Failed to fetch");
            
            const json = await res.json();
            setData(json);
        } catch (e) {
            setError("Failed to load analytics data.");
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6">
                    <ShieldCheck className="w-10 h-10 text-red-500" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
                <p className="text-zinc-400 mb-8 max-w-md">{error}</p>
                <button onClick={() => router.push("/admin-portal")} className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-all">
                    Back to Admin Portal
                </button>
            </div>
        );
    }

    // Format data for charts
    const trendData = data.usageTrends.map(item => ({
        date: item._id,
        messages: item.requests,
        tokens: item.tokens
    }));

    const intentData = data.intentBreakdown.map(item => ({
        name: item._id === "unknown" ? "Other" : item._id.charAt(0).toUpperCase() + item._id.slice(1),
        value: item.count
    }));

    const leaderboardChartData = data.businessLeaderboard.slice(0, 5).map(item => ({
        name: item.ownerName.split(' ')[0], // First name only
        conversations: item.conversationCount,
        leads: item.hotLeads
    }));

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 md:p-10">
            {/* Header */}
            <div className="max-w-7xl mx-auto mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <button 
                        onClick={() => router.push("/admin-portal")}
                        className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-4 text-sm font-medium"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Back to Portal
                    </button>
                    <div className="flex items-center gap-2 text-indigo-400 font-bold tracking-widest text-xs uppercase mb-2">
                        <BarChart className="w-4 h-4" />
                        Global Analytics
                    </div>
                    <h1 className="text-4xl font-extrabold text-white tracking-tight">Platform Intelligence</h1>
                </div>
                <div className="flex items-center gap-4">
                    <div className="px-4 py-2 bg-emerald-500/10 text-emerald-400 rounded-lg text-sm font-bold flex items-center gap-2">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        Live Data
                    </div>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                {[
                    { label: "Active Businesses", value: data.globalOverview.totalBusinesses, icon: Users, color: "text-blue-400", bg: "bg-blue-400/10" },
                    { label: "Total Conversations", value: data.globalOverview.totalConversations.toLocaleString(), icon: MessageSquare, color: "text-purple-400", bg: "bg-purple-400/10" },
                    { label: "Messages Processed", value: data.globalOverview.totalMessages.toLocaleString(), icon: Activity, color: "text-emerald-400", bg: "bg-emerald-400/10" },
                    { label: "Tokens Consumed", value: `${(data.globalOverview.totalTokens / 1000000).toFixed(1)}M`, icon: Zap, color: "text-orange-400", bg: "bg-orange-400/10" },
                ].map((stat, i) => (
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        key={stat.label} 
                        className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl hover:border-zinc-700 transition-all"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className={`p-3 rounded-xl ${stat.bg}`}>
                                <stat.icon className={`w-6 h-6 ${stat.color}`} />
                            </div>
                        </div>
                        <div className="text-3xl font-bold text-white">{stat.value}</div>
                        <div className="text-zinc-500 text-sm mt-1">{stat.label}</div>
                    </motion.div>
                ))}
            </div>

            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                {/* Main Trend Chart */}
                <div className="lg:col-span-2 bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 shadow-xl">
                    <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-indigo-400" />
                        Message Volume (30 Days)
                    </h3>
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trendData}>
                                <defs>
                                    <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                <XAxis dataKey="date" stroke="#71717a" fontSize={12} tickMargin={10} minTickGap={30} />
                                <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v} />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '12px' }}
                                    itemStyle={{ color: '#e4e4e7' }}
                                />
                                <Area type="monotone" dataKey="messages" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorMessages)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Intent Distribution */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 shadow-xl flex flex-col">
                    <h3 className="text-xl font-bold text-white mb-2">Global Intent</h3>
                    <p className="text-sm text-zinc-400 mb-6">What customers are asking</p>
                    <div className="flex-1 min-h-[250px] relative flex items-center justify-center">
                        {intentData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={intentData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {intentData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="text-zinc-500">No intent data yet</div>
                        )}
                        {/* Custom Legend */}
                        <div className="absolute -bottom-4 w-full flex flex-wrap justify-center gap-3">
                            {intentData.map((entry, index) => (
                                <div key={entry.name} className="flex items-center gap-2 text-xs text-zinc-300">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                    {entry.name}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Retention & Recommendations */}
            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                {/* Retention Metrics */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 shadow-xl flex flex-col">
                    <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                        <Target className="w-5 h-5 text-emerald-400" />
                        Platform Retention
                    </h3>
                    <p className="text-sm text-zinc-400 mb-6">Active businesses & returning users</p>
                    
                    <div className="space-y-6 flex-1 flex flex-col justify-center">
                        <div>
                            <div className="flex justify-between items-end mb-2">
                                <div className="text-sm font-bold text-zinc-300">30-Day Active Businesses</div>
                                <div className="text-2xl font-bold text-white">{data.retentionMetrics.businessRetentionRate}%</div>
                            </div>
                            <div className="w-full bg-zinc-800 rounded-full h-3 mb-1 overflow-hidden">
                                <div className="bg-emerald-500 h-full rounded-full transition-all duration-1000 relative" style={{ width: `${data.retentionMetrics.businessRetentionRate}%` }}>
                                    <div className="absolute top-0 right-0 bottom-0 left-0 bg-gradient-to-r from-transparent to-white/20"></div>
                                </div>
                            </div>
                            <div className="text-xs text-zinc-500 font-medium text-right">
                                {data.retentionMetrics.activeBusinessesCount} / {data.globalOverview.totalBusinesses} Active
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between items-end mb-2">
                                <div className="text-sm font-bold text-zinc-300">Returning End-Users</div>
                                <div className="text-2xl font-bold text-white">{data.retentionMetrics.endUserReturnRate}%</div>
                            </div>
                            <div className="w-full bg-zinc-800 rounded-full h-3 mb-1 overflow-hidden">
                                <div className="bg-blue-500 h-full rounded-full transition-all duration-1000 relative" style={{ width: `${data.retentionMetrics.endUserReturnRate}%` }}>
                                    <div className="absolute top-0 right-0 bottom-0 left-0 bg-gradient-to-r from-transparent to-white/20"></div>
                                </div>
                            </div>
                            <div className="text-xs text-zinc-500 font-medium text-right">
                                {data.retentionMetrics.returningEndUsersCount} / {data.retentionMetrics.totalUniqueContacts} Returning
                            </div>
                        </div>
                    </div>
                </div>

                {/* Product Iteration Recommendations */}
                <div className="lg:col-span-2 bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 shadow-xl">
                    <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                        <Lightbulb className="w-5 h-5 text-amber-400" />
                        Product Iteration Insights
                    </h3>
                    <p className="text-sm text-zinc-400 mb-6">AI-generated recommendations based on global user behavior</p>
                    
                    <div className="space-y-4 max-h-[280px] overflow-y-auto pr-2 custom-scrollbar">
                        {data.productRecommendations.map((rec, i) => {
                            const icons = {
                                critical: <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />,
                                warning: <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />,
                                insight: <Lightbulb className="w-5 h-5 text-indigo-400 mt-0.5 flex-shrink-0" />,
                                success: <CheckCircle className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                            };
                            const borders = {
                                critical: "border-red-500/30 bg-red-500/5",
                                warning: "border-amber-500/30 bg-amber-500/5",
                                insight: "border-indigo-500/30 bg-indigo-500/5",
                                success: "border-emerald-500/30 bg-emerald-500/5"
                            };
                            return (
                                <div key={i} className={`p-4 rounded-2xl border ${borders[rec.type]} flex gap-4 items-start transition-all hover:-translate-y-0.5`}>
                                    {icons[rec.type]}
                                    <div className="flex-1">
                                        <h4 className="text-white font-bold mb-1">{rec.title}</h4>
                                        <p className="text-sm text-zinc-300 leading-relaxed mb-3">{rec.description}</p>
                                        <button className="text-xs font-bold px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white transition-colors border border-zinc-700">
                                            {rec.action}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Leaderboard Table */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 shadow-xl">
                    <h3 className="text-xl font-bold text-white mb-6">Top Performing Businesses</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-zinc-500 text-xs uppercase tracking-widest border-b border-zinc-800">
                                    <th className="pb-4 font-medium">Business</th>
                                    <th className="pb-4 font-medium text-right">Chats</th>
                                    <th className="pb-4 font-medium text-right text-orange-400">Hot Leads</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800">
                                {data.businessLeaderboard.map((biz) => (
                                    <tr key={biz._id} className="hover:bg-zinc-800/30 transition-colors">
                                        <td className="py-4">
                                            <div className="font-semibold text-white">{biz.ownerName}</div>
                                            <div className="text-xs text-zinc-500">{biz.ownerEmail}</div>
                                        </td>
                                        <td className="py-4 text-right text-zinc-300">
                                            {biz.conversationCount.toLocaleString()}
                                        </td>
                                        <td className="py-4 text-right">
                                            <span className="inline-flex items-center justify-center px-2.5 py-1 bg-orange-500/10 text-orange-500 text-xs font-bold rounded-full">
                                                🔥 {biz.hotLeads}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {data.businessLeaderboard.length === 0 && (
                                    <tr>
                                        <td colSpan={3} className="py-8 text-center text-zinc-500">No active businesses found</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Global Lead Feed */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 shadow-xl">
                    <h3 className="text-xl font-bold text-white mb-2">Live Lead Feed</h3>
                    <p className="text-sm text-zinc-400 mb-6">Recent hot leads captured globally</p>
                    <div className="space-y-4">
                        {data.recentHotLeads.map((lead) => (
                            <div key={lead._id} className="p-4 bg-zinc-950 border border-zinc-800 rounded-2xl relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-1 h-full bg-orange-500" />
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <span className="text-sm font-bold text-white mr-2">{lead.extractedName || 'Unknown Lead'}</span>
                                        <span className="text-xs text-zinc-500">via {lead.ownerName}</span>
                                    </div>
                                    <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-1 rounded-md">
                                        {new Date(lead.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                <p className="text-sm text-zinc-300 line-clamp-2">{lead.summary}</p>
                                {lead.extractedBudget && (
                                    <div className="mt-3 text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded inline-block">
                                        Budget: {lead.extractedBudget}
                                    </div>
                                )}
                            </div>
                        ))}
                        {data.recentHotLeads.length === 0 && (
                            <div className="text-center text-zinc-500 py-8 border border-dashed border-zinc-800 rounded-2xl">
                                No hot leads detected recently.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
