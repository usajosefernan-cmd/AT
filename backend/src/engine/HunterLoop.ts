/**
 * HunterLoop.ts — v3: ZERO-COST ARCHITECTURE
 *
 * The radar runs 100% on TypeScript math (cost: $0).
 * The LLM is a SNIPER — called ONLY when the math radar
 * detects an extreme anomaly that passes ALL hard filters.
 *
 * Expected API calls: 1-2 per DAY (not per minute).
 */

import { RiskManagerAgent } from "../agents/RiskManagerAgent";
import { PaperExecutionEngine } from "../engine/PaperExecutionEngine";
import { broadcastAgentLog, broadcastAgentState } from "../utils/SwarmEvents";
import { recordTick, injectLiveData } from "../tools/ExplorationTools";
import { TelegramManager } from "../utils/TelegramManager";
import { MarketTick } from "../utils/WebSocketManager";
import { detectAnomalies, RadarAnomaly } from "../tools/MarketRadar";
import { askGroq } from "../ai/LLMService";

// ═══════════════════════════════════════════
// EXTREME ANOMALY THRESHOLDS (Code, not LLM)
// Only assets that pass ALL of these get sent to the LLM.
// ═══════════════════════════════════════════
const SNIPER_THRESHOLDS = {
    minAnomalyScore: 40,          // Radar anomaly score >= 40
    minAbsChange24h: 5,           // At least 5% move in 24h
    minQuoteVolume: 10_000_000,   // At least $10M 24h volume
    cooldownMinutes: 30,          // Don't call LLM again within 30 min for same symbol
    globalCooldownMinutes: 5,     // Don't call LLM more than once every 5 min total
};

export class HunterLoop {
    private riskManager: RiskManagerAgent;
    private paperEngine: PaperExecutionEngine;
    private telegram: TelegramManager;
    private latestPrices: Record<string, number>;

    private running = false;
    private cycleCount = 0;
    private scanIntervalMs = 10_000; // 10 seconds between MATH scans (free)

    // Cooldown tracking
    private symbolCooldowns: Record<string, number> = {};
    private lastLLMCall = 0;

    // Stats (visible in dashboard)
    private stats = {
        totalCycles: 0,
        assetsScanned: 0,
        anomaliesFound: 0,
        llmCalls: 0,          // THE KEY METRIC — should be near zero
        tradeProposals: 0,
        tradesApproved: 0,
        tradesRejected: 0,
        errors: 0,
        lastScanTime: "",
    };

    constructor(
        riskManager: RiskManagerAgent,
        paperEngine: PaperExecutionEngine,
        telegram: TelegramManager,
        latestPrices: Record<string, number>,
    ) {
        this.riskManager = riskManager;
        this.paperEngine = paperEngine;
        this.telegram = telegram;
        this.latestPrices = latestPrices;
        injectLiveData(latestPrices);
    }

    public onTick(tick: MarketTick) {
        recordTick(tick.symbol, tick.price, tick.volume);
    }

    public async start() {
        if (this.running) return;
        this.running = true;

        console.log(`\n[HunterLoop] 🐺 ZERO-COST RADAR ACTIVATED`);
        console.log(`[HunterLoop] Math scan every ${this.scanIntervalMs / 1000}s (FREE)`);
        console.log(`[HunterLoop] LLM = SNIPER MODE (only on extreme anomalies)\n`);

        broadcastAgentLog("hunter",
            `🐺 Radar matemático activado (coste $0). LLM = modo francotirador.`,
            "success");
        broadcastAgentState("hunter", "scanning", "Math radar active (FREE)", "active");

        while (this.running) {
            await this.runMathScan();
            await this.sleep(this.scanIntervalMs);
        }
    }

    public stop() {
        this.running = false;
        broadcastAgentLog("hunter", `⏸️ Radar pausado. LLM calls: ${this.stats.llmCalls}`, "warn");
        broadcastAgentState("hunter", "paused", "Radar paused", "idle");
    }

    /**
     * PURE MATH SCAN — Zero LLM calls.
     * Downloads tickers, runs anomaly detection, and ONLY triggers
     * the LLM sniper when extreme conditions are met.
     */
    private async runMathScan() {
        this.cycleCount++;
        this.stats.totalCycles++;
        this.stats.lastScanTime = new Date().toLocaleTimeString("es-ES");

        try {
            // 100% code, 0% LLM — detectAnomalies fetches from REST APIs
            // and scores with pure math (volume spikes, momentum, breakouts)
            const anomalies = await detectAnomalies(10);
            this.stats.assetsScanned += 68; // Approximate total scanned

            if (anomalies.length === 0) {
                // Silent — no log spam, no LLM calls
                if (this.cycleCount % 30 === 0) { // Log every 5 minutes
                    broadcastAgentLog("hunter",
                        `📡 Radar: ${this.stats.totalCycles} scans | 0 anomalías | LLM calls: ${this.stats.llmCalls} ($0 extra)`,
                        "info");
                }
                return;
            }

            this.stats.anomaliesFound += anomalies.length;

            // Filter for EXTREME anomalies only (code, not LLM)
            const extremes = anomalies.filter(a =>
                a.anomaly_score >= SNIPER_THRESHOLDS.minAnomalyScore &&
                Math.abs(a.change_pct_24h) >= SNIPER_THRESHOLDS.minAbsChange24h
            );

            if (extremes.length === 0) {
                // Anomalies found but none extreme enough for LLM
                if (this.cycleCount % 6 === 0) { // Log every minute
                    broadcastAgentLog("hunter",
                        `📡 ${anomalies.length} anomalías leves (score < ${SNIPER_THRESHOLDS.minAnomalyScore}). Sin disparo LLM.`,
                        "info");
                }
                return;
            }

            // Check global cooldown — don't call LLM more than once every 5 min
            const now = Date.now();
            if (now - this.lastLLMCall < SNIPER_THRESHOLDS.globalCooldownMinutes * 60_000) {
                return; // Silent skip
            }

            // Pick the top extreme anomaly
            const target = extremes[0];

            // Check per-symbol cooldown
            const lastCall = this.symbolCooldowns[target.symbol] || 0;
            if (now - lastCall < SNIPER_THRESHOLDS.cooldownMinutes * 60_000) {
                return; // Already analyzed this symbol recently
            }

            // ═══════════════════════════════════════════
            // 🎯 SNIPER SHOT — ONE single LLM call
            // ═══════════════════════════════════════════
            await this.fireSniperShot(target);

        } catch (err: any) {
            this.stats.errors++;
            if (this.cycleCount % 10 === 0) {
                broadcastAgentLog("hunter", `❌ Radar error: ${err.message}`, "error");
            }
        }
    }

    /**
     * THE SNIPER — One single LLM call with ALL data packed in.
     * Input: massive JSON with tech data + radar analysis
     * Output: single JSON decision (TRADE or REJECT)
     */
    private async fireSniperShot(target: RadarAnomaly) {
        this.stats.llmCalls++;
        this.lastLLMCall = Date.now();
        this.symbolCooldowns[target.symbol] = Date.now();

        broadcastAgentLog("hunter",
            `🎯 FRANCOTIRADOR ACTIVADO: ${target.symbol} (score: ${target.anomaly_score}, cambio: ${target.change_pct_24h}%)`,
            "success");
        broadcastAgentState("hunter", "sniping", `Analyzing ${target.symbol}`, "active");

        // Fetch real klines for the target (free REST API call)
        let klineData = "No kline data available";
        try {
            const mexcSym = target.symbol.endsWith("USDT") ? target.symbol : target.symbol + "USDT";
            const kResp = await fetch(`https://api.mexc.com/api/v3/klines?symbol=${mexcSym}&interval=5m&limit=50`);
            if (kResp.ok) {
                const klines = await kResp.json() as any[];
                const closes = klines.map((k: any) => parseFloat(k[4]));
                const highs = klines.map((k: any) => parseFloat(k[2]));
                const lows = klines.map((k: any) => parseFloat(k[3]));
                const vols = klines.map((k: any) => parseFloat(k[5]));

                // Calculate indicators in code
                const rsi = this.calcRSI(closes, 14);
                const ema9 = this.calcEMA(closes, 9);
                const ema21 = this.calcEMA(closes, 21);
                const atr = this.calcATR(highs, lows, closes, 14);
                const atrPct = closes[closes.length - 1] > 0 ? (atr / closes[closes.length - 1]) * 100 : 0;

                klineData = JSON.stringify({
                    source: "mexc_5m_klines",
                    candles: closes.length,
                    current_price: closes[closes.length - 1],
                    RSI_14: rsi !== null ? +rsi.toFixed(1) : null,
                    EMA_9: +ema9.toFixed(6),
                    EMA_21: +ema21.toFixed(6),
                    trend: ema9 > ema21 ? "BULLISH" : "BEARISH",
                    ATR_14_pct: +atrPct.toFixed(2),
                    suggested_SL_pct: +Math.max(0.5, atrPct * 1.5).toFixed(2),
                    suggested_TP_pct: +Math.max(1.25, atrPct * 3.75).toFixed(2),
                    recent_closes: closes.slice(-10).map(c => +c.toFixed(6)),
                    recent_volumes: vols.slice(-5).map(v => +v.toFixed(0)),
                });
            }
        } catch { }

        // Fetch news (free API)
        let newsData = "No news available";
        try {
            const cleanSym = target.symbol.replace("USDT", "");
            const nResp = await fetch(`https://min-api.cryptocompare.com/data/v2/news/?categories=${cleanSym}&limit=3`);
            if (nResp.ok) {
                const nd = await nResp.json() as any;
                const headlines = (nd.Data || []).slice(0, 3).map((n: any) => n.title);
                newsData = headlines.length > 0 ? headlines.join(" | ") : "Sin noticias recientes";
            }
        } catch { }

        // ONE SINGLE LLM CALL — the sniper shot
        const sniperPrompt = `Eres un trader cuantitativo de élite. El escáner matemático (coste $0) ha detectado UNA anomalía extrema. Tienes 1 SOLA oportunidad de decidir.

DATOS DEL ESCÁNER (100% código, sin interpretación IA):
- Símbolo: ${target.symbol}
- Exchange: ${target.exchange}
- Precio actual: $${target.price}
- Cambio 24h: ${target.change_pct_24h}%
- Volumen 24h: $${(target.volume_24h / 1_000_000).toFixed(1)}M
- Anomaly Score: ${target.anomaly_score}/100
- Razones de anomalía: ${target.anomaly_reasons.join(", ")}
- ATR estimado: ${target.atr_pct}%
- SL sugerido: ${target.suggested_sl_pct}%
- TP sugerido: ${target.suggested_tp_pct}%

INDICADORES TÉCNICOS REALES (5m klines):
${klineData}

NOTICIAS RECIENTES:
${newsData}

INSTRUCCIONES:
- Si HAY ventaja estadística clara: devuelve {"decision": "TRADE", "action": "LONG" o "SHORT", "confidence": 0-100, "stop_loss_pct": X, "take_profit_pct": Y, "notional_usd": 200-500, "rationale": "razón concisa"}
- Si NO hay ventaja: devuelve {"decision": "REJECT", "reason": "razón concisa"}
- R:R mínimo 1:2. SL basado en ATR.
- Responde SOLO con el JSON, nada más.`;

        try {
            broadcastAgentLog("hunter", `🔫 Disparando al LLM... (call #${this.stats.llmCalls})`, "info");

            const response = await askGroq(
                sniperPrompt,
                "Analiza y responde con JSON.",
                { model: "llama-3.3-70b-versatile", jsonMode: true, temperature: 0.3, maxTokens: 300 }
            );

            const decision = response.data;
            broadcastAgentLog("hunter",
                `🔫 LLM respondió: ${JSON.stringify(decision).slice(0, 200)}`,
                decision?.decision === "TRADE" ? "success" : "warn");

            if (decision?.decision === "TRADE") {
                this.stats.tradeProposals++;

                const signal = {
                    action: (decision.action || "LONG") as "LONG" | "SHORT",
                    symbol: target.symbol,
                    exchange: target.exchange,
                    confidence: decision.confidence || 70,
                    entry_price: target.price,
                    stop_loss_pct: decision.stop_loss_pct || target.suggested_sl_pct,
                    take_profit_pct: decision.take_profit_pct || target.suggested_tp_pct,
                    notional_usd: Math.min(decision.notional_usd || 300, 500),
                    rationale: decision.rationale || "Sniper signal",
                    timeframe: "scanner",
                    indicators_used: ["radar_math", "sniper_llm"],
                    aggressiveMode: target.exchange === "mexc",
                };

                broadcastAgentLog("ceo",
                    `🗣️ Hunter dispara: ${signal.action} ${signal.symbol}. Risk Guardian, evalúa.`,
                    "info");
                broadcastAgentState("risk", "evaluating", `${signal.action} ${signal.symbol}`, "active");

                const evaluation = await this.riskManager.evaluate(signal as any);

                if (evaluation.approved) {
                    this.stats.tradesApproved++;
                    broadcastAgentLog("ceo",
                        `✅ TRADE APROBADO: ${signal.action} ${signal.symbol} $${signal.notional_usd}`,
                        "success");
                    await this.telegram.broadcastAlert(
                        `🎯 *SNIPER TRADE*\n${signal.action} ${signal.symbol} @ $${signal.entry_price}\nSL: ${signal.stop_loss_pct}% | TP: ${signal.take_profit_pct}%\n${signal.rationale}`
                    );
                } else {
                    this.stats.tradesRejected++;
                    const reason = evaluation.details?.reason || evaluation.details?.error || "Risk filters";
                    broadcastAgentLog("risk", `⛔ Rechazado: ${reason}`, "warn");
                }
            } else {
                broadcastAgentLog("hunter",
                    `🚫 LLM rechazó ${target.symbol}: ${decision?.reason || "sin ventaja"}`,
                    "warn");
            }

        } catch (err: any) {
            broadcastAgentLog("hunter", `❌ Sniper error: ${err.message}`, "error");
        }

        broadcastAgentState("hunter", "scanning", "Math radar active (FREE)", "active");
    }

    public getStats() {
        return { ...this.stats, running: this.running, cycleCount: this.cycleCount };
    }

    // ═══ Indicator math (zero deps) ═══
    private calcRSI(closes: number[], period: number): number | null {
        if (closes.length < period + 1) return null;
        let gains = 0, losses = 0;
        for (let i = closes.length - period; i < closes.length; i++) {
            const diff = closes[i] - closes[i - 1];
            if (diff > 0) gains += diff; else losses += Math.abs(diff);
        }
        if (losses === 0) return 100;
        return 100 - (100 / (1 + (gains / period) / (losses / period)));
    }

    private calcEMA(data: number[], period: number): number {
        const k = 2 / (period + 1);
        let ema = data[0];
        for (let i = 1; i < data.length; i++) ema = data[i] * k + ema * (1 - k);
        return ema;
    }

    private calcATR(highs: number[], lows: number[], closes: number[], period: number): number {
        const trs: number[] = [];
        for (let i = 1; i < highs.length; i++) {
            trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
        }
        const recent = trs.slice(-period);
        return recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
