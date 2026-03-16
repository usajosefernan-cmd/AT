/**
 * AILoop.ts
 * 
 * El bucle de evaluación que conecta los datos del mercado con los agentes de IA.
 * 
 * Pipeline:
 *   WSS tick/kline → SentinelAgent.ingestCandle()
 *                   → [15m candle cierra] → SentinelAgent.analyze() → Groq
 *                   → [señal >= 70%] → RiskManagerAgent.evaluate() → Claude/OpenRouter
 *                   → [aprobada] → ToolExecutor.execute_trade() → PaperEngine
 *                   → [resultado] → Supabase + Dashboard + Telegram
 */

import { SentinelAgent, TradeSignal } from "../agents/SentinelAgent";
import { RiskManagerAgent } from "../agents/RiskManagerAgent";
import { CEOAgent } from "../agents/CEOAgent";
import { PaperExecutionEngine } from "../engine/PaperExecutionEngine";
import { WebSocketManager, OHLCCandle, MarketTick } from "../utils/WebSocketManager";
import { TelegramManager } from "../utils/TelegramManager";
import { broadcastAgentState, broadcastAgentLog } from "../utils/SwarmEvents";
import { saveAgentMemory } from "../utils/supabaseClient";

export class AILoop {
    public sentinel: SentinelAgent;
    public riskManager: RiskManagerAgent;
    public ceoAgent: CEOAgent;
    private paperEngine: PaperExecutionEngine;
    private telegram: TelegramManager;
    private latestPrices: Record<string, number>;

    // Throttle: no evaluar más de 1 señal cada 2 segundos (Modo Agresivo)
    private lastEvaluationTime: number = 0;
    private evaluationCooldownMs = 2_000;

    // Stats
    private stats = {
        candlesIngested: 0,
        signalsGenerated: 0,
        signalsApproved: 0,
        signalsRejected: 0,
        errorsCount: 0,
    };

    constructor(
        paperEngine: PaperExecutionEngine,
        telegram: TelegramManager,
        latestPrices: Record<string, number>,
    ) {
        this.paperEngine = paperEngine;
        this.telegram = telegram;
        this.latestPrices = latestPrices;

        this.sentinel = new SentinelAgent();
        this.riskManager = new RiskManagerAgent(paperEngine, latestPrices);
        this.ceoAgent = new CEOAgent(
            paperEngine,
            latestPrices,
            this.forceAnalysis.bind(this)
        );
    }

    /**
     * Conecta los eventos del WebSocketManager al pipeline de IA.
     */
    public wire(wsManager: WebSocketManager) {
        // Todas las klines alimentan el buffer del Sentinel
        wsManager.on("kline", (candle: OHLCCandle) => {
            this.sentinel.ingestCandle(candle);
            this.stats.candlesIngested++;
        });

        // El evento clave: cierre de vela de 15m dispara el análisis
        wsManager.on("candle_closed_15m", async (candle: OHLCCandle) => {
            await this.onCandleClosed(candle);
        });

        // Conectar Telegram al CEO Agent
        this.wireTelegram();

        console.log("[AILoop] ✅ Pipeline conectado: WSS → Sentinel → Risk → Execute");
    }

    /**
     * Se ejecuta cuando cierra una vela de 15 minutos.
     * JERARQUÍA CORPORATIVA MULTI-AGENTE: EL CEO MANDA.
     */
    private async onCandleClosed(candle: OHLCCandle) {
        // Throttle: evitar múltiples evaluaciones simultáneas
        const now = Date.now();
        if (now - this.lastEvaluationTime < this.evaluationCooldownMs) {
            return;
        }
        this.lastEvaluationTime = now;

        console.log(`\n${"═".repeat(60)}`);
        console.log(`[AILoop] 🏢 CEO INICIA CICLO DE BÚSQUEDA: ${candle.source} / ${candle.symbol}`);
        console.log(`${"═".repeat(60)}`);

        // ─── EL CEO DA LA ORDEN ───
        broadcastAgentState("ceo", "orchestrating", `Directing scan on ${candle.symbol}`, "active");
        broadcastAgentLog("ceo", `🗣️ "Equipo, vela de 15m cerrada en ${candle.symbol}. Sentinel, inicia escaneo técnico de mercado."`, "info");

        // ─── PASO 1: Sentinel analiza (El Analista) ───
        broadcastAgentState("sentinel", "analyzing", candle.symbol, "active");
        broadcastAgentLog("sentinel", `🤖 "Recibido, CEO. Evaluando acción de precio y volumen en ${candle.symbol}..."`, "info");
        let signal: TradeSignal | null = null;

        try {
            signal = await this.sentinel.analyze(candle);
        } catch (error: any) {
            console.error(`[AILoop] Error en Sentinel: ${error.message}`);
            this.stats.errorsCount++;
            broadcastAgentState("sentinel", "error", error.message.slice(0, 30), "error");
            broadcastAgentLog("sentinel", `❌ "CEO, encontré un fallo interno al escanear: ${error.message}"`, "error");
            return;
        }

        // Si no hay señal, el Sentinel informa al CEO
        if (!signal) {
            broadcastAgentState("sentinel", "idle", candle.symbol, "idle");
            broadcastAgentLog("sentinel", `📉 "CEO, escaneo completado. No hay ventaja estadística en ${candle.symbol} actualmente."`, "warn");
            broadcastAgentLog("ceo", `🗣️ "Entendido Sentinel. Mantenemos liquidez. Volved a standby."`, "info");
            return;
        }

        this.stats.signalsGenerated++;
        broadcastAgentLog("sentinel", `📈 "CEO, he encontrado una oportunidad: ${signal.action} en ${signal.symbol}. Confianza del ${signal.confidence}%. Razón: ${signal.rationale}"`, "success");

        // ─── EL CEO EVALÚA Y PASA A RIESGOS ───
        broadcastAgentLog("ceo", `🗣️ "Buen trabajo Sentinel. Risk Guardian, evalúa esta propuesta de ${signal.action} bajo nuestras estrictas reglas de capital."`, "info");

        // ─── PASO 2: Risk Manager evalúa (Compliance / Riesgos) ───
        broadcastAgentState("risk_manager", "evaluating", `${signal.action} ${signal.symbol}`, "active");
        broadcastAgentLog("risk_manager", `🛡️ "Recibido CEO. Aplicando parámetros de Axi Select y límites de Drawdown al trade propuesto..."`, "info");

        let evaluation;
        try {
            evaluation = await this.riskManager.evaluate(signal);
        } catch (error: any) {
            console.error(`[AILoop] Error en RiskManager: ${error.message}`);
            this.stats.errorsCount++;
            broadcastAgentState("risk_manager", "error", error.message.slice(0, 30), "error");
            broadcastAgentLog("risk_manager", `❌ "CEO, error de cálculo en matriz de riesgo: ${error.message}"`, "error");
            return;
        }

        // ─── PASO 3: Ejecución final autorizada por el CEO ───
        if (evaluation.approved) {
            this.stats.signalsApproved++;
            broadcastAgentLog("risk_manager", `✅ "CEO, el trade cumple todos los parámetros de riesgo. Exposición calculada y aprobada."`, "success");

            broadcastAgentLog("ceo", `🗣️ "Perfecto. Autorizo la ejecución del trade. Enviando órdenes al exchange (PAPER)."`, "success");
            console.log(`[AILoop] ✅ TRADE APROBADO POR CEO (PAPER): ${JSON.stringify(evaluation.details)}`);

            await this.telegram.broadcastAlert(
                [
                    `🏢 *DECISIÓN DEL COMITÉ (CEO APROBADO)*`,
                    `🎯 ${signal.action} ${signal.symbol} @ $${signal.entry_price}`,
                    `💰 Notional: $${signal.notional_usd}`,
                    `🛡️ SL: ${signal.stop_loss_pct}% | TP: ${signal.take_profit_pct}%`,
                    `🧠 Analista (Groq): ${signal.confidence}% confianza.`,
                    `💡 ${signal.rationale}`,
                ].join("\n")
            );
        } else {
            this.stats.signalsRejected++;
            const reason = evaluation.details.reason || evaluation.details.error || "Unknown";
            broadcastAgentLog("risk_manager", `⛔ "CEO, he RECHAZADO la propuesta. Motivo de cumplimiento: ${reason}"`, "warn");
            broadcastAgentLog("ceo", `🗣️ "Comprendido. Abortamos la operación para proteger el capital. Buen trabajo equipo."`, "warn");
            console.log(`[AILoop] ❌ TRADE VETADO: ${reason}`);
        }

        // Guardar historial completo en los archivos de la firma
        await saveAgentMemory("ai_loop", "last_iteration", JSON.stringify({
            candle: { symbol: candle.symbol, source: candle.source, close: candle.close, volume: candle.volume },
            signal,
            evaluation,
            stats: this.stats,
            timestamp: new Date().toISOString(),
        }));

        broadcastAgentState("ceo", "idle", undefined, "idle");
        broadcastAgentState("sentinel", "idle", undefined, "idle");
        broadcastAgentState("risk_manager", "monitoring", undefined, "idle");
    }

    /**
     * Conecta Telegram con el CEOAgent para procesar mensajes en lenguaje natural.
     */
    private wireTelegram() {
        // Connect the real CEOAgent (LLM-powered) as the fallback handler
        this.telegram.setCEOHandler(async (text: string) => {
            return this.ceoAgent.processMessage(text);
        });

        // Kill switch from Telegram -> PaperEngine
        this.telegram.on("killswitch", () => {
            this.paperEngine.liquidateAll(this.latestPrices);
        });
    }

    /**
     * Maneja un mensaje de Telegram usando el CEOAgent con LLM.
     */
    public async handleTelegramMessage(text: string): Promise<string> {
        return this.ceoAgent.processMessage(text);
    }

    /**
     * Stats del loop para el Dashboard.
     */
    public getStats() {
        return { ...this.stats };
    }

    /**
     * Forzar análisis inmediato — ignora el cierre de vela.
     * Coge el precio actual, construye una vela sintética y lanza el pipeline completo.
     */
    public async forceAnalysis(): Promise<any> {
        const symbols = Object.keys(this.latestPrices);
        if (symbols.length === 0) {
            broadcastAgentLog("ceo", "⚠️ No hay precios disponibles para análisis forzado", "warn");
            return { error: "No prices available" };
        }

        // Prefer BTC or ETH if available
        const preferredSymbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BTC", "ETH", "SOL"];
        const symbol = preferredSymbols.find(s => symbols.includes(s)) || symbols[0];
        const price = this.latestPrices[symbol];

        broadcastAgentLog("ceo", `🔴 INICIANDO ANÁLISIS FORZADO: ${symbol} @ $${price}`, "warn");

        // Build a synthetic candle from current price
        const syntheticCandle: OHLCCandle = {
            type: "KLINE",
            source: "HYPERLIQUID", 
            symbol,
            interval: "15m",
            open: price * 0.999,
            high: price * 1.001,
            low: price * 0.998,
            close: price,
            volume: 1000,
            timestamp: Date.now(),
            isClosed: true,
        };

        // Reset cooldown so analysis runs
        this.lastEvaluationTime = 0;
        
        // Trigger the analysis pipeline
        const signal = await this.sentinel.analyze(syntheticCandle);
        if (signal) {
            await this.riskManager.evaluate(signal);
        }

        await this.onCandleClosed(syntheticCandle);

        return {
            symbol,
            price,
            stats: this.getStats(),
            message: `Force-analyzed ${symbol} at $${price}`,
        };
    }

    /**
     * Hot-reload un valor de configuración de riesgo.
     * Llamado por PUT /api/config cuando el operador cambia un límite en el Dashboard.
     */
    public reloadRiskConfig(key: string, value: any) {
        broadcastAgentLog("risk", `⚙️ Config actualizada: ${key} = ${JSON.stringify(value)}`, "warn");
        // Forward to the risk manager for live update
        (this.riskManager as any).updateConfig?.(key, value);
        console.log(`[AILoop] Risk config reloaded: ${key} = ${JSON.stringify(value)}`);
    }
}
