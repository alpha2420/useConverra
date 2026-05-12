/**
 * AI Integration Test Runner
 * ===========================
 * Fires 20 production-grade test cases directly at ChatPipelineService.
 * Reports latency, pass/fail, and flags any safety violations.
 *
 * Run with: npm run test:ai
 */

import mongoose from "mongoose";
import testCases from "./testCases.json";
import { ChatPipelineService } from "../backend/services/ChatPipelineService";

// ── Mongoose Model Imports (required for registration) ──
import "../backend/models/settings.model";
import "../backend/models/user.model";
import "../backend/models/knowledge.model";
import "../backend/models/location.model";
import "../backend/models/unanswered-question.model";
import "../backend/models/cached-response.model";
import Settings from "../backend/models/settings.model";
import User from "../backend/models/user.model";

// ── Console Color Helpers ──
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

const pass = (s: string) => `${GREEN}${BOLD}✅ PASS${RESET} ${s}`;
const fail = (s: string) => `${RED}${BOLD}❌ FAIL${RESET} ${s}`;
const warn = (s: string) => `${YELLOW}${BOLD}⚠️  WARN${RESET} ${s}`;
const info = (s: string) => `${CYAN}${s}${RESET}`;

// ── Test Result Types ──
interface TestResult {
  id: string;
  category: string;
  message: string;
  status: "PASS" | "FAIL" | "WARN";
  latencyMs: number;
  reply: string;
  issues: string[];
}

// ── Main Test Runner ──
async function runTests() {
  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════════╗`);
  console.log(`║         🤖  AI INTEGRATION TEST SUITE                   ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝${RESET}\n`);

  // Connect to DB
  const mongoUri = process.env.MONGODB_URL;
  if (!mongoUri) {
    console.error(`${RED}❌ MONGODB_URI not found in .env.local. Aborting.${RESET}`);
    process.exit(1);
  }

  console.log(info("🔌 Connecting to MongoDB..."));
  await mongoose.connect(mongoUri);
  console.log(`${GREEN}✔ Connected to MongoDB${RESET}\n`);

  // Grab first available user + settings from DB
  const user = await User.findOne({}).lean();
  const setting = user ? await Settings.findOne({ ownerId: user._id.toString() }).lean() : null;

  if (!user || !setting) {
    console.error(`${RED}❌ No User or Settings found in the database. Please onboard at least one business first.${RESET}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const ownerId = user._id.toString();
  console.log(`${GREEN}✔ Test subject found:${RESET} ${BOLD}${(setting as any).businessName || "Unknown Business"}${RESET} (ownerId: ${DIM}${ownerId}${RESET})\n`);
  console.log(`${DIM}────────────────────────────────────────────────────────────${RESET}\n`);

  const results: TestResult[] = [];

  // ── Run Each Test Case ──
  for (const tc of testCases) {
    process.stdout.write(`${DIM}[${tc.id}]${RESET} ${BOLD}${tc.category}${RESET}: "${tc.message.slice(0, 60)}${tc.message.length > 60 ? "..." : ""}"\n`);
    
    const issues: string[] = [];
    const startTime = Date.now();
    let reply = "";

    try {
      const rawResult = await ChatPipelineService.executeChat(
        ownerId,
        tc.message,
        [], // empty history
        setting
      );

      reply = typeof rawResult === "string" ? rawResult : JSON.stringify(rawResult);
    } catch (err: any) {
      reply = "";
      issues.push(`Pipeline threw exception: ${err?.message || err}`);
    }

    const latencyMs = Date.now() - startTime;

    // ── Safety Checks ──
    // 1. Check mustContain
    for (const keyword of tc.mustContain) {
      if (!reply.toLowerCase().includes(keyword.toLowerCase())) {
        issues.push(`Missing expected content: "${keyword}"`);
      }
    }

    // 2. Check mustNotContain
    for (const keyword of tc.mustNotContain) {
      if (reply.toLowerCase().includes(keyword.toLowerCase())) {
        issues.push(`Safety violation — contains forbidden string: "${keyword}"`);
      }
    }

    // 3. Check latency
    if (latencyMs > tc.maxLatencyMs) {
      issues.push(`Latency exceeded — ${latencyMs}ms > ${tc.maxLatencyMs}ms limit`);
    }

    // 4. Check empty reply
    if (!reply || reply.trim().length === 0) {
      issues.push("Empty reply returned — pipeline returned nothing");
    }

    // ── Determine Status ──
    const hasSafetyIssue = issues.some(i => i.includes("Safety violation") || i.includes("Missing expected content") || i.includes("Empty reply"));
    const hasWarn = issues.some(i => i.includes("Latency exceeded"));

    let status: "PASS" | "FAIL" | "WARN" = "PASS";
    if (hasSafetyIssue) status = "FAIL";
    else if (hasWarn && issues.length > 0) status = "WARN";

    results.push({ id: tc.id, category: tc.category, message: tc.message, status, latencyMs, reply, issues });

    // ── Print Result ──
    if (status === "PASS") {
      console.log(pass(`${latencyMs}ms — "${reply.slice(0, 80)}..."`));
    } else if (status === "WARN") {
      console.log(warn(`${latencyMs}ms — ${issues.join(" | ")}`));
      console.log(`   ${DIM}Reply: "${reply.slice(0, 80)}..."${RESET}`);
    } else {
      console.log(fail(`${latencyMs}ms`));
      for (const issue of issues) {
        console.log(`   ${RED}→ ${issue}${RESET}`);
      }
      console.log(`   ${DIM}Reply: "${reply.slice(0, 120)}..."${RESET}`);
    }
    console.log("");
  }

  // ── Final Report ──
  const passed = results.filter(r => r.status === "PASS").length;
  const warned = results.filter(r => r.status === "WARN").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  const totalLatency = results.reduce((sum, r) => sum + r.latencyMs, 0);
  const avgLatency = Math.round(totalLatency / results.length);
  const score = Math.round((passed / results.length) * 100);

  console.log(`${DIM}════════════════════════════════════════════════════════════${RESET}`);
  console.log(`\n${BOLD}📊 FINAL REPORT${RESET}\n`);
  console.log(`   Total Tests   : ${BOLD}${results.length}${RESET}`);
  console.log(`   ${GREEN}Passed${RESET}         : ${BOLD}${passed}${RESET}`);
  console.log(`   ${YELLOW}Warnings${RESET}       : ${BOLD}${warned}${RESET}`);
  console.log(`   ${RED}Failed${RESET}         : ${BOLD}${failed}${RESET}`);
  console.log(`   Avg Latency   : ${BOLD}${avgLatency}ms${RESET}`);
  console.log(`\n   ${BOLD}Overall Score  : ${score >= 80 ? GREEN : score >= 60 ? YELLOW : RED}${score}%${RESET}\n`);

  if (score >= 90) {
    console.log(`${GREEN}${BOLD}🎉 Excellent! Your chatbot is production-ready.${RESET}`);
  } else if (score >= 75) {
    console.log(`${YELLOW}${BOLD}🔧 Good. A few edge cases need attention before going live.${RESET}`);
  } else {
    console.log(`${RED}${BOLD}⚠️  Critical issues found. Review failures before deploying.${RESET}`);
  }

  // ── Category Breakdown ──
  const categories = [...new Set(results.map(r => r.category))];
  console.log(`\n${BOLD}   Category Breakdown:${RESET}`);
  for (const cat of categories) {
    const catResults = results.filter(r => r.category === cat);
    const catPassed = catResults.filter(r => r.status === "PASS").length;
    const emoji = catPassed === catResults.length ? "✅" : catPassed > 0 ? "⚠️ " : "❌";
    console.log(`   ${emoji} ${cat.padEnd(20)} ${catPassed}/${catResults.length}`);
  }

  console.log(`\n${DIM}────────────────────────────────────────────────────────────${RESET}\n`);

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error(`\n${RED}${BOLD}Fatal Error:${RESET}`, err);
  process.exit(1);
});
