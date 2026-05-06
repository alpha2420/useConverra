// Worker script to manage WhatsApp connections independently of Next.js API Routes.
import { Client, RemoteAuth } from 'whatsapp-web.js';
import { MongoStore } from 'wwebjs-mongo';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from 'openai';
import connectDb from '../shared/lib/db';
import Settings from './models/settings.model';
import WhatsappStatus from './models/whatsapp-status.model';
import UnansweredQuestion from './models/unanswered-question.model';
import Conversation from './models/conversation.model';
import PendingMessage from './models/pending-message.model';
import { analyzeConversation } from './services/analyzeConversation';
import { buildMemoryContext } from './services/buildMemoryContext';
import { getCachedReply, setCachedReply } from './services/responseCache';
import { preprocessMessage } from './services/preprocessMessage';
import { reportProviderError, clearProviderError } from './services/providerError';

if (typeof global.fetch === 'undefined') {
    global.fetch = fetch as any;
}

const activeClients = new Map<string, Client>();
let store: any = null;

async function initWorker() {
    console.log("[Worker] Starting WhatsApp manager...");
    await connectDb();
    store = new MongoStore({ mongoose: mongoose });
    console.log("[Worker] MongoDB Connected & MongoStore initialized.");

    setInterval(pollUsers, 5000);
    setInterval(pollPendingMessages, 3000);
    pollUsers();
}

// ─── Poll for connect / disconnect requests ───────────────────────────────────
async function pollUsers() {
    try {
        const statusDocs = await WhatsappStatus.find({ disconnectRequested: { $ne: true } }).lean();
        for (const status of statusDocs) {
            const ownerId = String(status.ownerId);
            if (!activeClients.has(ownerId)) {
                startClient(ownerId);
            } else {
                await WhatsappStatus.findOneAndUpdate({ ownerId }, { lastPing: new Date() });
            }
        }

        const disconnectDocs = await WhatsappStatus.find({ disconnectRequested: true }).lean();
        for (const doc of disconnectDocs) {
            const ownerId = String(doc.ownerId);
            console.log(`[Worker] Disconnect requested for ${ownerId}`);
            if (activeClients.has(ownerId)) {
                const client = activeClients.get(ownerId)!;
                try { await client.logout(); } catch {}
                try { await client.destroy(); } catch {}
                activeClients.delete(ownerId);
            }
            try {
                const collectionName = 'whatsapp-RemoteAuth-' + ownerId;
                const collections = await mongoose.connection.db?.listCollections({ name: collectionName }).toArray();
                if (collections && collections.length > 0) {
                    await mongoose.connection.collection(collectionName).drop();
                }
            } catch (err) {
                console.error(`[Worker] Failed dropping RemoteAuth for ${ownerId}:`, err);
            }
            await WhatsappStatus.deleteOne({ ownerId });
            console.log(`[Worker] Disconnected ${ownerId}`);
        }
    } catch (error) {
        console.error("[Worker] Polling error:", error);
    }
}

// ─── Poll for outbound messages queued from the dashboard ────────────────────
async function pollPendingMessages() {
    try {
        const pending = await PendingMessage.find({ status: "pending" }).lean();
        for (const msg of pending) {
            const ownerId = String(msg.ownerId);
            const client = activeClients.get(ownerId);
            if (!client) continue;

            try {
                await client.sendMessage(msg.to, msg.text);
                await Conversation.findOneAndUpdate(
                    { ownerId, contactNumber: msg.to },
                    {
                        $push: { messages: { role: "owner", text: msg.text, timestamp: new Date() } },
                        $set: { lastMessageAt: new Date() },
                    },
                    { upsert: true }
                );
                await PendingMessage.findByIdAndUpdate(msg._id, { status: "sent" });
                console.log(`[Worker] Sent outbound to ${msg.to} for ${ownerId}`);
            } catch (err) {
                console.error(`[Worker] Failed sending to ${msg.to}:`, err);
                await PendingMessage.findByIdAndUpdate(msg._id, { status: "failed" });
            }
        }
    } catch (error) {
        console.error("[Worker] Pending message poll error:", error);
    }
}

// ─── Start a WhatsApp client for a given owner ───────────────────────────────
async function startClient(ownerId: string) {
    console.log(`[Worker] Initiating client for ${ownerId}`);

    const client = new Client({
        authStrategy: new RemoteAuth({
            clientId: ownerId,
            store: store,
            backupSyncIntervalMs: 300000,
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox', '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas',
                '--no-first-run', '--no-zygote', '--disable-gpu',
            ],
        },
    });

    activeClients.set(ownerId, client);

    client.on('qr', async (qr) => {
        console.log(`[Worker] QR generated for ${ownerId}`);
        await WhatsappStatus.findOneAndUpdate(
            { ownerId },
            { qrCode: qr, isReady: false },
            { upsert: true }
        );
    });

    client.on('ready', async () => {
        console.log(`[Worker] Client ready for ${ownerId}`);
        await WhatsappStatus.findOneAndUpdate(
            { ownerId },
            { qrCode: null, isReady: true },
            { upsert: true }
        );
    });

    client.on('remote_session_saved', () => {
        console.log(`[Worker] Session saved to MongoDB for ${ownerId}`);
    });

    client.on('disconnected', async (reason) => {
        console.log(`[Worker] Disconnected ${ownerId}: ${reason}`);
        activeClients.delete(ownerId);
        await WhatsappStatus.findOneAndUpdate(
            { ownerId },
            { isReady: false, qrCode: null }
        );
        try { await client.destroy(); } catch {}
    });

    // ─── Incoming message handler ─────────────────────────────────────────
    client.on('message', async (msg) => {
        try {
            if (msg.fromMe || msg.isStatus) return;
            const chat = await msg.getChat();
            if (chat.isGroup) return;

            // Guard: text only
            if (msg.type !== 'chat') {
                await msg.reply(
                    "Hi! I can't process voice notes or images right now. Please type your message so I can help you! 🙏"
                );
                return;
            }

            const contactNumber = msg.from;
            const contactName = chat.name || msg.from;

            // ── 1. Save incoming message ──────────────────────────────────
            await Conversation.findOneAndUpdate(
                { ownerId, contactNumber },
                {
                    $push: { messages: { role: "customer", text: msg.body, timestamp: new Date() } },
                    $set: { contactName, lastMessageAt: new Date() },
                    $setOnInsert: { ownerId, contactNumber },
                },
                { upsert: true, new: true }
            );

            // ── 2. Check if AI is paused ──────────────────────────────────
            const existingConvo = await Conversation.findOne({ ownerId, contactNumber });
            if (existingConvo?.isAiPaused) {
                console.log(`[Worker] AI paused for ${contactNumber}, skipping.`);
                return;
            }

            // ── 3. Fetch settings ─────────────────────────────────────────
            const setting = await Settings.findOne({ ownerId }).lean();
            if (!setting) return;

            // ── 4. Build Memory Context ───────────────────────────────────
            const bName = setting?.businessName || "us";
            const memoryContext = await buildMemoryContext(existingConvo, ownerId, bName);

            // ── 4b. Pre-process the raw customer message ──────────────────
            // Clean slang, emojis, filler words before sending to AI
            const cleanMessage = preprocessMessage(msg.body);
            console.log(`[Worker] Raw: "${msg.body}" → Clean: "${cleanMessage}"`);

            const mediaLinks = setting.mediaLinks || [];
            const MEDIA_LINKS_CONTEXT = mediaLinks.length > 0
                ? `\n\n--- MEDIA & PHOTO LINKS ---\n${mediaLinks.map((l: any) => `${l.name} -> ${l.url}`).join("\n")}\nIMPORTANT RULE: If a customer asks to see a photo, product, or link that matches an item above, you MUST include its exact URL naturally in your reply. Do not invent links.`
                : "";

            const overrideInfo = (setting.aiOverrides as any)?.length > 0
                ? `\n\n--- AI OVERRIDES (STRICT RULES) ---\nIf the user's intent or meaning matches any of these topics, YOU MUST output the exact corresponding response.\n${(setting.aiOverrides as any).map((o: any) => `Topic/Intent: "${o.topic}" -> Exact Response: "${o.response}"`).join("\n")}`
                : "";

            // Truncate knowledge to 800 chars max to avoid large context
            const knowledgeTrimmed = (setting.knowledge || "not provided").slice(0, 800);

            const faqsContext = (setting.faqs as any)?.length > 0 
                ? `\n\n--- FAQs (STRICT TRUTH) ---\n${(setting.faqs as any).map((f: any) => `Q: ${f.question}\nA: ${f.answer}`).join("\n")}`
                : "";

            const policiesContext = setting.policies 
                ? `\n\n--- POLICIES (STRICT TRUTH) ---\nRefund: ${(setting.policies as any).refund || "N/A"}\nCancellation: ${(setting.policies as any).cancellation || "N/A"}\nGeneral: ${(setting.policies as any).general || "N/A"}`
                : "";

            const KNOWLEDGE = `name:${setting.businessName || ""} | email:${setting.supportEmail || ""} | wa:${setting.whatsappNumber || ""} | info:${knowledgeTrimmed}${faqsContext}${policiesContext}${MEDIA_LINKS_CONTEXT}${overrideInfo}`;

            const AGENT_INSTRUCTIONS = setting.agentInstructions
                ? `\nSPECIAL INSTRUCTIONS FROM THE BUSINESS OWNER (follow strictly):\n${setting.agentInstructions}\n`
                : "";

            // ── 5. Check Response Cache (skip AI if this question was asked before) ──
            // Only use cache if the conversation is "fresh" (no prior messages in the last 15 mins)
            let isFreshConversation = true;
            if (existingConvo && existingConvo.messages && existingConvo.messages.length > 1) {
                // The last message is the one we just received, so we check the one before it
                const prevMsgTime = new Date(existingConvo.messages[existingConvo.messages.length - 2].timestamp).getTime();
                const now = new Date().getTime();
                if (now - prevMsgTime < 15 * 60 * 1000) { // 15 minutes
                    isFreshConversation = false;
                }
            }

            let cachedReply = null;
            if (isFreshConversation) {
                cachedReply = await getCachedReply(ownerId, cleanMessage);
            }
            
            if (cachedReply) {
                await msg.reply(cachedReply);
                // Still save the message to conversation history
                await Conversation.findOneAndUpdate(
                    { ownerId, contactNumber },
                    {
                        $push: { messages: { role: "bot", text: cachedReply, timestamp: new Date() } },
                        $set: { lastMessageAt: new Date() },
                    }
                );
                console.log(`[Worker] Cache hit for ${contactNumber} — no AI call made.`);
                return;
            }

            // ── 6. Build prompt and call AI ───────────────────────────────
            const prompt = `Act as a helpful human representative for ${bName}. 
NEVER mention that you are an AI. Be natural, concise, and professional.
Use the provided INFO to answer. If you cannot answer using ONLY the INFO, set "canAnswer": false.
Do NOT repeat greetings if you've already said hello. Avoid starting every message with "Hello [Name]".
Never call the customer by the business name "${bName}".
Output ONLY JSON: {"canAnswer": boolean, "reply": "string"}
${AGENT_INSTRUCTIONS}${memoryContext}
INFO: ${KNOWLEDGE}
Q: ${cleanMessage}`;

            let reply = "";
            let canAnswer = true;
            let aiSuccess = false;

            // ── 6. Try Gemini (Primary) ───────────────────────────────
            if (!aiSuccess && process.env.GEMINI_API_KEY) {
                try {
                    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                    const model = genAI.getGenerativeModel({ 
                        model: "gemini-1.5-flash",
                        generationConfig: { maxOutputTokens: 120, temperature: 0.7, responseMimeType: "application/json" }
                    });

                    const geminiRes = await model.generateContent(prompt);
                    const responseText = geminiRes.response.text();
                    
                    if (responseText) {
                        let cleaned = responseText.trim();
                        if (cleaned.startsWith("```")) {
                            cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "").trim();
                        }
                        const parsed = JSON.parse(cleaned);
                        canAnswer = parsed.canAnswer !== false;
                        reply = parsed.reply || "";
                        
                        // Human-like proactive fallback
                        if (!canAnswer || !reply || reply.includes('{"')) {
                            reply = `I'll connect you with our team shortly. Someone will respond within a few minutes! 🙏`;
                            canAnswer = false;
                        }

                        console.log(`[Worker] Gemini success (Primary)`);
                        aiSuccess = true;
                        await clearProviderError(ownerId, 'gemini');
                    }
                } catch (e: any) { 
                    console.error(`[Worker] Gemini failed:`, e); 
                    await reportProviderError(ownerId, 'gemini', e);
                }
            }

            // ── 7. Try OpenAI (Fallback 1) ─────────────────────────────
            const openaiKey = process.env.OPENAI_API_KEY;
            if (!aiSuccess && openaiKey && openaiKey !== "your_openai_api_key_here") {
                try {
                    const openai = new OpenAI({ apiKey: openaiKey });
                    const completion = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [{ role: 'user', content: prompt }],
                        response_format: { type: 'json_object' },
                        max_tokens: 120,
                        temperature: 0.7,
                    });
                    const content = completion.choices[0].message.content;
                    if (content) {
                        const parsed = JSON.parse(content);
                        canAnswer = parsed.canAnswer !== false;
                        reply = parsed.reply || "";

                        // Proactive Fallback
                        if (!canAnswer || !reply || reply.includes('{"')) {
                            reply = `I'll connect you with our team shortly. Someone will respond within a few minutes! 🙏`;
                            canAnswer = false;
                        }

                        aiSuccess = true;
                        console.log(`[Worker] OpenAI success (Fallback)`);
                        await clearProviderError(ownerId, 'openai');
                    }
                } catch (e: any) { 
                    console.error(`[Worker] OpenAI failed:`, e); 
                    await reportProviderError(ownerId, 'openai', e);
                }
            }

            // ── 8. Try Grok (Fallback 2) ────────────────────────────
            const grokKey = process.env.GROK_API_KEY;
            if (!aiSuccess && grokKey) {
                try {
                    const grok = new OpenAI({ apiKey: grokKey, baseURL: "https://api.x.ai/v1" });
                    const completion = await grok.chat.completions.create({
                        model: "grok-2-mini",
                        messages: [{ role: 'user', content: prompt }],
                        response_format: { type: 'json_object' },
                        max_tokens: 120,
                        temperature: 0.7,
                    });
                    const content = completion.choices[0].message.content;
                    if (content) {
                        const parsed = JSON.parse(content);
                        canAnswer = parsed.canAnswer !== false;
                        reply = parsed.reply || "";

                        // Proactive Fallback
                        if (!canAnswer || !reply || reply.includes('{"')) {
                            reply = `I'll connect you with our team shortly. Someone will respond within a few minutes! 🙏`;
                            canAnswer = false;
                        }

                        aiSuccess = true;
                        console.log(`[Worker] Grok success (Fallback)`);
                        await clearProviderError(ownerId, 'grok');
                    }
                } catch (e: any) { 
                    console.error(`[Worker] Grok failed:`, e); 
                    await reportProviderError(ownerId, 'grok', e);
                }
            }

            // ── 9. Try Groq (Fallback 3) ────────────────────────────
            const groqKey = process.env.GROQ_API_KEY;
            if (!aiSuccess && groqKey) {
                try {
                    const groq = new OpenAI({ apiKey: groqKey, baseURL: "https://api.groq.com/openai/v1" });
                    const completion = await groq.chat.completions.create({
                        model: "llama-3.3-70b-versatile",
                        messages: [{ role: 'user', content: prompt }],
                        response_format: { type: 'json_object' },
                        max_tokens: 120,
                        temperature: 0.7,
                    });
                    const content = completion.choices[0].message.content;
                    if (content) {
                        const parsed = JSON.parse(content);
                        canAnswer = parsed.canAnswer !== false;
                        reply = parsed.reply || "";

                        // Proactive Fallback
                        if (!canAnswer || !reply || reply.includes('{"')) {
                            reply = `I'll connect you with our team shortly. Someone will respond within a few minutes! 🙏`;
                            canAnswer = false;
                        }

                        aiSuccess = true;
                        console.log(`[Worker] Groq success (Fallback)`);
                        await clearProviderError(ownerId, 'groq');
                    }
                } catch (e: any) { 
                    console.error(`[Worker] Groq failed:`, e); 
                    await reportProviderError(ownerId, 'groq', e);
                }
            }

            if (!aiSuccess) {
                await msg.reply("Hi! I'm having a bit of trouble connecting to our system right now. Please try again in a moment! 🙏");
                return;
            }

            if (!canAnswer) {
                await UnansweredQuestion.create({
                    ownerId, 
                    question: msg.body, 
                    contactNumber: msg.from,
                    source: "whatsapp", 
                    status: "unanswered",
                }).catch(() => {});
            }

            if (reply) {
                await msg.reply(reply);
                // Save to cache so future identical questions skip AI entirely
                if (canAnswer) {
                    setCachedReply(ownerId, msg.body, reply).catch(() => {});
                }
            }

            // ── 6. Save bot reply ─────────────────────────────────────────
            const updatedConvo = await Conversation.findOneAndUpdate(
                { ownerId, contactNumber },
                {
                    $push: { messages: { role: "bot", text: reply, timestamp: new Date() } },
                    $set: { lastMessageAt: new Date() },
                },
                { new: true }
            );

            // ── 7. Run analysis async (intent, lead score, next action, enriched) ──
            const msgCount = updatedConvo?.messages?.length || 0;
            if (updatedConvo && (msgCount <= 1 || msgCount % 5 === 0)) {
                analyzeConversation(updatedConvo.messages)
                    .then(async (analysis) => {
                        if (!analysis) return;
                        await Conversation.findByIdAndUpdate(updatedConvo._id, {
                            $set: {
                                intent: analysis.intent,
                                urgency: analysis.urgency,
                                leadScore: analysis.leadScore,
                                extractedName: analysis.extractedName,
                                extractedBudget: analysis.extractedBudget,
                                summary: analysis.summary,
                                nextBestAction: analysis.nextBestAction,
                                nextBestActionType: analysis.nextBestActionType,
                                "enriched.company": analysis.enriched.company,
                                "enriched.location": analysis.enriched.location,
                                "enriched.email": analysis.enriched.email,
                                "enriched.language": analysis.enriched.language,
                                lastAnalyzedAt: new Date(),
                            },
                        });
                        console.log(`[Worker] Analysis + memory done for ${contactNumber}`);
                    })
                    .catch((e) => console.error("[Worker] Analysis failed:", e));
            }

        } catch (error) {
            console.error(`[Worker] Message error for ${ownerId}:`, error);
        }
    });

    try {
        await client.initialize();
    } catch (err) {
        console.error(`[Worker] Init failed for ${ownerId}:`, err);
        activeClients.delete(ownerId);
        try { await client.destroy(); } catch {}
    }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
const cleanup = async () => {
    console.log("[Worker] Shutting down...");
    for (const client of activeClients.values()) {
        try { await client.destroy(); } catch {}
    }
    process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('unhandledRejection', (reason) => console.error('Unhandled Rejection:', reason));
process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));

initWorker().catch(e => console.error("Worker failed to start:", e));
