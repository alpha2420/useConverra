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
import PendingMessage from './models/pending-message.model';
import { analyzeConversation } from './services/analyzeConversation';
import { ChatRepository } from './repositories/ChatRepository';
import Conversation from './models/conversation.model'; // Kept for manual pruning

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
                await ChatRepository.saveMessage(ownerId, msg.to, "owner", msg.text);
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

            const contactNumber = msg.from;
            const contactName = chat.name || msg.from;

            // ── Check for Custom Converra Workflows BEFORE Chatbot ──
            let eventType = 'WHATSAPP_MESSAGE';
            if (msg.type === 'image' || msg.hasMedia) eventType = 'IMAGE_UPLOAD';
            else if (msg.type === 'ptt' || msg.type === 'audio') eventType = 'VOICE_NOTE';
            else if (msg.type === 'document') eventType = 'PDF_UPLOAD';

            const { Workflow } = await import('./models/workflow.model');
            const activeWorkflows = await Workflow.find({ ownerId, triggerEvent: eventType, isActive: true }).lean();

            if (activeWorkflows && activeWorkflows.length > 0) {
                console.log(`[Worker] Found ${activeWorkflows.length} workflows for event ${eventType} for owner ${ownerId}`);
                const { WorkflowEngine } = await import('./engine/WorkflowEngine');
                
                for (const wf of activeWorkflows) {
                    // Pass the raw message data into the trigger context
                    await WorkflowEngine.trigger(wf._id.toString(), {
                        ownerId,
                        contactNumber,
                        contactName,
                        messageBody: msg.body,
                        type: msg.type,
                    });
                }

                // We stop processing here because custom workflows take full precedence.
                return;
            }

            // Guard: text only for standard chatbot pipeline
            if (msg.type !== 'chat') {
                await msg.reply(
                    "Hi! I can't process voice notes or images right now. Please type your message so I can help you! 🙏"
                );
                return;
            }

            // ── 1. Ensure Lead & Convo exist, and save incoming message ──
            const { conversation } = await ChatRepository.getOrCreateChat(ownerId, contactNumber, contactName);
            
            // ── 2. Check if AI is paused ──────────────────────────────────
            if (conversation.isAiPaused) {
                console.log(`[Worker] AI paused for ${contactNumber}, skipping.`);
                return;
            }

            await ChatRepository.saveMessage(ownerId, contactNumber, "customer", msg.body);

            // ── 3. Fetch settings ─────────────────────────────────────────
            const setting = await Settings.findOne({ ownerId }).lean();
            if (!setting) return;

            // ── 4. Execute Chat Pipeline (Refactored to use modular Service) ─────────────
            const { ChatPipelineService } = await import('./services/ChatPipelineService');
            
            console.log(`[Worker] Executing pipeline for ${contactNumber}`);
            
            // We need to fetch recent history
            const history = await ChatRepository.getRecentHistory(ownerId, contactNumber, 20);
            
            const reply = await ChatPipelineService.executeChat(
                ownerId,
                msg.body, 
                history, 
                setting
            );

            if (!reply || typeof reply !== "string") {
                await msg.reply("Hi! I'm having a bit of trouble connecting right now. Please try again in a moment! 🙏");
                return;
            }

            // Send reply to WhatsApp
            await msg.reply(reply);

            // ── 5. Save bot reply and manage memory ───────────────────────────
            const updatedConvo = await ChatRepository.saveMessage(ownerId, contactNumber, "bot", reply);


            // ── Memory Pruning: trim to last 50 messages if conversation exceeds 100 ──
            // Prevents unbounded MongoDB growth while keeping enough context for the AI
            if (updatedConvo && (updatedConvo.messages?.length || 0) > 100) {
                await Conversation.findByIdAndUpdate(updatedConvo._id, {
                    $push: { messages: { $each: [], $slice: -50 } }
                });
                console.log(`[Worker] Pruned conversation for ${contactNumber} to last 50 messages.`);
            }

            // ── 7. Run analysis async (intent, lead score, next action, enriched) ──
            const msgCount = updatedConvo?.messages?.length || 0;
            if (updatedConvo && (msgCount <= 1 || msgCount % 5 === 0)) {
                analyzeConversation(updatedConvo.messages)
                    .then(async (analysis) => {
                        if (!analysis) return;
                        
                        await ChatRepository.updateConversationAnalysis(ownerId, contactNumber, {
                            intent: analysis.intent as any,
                            urgency: analysis.urgency as any,
                            summary: analysis.summary,
                            nextBestAction: analysis.nextBestAction,
                            nextBestActionType: analysis.nextBestActionType as any,
                            lastAnalyzedAt: new Date(),
                        });

                        const leadUpdates: any = {
                            leadScore: analysis.leadScore as any,
                            extractedBudget: analysis.extractedBudget || null,
                            enriched: analysis.enriched as any
                        };
                        if (analysis.extractedName) leadUpdates.contactName = analysis.extractedName;

                        await ChatRepository.updateLead(ownerId, contactNumber, leadUpdates);

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
