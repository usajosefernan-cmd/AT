import { detectAnomalies } from "../tools/MarketRadar";
import { MemecoinSniperAgent } from "../agents/specialists/MemecoinSniperAgent";
import { CryptoPerpAgent } from "../agents/specialists/CryptoPerpAgent";
import { EquitiesAnalystAgent } from "../agents/specialists/EquitiesAnalystAgent";
import { ForexMacroAgent } from "../agents/specialists/ForexMacroAgent";
import { RiskManagerAgent } from "../agents/RiskManagerAgent";
import { broadcastAgentLog, broadcastAgentState } from "../utils/SwarmEvents";
import { getDeepData, fetchNewsAndMacro } from "../tools/ExplorationTools";
import { TradeSignal } from "../agents/SentinelAgent"; // We re-use TradeSignal interface for simplicity

export class SwarmOrchestrator {
    // Throttle: no evaluar más de 1 señal cada 2 segundos (Modo Agresivo)
    private lastEvaluationTime: number = 0;
    private evaluationCooldownMs = 2_000;
    private memecoinSniper: MemecoinSniperAgent;
    private cryptoPerp: CryptoPerpAgent;
    private equitiesAnalyst: EquitiesAnalystAgent;
    private forexMacro: ForexMacroAgent;
    private riskManager: RiskManagerAgent;

    constructor(riskManager: RiskManagerAgent) {
        this.riskManager = riskManager;
        this.memecoinSniper = new MemecoinSniperAgent();
        this.cryptoPerp = new CryptoPerpAgent();
        this.equitiesAnalyst = new EquitiesAnalystAgent();
        this.forexMacro = new ForexMacroAgent();
    }

    public async runScanCycle() {
        try {
            // 1. Radar detects anomalies (pure math, no LLM)
            const anomalies = await detectAnomalies(5); // Top 5 (responsable)

            if (anomalies.length === 0) return;

            // 2. Procesar SECUENCIALMENTE — una a la vez, sin inundar APIs
            console.log(`[SwarmOrchestrator] 📊 Procesando ${anomalies.length} anomalías SECUENCIALMENTE...`);

            for (const anomaly of anomalies) {
                try {
                    const deepData = await getDeepData(anomaly.symbol);
                    const newsData = await fetchNewsAndMacro(anomaly.symbol);

                    let decision: any = null;
                    let agentId = "";

                    if (anomaly.exchange === "mexc") {
                        agentId = "memecoin_sniper";
                        decision = await this.memecoinSniper.evaluateAnomaly(anomaly.symbol, deepData, newsData);
                    } else if (anomaly.exchange === "hyperliquid") {
                        agentId = "crypto_perp";
                        decision = await this.cryptoPerp.evaluateAnomaly(anomaly.symbol, deepData, newsData);
                    } else if (anomaly.exchange === "alpaca") {
                        agentId = "equities_analyst";
                        decision = await this.equitiesAnalyst.evaluateAnomaly(anomaly.symbol, deepData, newsData);
                    } else if (anomaly.exchange === "axi" || anomaly.exchange === "forex") {
                        agentId = "forex_macro";
                        decision = await this.forexMacro.evaluateAnomaly(anomaly.symbol, deepData, newsData);
                    }

                    if (decision && decision.decision === "TRADE") {
                        await this.orchestrateRiskDebate(agentId, anomaly, decision, deepData, newsData);
                    }

                    // Pausa de 3s entre análisis para no saturar APIs
                    await new Promise(r => setTimeout(r, 3000));
                } catch (err: any) {
                    console.error(`[SwarmOrchestrator] Error ${anomaly.symbol}:`, err.message?.slice(0, 80));
                }
            }
        } catch (err: any) {
            console.error("[SwarmOrchestrator] Error en el ciclo:", err.message);
        }
    }

    private async orchestrateRiskDebate(agentId: string, anomaly: any, decision: any, deepData: string, newsData: string, attempt: number = 1) {
        if (attempt > 2) {
            broadcastAgentLog("ceo", `⛔ Límite de negociaciones alcanzado para ${anomaly.symbol}. Trade descartado.`, "error");
            return;
        }

        broadcastAgentLog("ceo", `⚖️ Iniciando debate de riesgo para ${anomaly.symbol} (Intento ${attempt})`, "info");

        const signal: TradeSignal = {
            symbol: anomaly.symbol,
            action: decision.action,
            confidence: decision.confidence,
            notional_usd: decision.notional_usd || 500, // Capital propuesto por el especialista o default
            stop_loss_pct: decision.stop_loss_pct || anomaly.suggested_sl_pct,
            take_profit_pct: decision.take_profit_pct || anomaly.suggested_tp_pct,
            rationale: decision.reason,
            exchange: anomaly.exchange,
            entry_price: anomaly.price,
            timeframe: "5m", // Añadido para compilar con la interfaz
            indicators_used: ["VolumeAnomaly", "Radar"] // Añadido para compilar con la interfaz
        };

        const riskResult = await this.riskManager.evaluate(signal);

        if (riskResult.approved) {
            broadcastAgentLog("ceo", `✅ Trade ejecutado exitosamente tras debate.`, "success");
            broadcastAgentState(agentId, "success", `Trade abierto: ${anomaly.symbol}`, "success");
        } else if (riskResult.action === "REJECT_WITH_FEEDBACK") {
            // Re-evaluate with feedback
            broadcastAgentLog(agentId, `Analizando feedback de riesgo: ${riskResult.details.reason}`, "warn");

            // For simplicity, we create a modified deepData string injecting the risk feedback
            const modifiedContext = `[MANDATO DEL RISK MANAGER]: ${riskResult.details.reason}\n\nReevalúa tu propuesta ajustando los parámetros de riesgo. Si no puedes cumplir con esto, devuelve PASS.\n\n${deepData}`;

            let newDecision: any = null;
            if (agentId === "memecoin_sniper") newDecision = await this.memecoinSniper.evaluateAnomaly(anomaly.symbol, modifiedContext, newsData);
            if (agentId === "crypto_perp") newDecision = await this.cryptoPerp.evaluateAnomaly(anomaly.symbol, modifiedContext, newsData);
            if (agentId === "equities_analyst") newDecision = await this.equitiesAnalyst.evaluateAnomaly(anomaly.symbol, modifiedContext, newsData);
            if (agentId === "forex_macro") newDecision = await this.forexMacro.evaluateAnomaly(anomaly.symbol, modifiedContext, newsData);

            if (newDecision && newDecision.decision === "TRADE") {
                await this.orchestrateRiskDebate(agentId, anomaly, newDecision, deepData, newsData, attempt + 1);
            } else {
                broadcastAgentLog("ceo", `El especialista ${agentId} desistió del trade tras el feedback del Risk Manager.`, "info");
                broadcastAgentState(agentId, "idle", `Trade abortado`, "idle");
            }
        } else {
            // Rejected completely
            broadcastAgentState(agentId, "error", `Rechazado por Risk`, "error");
        }
    }
}
