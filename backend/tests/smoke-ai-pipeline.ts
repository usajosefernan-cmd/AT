/**
 * smoke-ai-pipeline.ts
 *
 * Standalone verification script for the AI pipeline.
 * Tests LLMService, SentinelAgent indicators, and RiskManager hard filters
 * WITHOUT requiring the full WSS server to be running.
 *
 * Run: npx tsx tests/smoke-ai-pipeline.ts
 */

import "dotenv/config";

// ═══════════════════════════════════════════
// TEST 1: LLMService — Groq JSON call
// ═══════════════════════════════════════════

async function testLLMService() {
    console.log("\n═══ TEST 1: LLMService.askGroq() ═══");
    const { askGroq, getLLMSessionStats } = await import("../src/ai/LLMService");

    try {
        const { data, usage } = await askGroq<{ answer: string }>(
            "You are a helpful assistant. Respond in JSON with a single field 'answer'.",
            "What is 2 + 2?",
            { temperature: 0.0, maxTokens: 50, jsonMode: true }
        );

        console.log("Response:", JSON.stringify(data));
        console.log("Usage:", usage);
        console.log(
            data.answer
                ? `✅ TEST 1 PASSED: Got valid JSON with answer="${data.answer}"`
                : "⚠️ TEST 1 PARTIAL: Got JSON but no 'answer' field"
        );
    } catch (error: any) {
        console.error(`❌ TEST 1 FAILED: ${error.message}`);
        if (!process.env.GROQ_API_KEY) {
            console.error("   Hint: GROQ_API_KEY is not set in .env");
        }
    }

    console.log("Session stats:", getLLMSessionStats());
}

// ═══════════════════════════════════════════
// TEST 2: SentinelAgent — Indicator calculation + LLM analysis
// ═══════════════════════════════════════════

async function testSentinelAgent() {
    console.log("\n═══ TEST 2: SentinelAgent indicators + analyze() ═══");
    const { SentinelAgent } = await import("../src/agents/SentinelAgent");

    const sentinel = new SentinelAgent();

    // Feed 20 synthetic candles with a clear volume spike pattern
    const basePrice = 84000;
    for (let i = 0; i < 20; i++) {
        const drift = i * 50; // uptrend
        const isSpike = i === 19; // last candle has volume spike

        sentinel.ingestCandle({
            type: "KLINE",
            source: "HYPERLIQUID",
            symbol: "BTC",
            interval: "15m",
            open: basePrice + drift,
            high: basePrice + drift + 100,
            low: basePrice + drift - 50,
            close: basePrice + drift + 80, // strong bullish body
            volume: isSpike ? 5000 : 1000, // 5x volume on last candle
            timestamp: Date.now() - (20 - i) * 15 * 60 * 1000,
            isClosed: true,
        });
    }

    console.log(`Buffer size: ${sentinel.getBufferSize("HYPERLIQUID", "BTC", "15m")} candles`);

    // Trigger analysis on the last candle
    const lastCandle = {
        type: "KLINE" as const,
        source: "HYPERLIQUID" as const,
        symbol: "BTC",
        interval: "15m",
        open: basePrice + 19 * 50,
        high: basePrice + 19 * 50 + 100,
        low: basePrice + 19 * 50 - 50,
        close: basePrice + 19 * 50 + 80,
        volume: 5000,
        timestamp: Date.now(),
        isClosed: true,
    };

    try {
        const signal = await sentinel.analyze(lastCandle);
        if (signal) {
            console.log(`✅ TEST 2 PASSED: Got signal: ${signal.action} ${signal.symbol} @ ${signal.entry_price}, confidence=${signal.confidence}%`);
            console.log(`   Rationale: ${signal.rationale}`);
            console.log(`   Indicators used: ${signal.indicators_used?.join(", ")}`);
        } else {
            console.log("⚠️ TEST 2 PARTIAL: LLM returned NO_TRADE or null (which is valid)");
        }
    } catch (error: any) {
        console.error(`❌ TEST 2 FAILED: ${error.message}`);
    }
}

// ═══════════════════════════════════════════
// TEST 3: RiskManagerAgent — Hard math filters
// ═══════════════════════════════════════════

async function testRiskManagerFilters() {
    console.log("\n═══ TEST 3: RiskManager hard filters ═══");
    const { RiskManagerAgent } = await import("../src/agents/RiskManagerAgent");
    const { PaperExecutionEngine } = await import("../src/engine/PaperExecutionEngine");

    const engine = new PaperExecutionEngine("b68057e9-7c48-4eac-9a67-0c7f3eabc767");
    await engine.ready; // wait for supabase init
    const latestPrices: Record<string, number> = { BTC: 84000, ETH: 3000 };
    const riskManager = new RiskManagerAgent(engine, latestPrices);

    // Test a valid signal
    const validSignal = {
        action: "LONG" as const,
        symbol: "BTC",
        exchange: "hyperliquid" as const,
        confidence: 85,
        entry_price: 84000,
        stop_loss_pct: 1.5,
        take_profit_pct: 4.0,
        notional_usd: 1000,
        rationale: "Volume spike + EMA cross + RSI oversold",
        timeframe: "15m",
        indicators_used: ["volume_spike", "ema_cross", "rsi"],
    };

    try {
        console.log("Testing with a valid signal ($1000 LONG BTC)...");
        const result = await riskManager.evaluate(validSignal);
        console.log(`Result: approved=${result.approved}, action=${result.action}`);
        console.log(`Details: ${JSON.stringify(result.details).slice(0, 200)}`);

        if (result.approved) {
            console.log("✅ TEST 3a PASSED: Valid signal was approved");
        } else {
            console.log(`⚠️ TEST 3a: Signal rejected (could be LLM macro check): ${result.details.reason || result.details.error || "unknown"}`);
        }
    } catch (error: any) {
        console.error(`❌ TEST 3a FAILED: ${error.message}`);
    }

    // Test Daily DD rejection
    console.log("\nTesting Daily DD rejection (simulated 4.8% DD)...");
    // Manually set high DD by simulating a loss
    (engine as any).account.dayStartEquity = 10000;
    (engine as any).account.balance = 9520; // 4.8% loss

    const overDDSignal = { ...validSignal, notional_usd: 500 };

    try {
        const result = await riskManager.evaluate(overDDSignal);
        if (!result.approved && result.details.rule === "MAX_DAILY_DRAWDOWN") {
            console.log(`✅ TEST 3b PASSED: Correctly rejected for DD: ${result.details.reason}`);
        } else {
            console.log(`⚠️ TEST 3b: Unexpected result: approved=${result.approved}, rule=${result.details.rule}`);
        }
    } catch (error: any) {
        console.error(`❌ TEST 3b FAILED: ${error.message}`);
    }

    // Test R:R rejection
    console.log("\nTesting R:R rejection (bad ratio)...");
    (engine as any).account.balance = 10000; // reset
    const badRRSignal = {
        ...validSignal,
        stop_loss_pct: 3.0,
        take_profit_pct: 2.0, // TP < SL * 2 = BAD
    };

    try {
        const result = await riskManager.evaluate(badRRSignal);
        if (!result.approved && result.details.rule === "RISK_REWARD_INSUFFICIENT") {
            console.log(`✅ TEST 3c PASSED: Correctly rejected for R:R: ${result.details.reason}`);
        } else {
            console.log(`⚠️ TEST 3c: Unexpected result: approved=${result.approved}, rule=${result.details.rule}`);
        }
    } catch (error: any) {
        console.error(`❌ TEST 3c FAILED: ${error.message}`);
    }
}

// ═══════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════

async function main() {
    console.log("╔══════════════════════════════════════════════╗");
    console.log("║  AI PIPELINE SMOKE TEST                     ║");
    console.log("║  Tests: LLMService, Sentinel, RiskManager   ║");
    console.log("╚══════════════════════════════════════════════╝");

    await testLLMService();
    await testSentinelAgent();
    await testRiskManagerFilters();

    console.log("\n═══ ALL TESTS COMPLETE ═══");
    process.exit(0);
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
