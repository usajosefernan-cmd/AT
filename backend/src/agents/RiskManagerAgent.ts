/**
 * RiskManagerAgent.ts
 *
 * El filtro de riesgo del sistema. Aplica reglas matemáticas PURAS de Axi Select
 * ANTES de cualquier llamada a LLM. Solo si pasa todas las validaciones duras,
 * se consulta al LLM (Claude via OpenRouter) para validación de contexto macro.
 *
 * PIPELINE:
 *   Signal (from Sentinel)
 *     → Hard Filter 1: Daily Drawdown (leído de Supabase + in-memory)
 *     → Hard Filter 2: Total Drawdown
 *     → Hard Filter 3: Weekend prohibition
 *     → Hard Filter 4: Risk/Reward ratio >= 1:2
 *     → Hard Filter 5: Exchange order size validation
 *     → Hard Filter 6: Max position size (20% equity)
 *     → Hard Filter 7: Max risk per trade (2% equity)
 *     → Hard Filter 8: Correlation check (max 2 same-market positions)
 *     → [ALL PASSED] → LLM macro-context validation (Claude/OpenRouter)
 *     → execute_trade or reject_trade
 */

import { askGroq } from "../ai/LLMService";
import { TradeSignal } from "./SentinelAgent";
import { TOOL_DEFINITIONS, ToolExecutor } from "../tools/TradingTools";
import { AXI_SELECT_RULES, MARKET_RULES, isMarketOpen, validateOrderSize } from "../config/ExchangeManager";
import { PaperExecutionEngine } from "../engine/PaperExecutionEngine";
import { broadcastAgentState, broadcastAgentLog } from "../utils/SwarmEvents";
import { saveAgentMemory } from "../utils/supabaseClient";

// ═══════════════════════════════════════════
// System Prompt — Risk Manager (el guardián)
// ═══════════════════════════════════════════

const getSystemPrompt = () => `Eres el Risk Manager de un hedge fund algorítmico. Tu trabajo es PROTEGER el capital y NEGOCIAR EL RIESGO con los analistas.

NUNCA ejecutas un trade a ciegas. La señal que recibes PASÓ los filtros matemáticos básicos, pero debes evaluarla:
1. ¿Hay eventos macro importantes hoy (FOMC, NFP, CPI) que invaliden la señal?
2. ¿El apalancamiento, el Stop Loss o el tamaño de la posición son excesivos para la volatilidad esperada?
3. ¿El ratio Riesgo/Beneficio es demasiado ajustado?

Si el trade es seguro y el riesgo está medido → devuelve APPROVE.
Si el trade es un peligro inminente insalvable → devuelve REJECT explicándolo.
Si el trade es bueno pero es demasiado arriesgado (SL muy amplio, posición muy grande) → devuelve REJECT_WITH_FEEDBACK especificando matemáticamente qué debe cambiar el especialista (ej: "Ajusta el Stop Loss al 3% y reduce posición a la mitad").

REGLAS DE AXI SELECT (ya verificadas, pero para tu referencia):
- Daily DD Max: ${AXI_SELECT_RULES.maxDailyDrawdownPct}%
- Total DD Max: ${AXI_SELECT_RULES.maxTotalDrawdownPct}%
- Weekend Holding: ${AXI_SELECT_RULES.weekendHolding ? "Permitido" : "PROHIBIDO"}
- Hedging: ${AXI_SELECT_RULES.hedgingAllowed ? "Permitido" : "PROHIBIDO"}

Sé conservador, pero prioriza corregir al especialista (REJECT_WITH_FEEDBACK) antes que rechazar de plano, si la idea es buena pero mal dimensionada.`;

// ═══════════════════════════════════════════
// Tool filter: only risk-relevant tools
// ═══════════════════════════════════════════

const RISK_MANAGER_TOOLS = TOOL_DEFINITIONS.filter((t) =>
    ["execute_trade", "reject_trade", "get_portfolio_status", "save_analysis"].includes(t.function.name)
);

// ═══════════════════════════════════════════
// Hard rejection result type
// ═══════════════════════════════════════════

interface EvaluationResult {
    approved: boolean;
    action: string;
    details: any;
}

function hardReject(reason: string, rule: string, canRetry: boolean = false): EvaluationResult {
    return {
        approved: false,
        action: canRetry ? "REJECT_WITH_FEEDBACK" : "REJECTED",
        details: { reason, rule },
    };
}

// ═══════════════════════════════════════════
// Clase RiskManagerAgent
// ═══════════════════════════════════════════

export class RiskManagerAgent {
    private toolExecutor: ToolExecutor;
    private paperEngine: PaperExecutionEngine;

    constructor(paperEngine: PaperExecutionEngine, latestPrices: Record<string, number>) {
        this.paperEngine = paperEngine;
        this.toolExecutor = new ToolExecutor(paperEngine, latestPrices);
    }

    /**
     * Evalúa una señal del Sentinel.
     * Applica 8 filtros matemáticos DUROS (puro TypeScript, cero LLM)
     * ANTES de llamar al LLM para contexto macro.
     */
    public async evaluate(signal: TradeSignal): Promise<EvaluationResult> {
        broadcastAgentState("risk_manager", "evaluating", `${signal.action} ${signal.symbol}`, "active");

        // ═══════════════════════════════════════════
        // FILTROS DUROS (TypeScript puro, sin LLM, milisegundos)
        // ═══════════════════════════════════════════

        const equity = this.paperEngine.getTotalEquity();
        const dailyDD = this.paperEngine.getMaxDailyDrawdownPct();
        const maxDD = this.paperEngine.getMaxTotalDrawdownPct();
        const riskOfTrade = (signal.stop_loss_pct / 100) * (signal.notional_usd / equity) * 100;

        const effectiveDailyDD = dailyDD;
        const effectiveMaxDD = maxDD;

        console.log(`[RiskManager] ═══ HARD FILTERS START ═══`);
        console.log(`[RiskManager] Equity: $${equity.toFixed(2)} | Daily DD: ${effectiveDailyDD.toFixed(2)}% | Max DD: ${effectiveMaxDD.toFixed(2)}% | Trade Risk: ${riskOfTrade.toFixed(2)}%`);

        // ─── Filter 1: Daily Drawdown ───
        if (effectiveDailyDD + riskOfTrade >= AXI_SELECT_RULES.maxDailyDrawdownPct) {
            const result = hardReject(
                `Daily DD ${effectiveDailyDD.toFixed(2)}% + trade risk ${riskOfTrade.toFixed(2)}% >= limit ${AXI_SELECT_RULES.maxDailyDrawdownPct}%`,
                "MAX_DAILY_DRAWDOWN"
            );
            broadcastAgentState("risk_manager", "rejected", "Daily DD limit", "error");
            broadcastAgentLog("ceo", `⛔ Risk Guardian BLOQUEÓ trade: ${result.details.reason}`, "error");
            console.log(`[RiskManager] ❌ FILTER 1 FAILED: ${result.details.reason}`);
            return result;
        }
        console.log(`[RiskManager] ✅ Filter 1: Daily DD OK`);

        // ─── Filter 2: Total Drawdown ───
        if (effectiveMaxDD + riskOfTrade >= AXI_SELECT_RULES.maxTotalDrawdownPct) {
            const result = hardReject(
                `Max DD ${effectiveMaxDD.toFixed(2)}% + trade risk ${riskOfTrade.toFixed(2)}% >= limit ${AXI_SELECT_RULES.maxTotalDrawdownPct}%`,
                "MAX_TOTAL_DRAWDOWN"
            );
            broadcastAgentState("risk_manager", "rejected", "Total DD limit", "error");
            broadcastAgentLog("ceo", `⛔ Risk Guardian BLOQUEÓ trade: ${result.details.reason}`, "error");
            console.log(`[RiskManager] ❌ FILTER 2 FAILED: ${result.details.reason}`);
            return result;
        }
        console.log(`[RiskManager] ✅ Filter 2: Total DD OK`);

        // ─── Filter 3: Weekend prohibition ───
        // ONLY applies to forex/equities. Crypto (hyperliquid, mexc) trades 24/7/365.
        const cryptoExchanges = ["hyperliquid", "mexc"];
        const isCryptoExchange = cryptoExchanges.includes(signal.exchange.toLowerCase());
        const now = new Date();
        const utcDay = now.getUTCDay();
        const utcHour = now.getUTCHours();

        if (!isCryptoExchange && !AXI_SELECT_RULES.weekendHolding) {
            if (utcDay === 5 && utcHour >= 19) {
                const result = hardReject("Viernes después de 19:00 UTC. No se abren posiciones forex/equity.", "WEEKEND_HOLDING");
                broadcastAgentState("risk_manager", "rejected", "Weekend rule", "error");
                broadcastAgentLog("ceo", `⛔ Risk Guardian: Bloqueado por regla de fin de semana (forex/equity).`, "warn");
                console.log(`[RiskManager] ❌ FILTER 3 FAILED: Weekend Friday (forex/equity only)`);
                return result;
            }
            if (utcDay === 0 || utcDay === 6) {
                const result = hardReject("Es fin de semana. No se abren posiciones forex/equity.", "WEEKEND_HOLDING");
                broadcastAgentState("risk_manager", "rejected", "Weekend rule", "error");
                console.log(`[RiskManager] ❌ FILTER 3 FAILED: Weekend (forex/equity only)`);
                return result;
            }
        }
        console.log(`[RiskManager] ✅ Filter 3: Weekend OK ${isCryptoExchange ? "(crypto 24/7)" : "(market open)"}`);

        // ─── Filter 4: Risk/Reward ratio ───
        // AGGRESSIVE_SCALP_MODE: memecoins use relaxed 1:1.2 R:R instead of 1:2
        const isAggressive = (signal as any).aggressiveMode === true;
        const requiredRR = isAggressive ? 1.2 : 2.0;
        if (signal.take_profit_pct < signal.stop_loss_pct * requiredRR) {
            const result = hardReject(
                `R:R insuficiente. SL: ${signal.stop_loss_pct}%, TP: ${signal.take_profit_pct}%. Mínimo 1:${requiredRR}. Ajusta el TP o reduce el SL para mejorar el ratio.`,
                "RISK_REWARD_INSUFFICIENT", true
            );
            broadcastAgentState("risk_manager", "rejected", "Bad R:R", "error");
            console.log(`[RiskManager] ❌ FILTER 4 FAILED: R:R ${signal.stop_loss_pct}:${signal.take_profit_pct} (need 1:${requiredRR})`);
            return result;
        }
        console.log(`[RiskManager] ✅ Filter 4: R:R OK (${signal.stop_loss_pct}:${signal.take_profit_pct}) ${isAggressive ? "[AGGRESSIVE]" : ""}`);

        // ─── Filter 5: Exchange order validation ───
        const quantity = signal.notional_usd / signal.entry_price;
        const orderCheck = validateOrderSize(signal.exchange, signal.symbol, quantity, signal.notional_usd);
        if (!orderCheck.valid) {
            const result = hardReject(orderCheck.reason!, "POSITION_SIZE_TOO_LARGE");
            broadcastAgentState("risk_manager", "rejected", orderCheck.reason!.slice(0, 30), "error");
            console.log(`[RiskManager] ❌ FILTER 5 FAILED: ${orderCheck.reason}`);
            return result;
        }
        console.log(`[RiskManager] ✅ Filter 5: Order size OK`);

        // ─── Filter 6: Max position size (configurable % equity) ───
        const equityPct = (signal.notional_usd / equity) * 100;
        if (equityPct > AXI_SELECT_RULES.maxPositionPct) {
            const result = hardReject(
                `Posición $${signal.notional_usd} = ${equityPct.toFixed(1)}% del equity. Máximo ${AXI_SELECT_RULES.maxPositionPct}%. Reduce el notional_usd.`,
                "POSITION_SIZE_TOO_LARGE", true
            );
            console.log(`[RiskManager] ❌ FILTER 6 FAILED: ${equityPct.toFixed(1)}% > ${AXI_SELECT_RULES.maxPositionPct}%`);
            return result;
        }
        console.log(`[RiskManager] ✅ Filter 6: Position size OK (${equityPct.toFixed(1)}% < ${AXI_SELECT_RULES.maxPositionPct}%)`);

        // ─── Filter 7: Max risk per trade (configurable % equity) ───
        const maxRiskUsd = equity * (AXI_SELECT_RULES.maxRiskPerTradePct / 100);
        const tradeRiskUsd = signal.notional_usd * (signal.stop_loss_pct / 100);
        if (tradeRiskUsd > maxRiskUsd) {
            const result = hardReject(
                `Trade risk $${tradeRiskUsd.toFixed(2)} > ${AXI_SELECT_RULES.maxRiskPerTradePct}% equity ($${maxRiskUsd.toFixed(2)}). Reduce el stop_loss_pct o el tamaño de la posición.`,
                "MAX_RISK_EXCEEDED", true
            );
            console.log(`[RiskManager] ❌ FILTER 7 FAILED: Risk $${tradeRiskUsd.toFixed(2)} > $${maxRiskUsd.toFixed(2)}`);
            return result;
        }
        console.log(`[RiskManager] ✅ Filter 7: Risk per trade OK ($${tradeRiskUsd.toFixed(2)})`);

        // ─── Filter 8: Correlation check ───
        const openPositions = this.paperEngine.getOpenPositionsSnapshot();
        const cryptoSymbols = ["BTC", "ETH", "SOL", "BTCUSDT", "ETHUSDT", "PEPEUSDT", "DOGEUSDT"];
        const equitySymbols = ["AAPL", "TSLA", "SPY"];

        const isCrypto = cryptoSymbols.includes(signal.symbol);
        const isEquity = equitySymbols.includes(signal.symbol);

        const sameMarketPositions = openPositions.filter((p: any) => {
            if (isCrypto) return cryptoSymbols.includes(p.symbol);
            if (isEquity) return equitySymbols.includes(p.symbol);
            return false;
        });

        if (sameMarketPositions.length >= 10) {
            const market = isCrypto ? "crypto" : "equities";
            const result = hardReject(
                `Ya hay ${sameMarketPositions.length} posiciones abiertas en ${market}. Máximo 10 por mercado.`,
                "CORRELATION_RISK"
            );
            broadcastAgentState("risk_manager", "rejected", `Correlation: ${market}`, "error");
            broadcastAgentLog("ceo", `⛔ Risk Guardian: Correlación excesiva en ${market}. Bloqueado.`, "warn");
            console.log(`[RiskManager] ❌ FILTER 8 FAILED: ${sameMarketPositions.length} ${market} positions open`);
            return result;
        }
        console.log(`[RiskManager] ✅ Filter 8: Correlation OK (${sameMarketPositions.length} ${isCrypto ? "crypto" : "equity"} positions)`);

        // ═══════════════════════════════════════════
        // ALL HARD FILTERS PASSED
        // ═══════════════════════════════════════════

        // AGGRESSIVE_SCALP_MODE: Skip LLM macro validation for memecoins, auto-approve
        if (isAggressive) {
            console.log(`[RiskManager] 🚀 AGGRESSIVE MODE: Skipping LLM macro check, auto-approving...`);
            broadcastAgentState("risk_manager", "deep_analysis", signal.symbol, "active");
            broadcastAgentLog("risk", `🚀 AGGRESSIVE SCALP: 8 filtros PASADOS. Auto-aprobando sin LLM.`, "success");

            try {
                const toolResult = await this.toolExecutor.execute("execute_trade", {
                    exchange: signal.exchange,
                    symbol: signal.symbol,
                    side: signal.action,
                    notional_usd: signal.notional_usd,
                    order_type: "MARKET",
                    stop_loss_pct: signal.stop_loss_pct,
                    take_profit_pct: signal.take_profit_pct,
                    leverage: (signal as any).leverage || MARKET_RULES.crypto.maxLeverage || 1,
                    trailing_stop_pct: (signal as any).trailing_stop_pct || 0.5, // Default 0.5% for aggressive scalp
                    rationale: `${signal.rationale} [AGGRESSIVE SCALPER]`,
                });
                const resultObj = JSON.parse(toolResult);

                await saveAgentMemory("risk_manager", "last_decision", JSON.stringify({
                    signal: { action: signal.action, symbol: signal.symbol, confidence: signal.confidence },
                    hardFilters: "ALL_PASSED",
                    llmDecision: "AUTO_APPROVE_AGGRESSIVE",
                    tradeResult: resultObj.success ? "EXECUTED" : "FAILED",
                    timestamp: new Date().toISOString(),
                }), this.paperEngine.userId).catch(() => { });

                if (resultObj.success) {
                    broadcastAgentState("risk_manager", "approved", `${signal.action} ${signal.symbol}`, "success");
                    console.log(`[RiskManager] ✅ AGGRESSIVE APROBADO: ${signal.action} ${signal.symbol} $${signal.notional_usd}`);
                    return { approved: true, action: "execute_trade", details: resultObj };
                } else {
                    return { approved: false, action: "EXECUTION_FAILED", details: resultObj };
                }
            } catch (err: any) {
                console.error("[RiskManager] Aggressive exec error:", err.message);
                return { approved: false, action: "ERROR", details: { error: err.message } };
            }
        }

        // ═══════════════════════════════════════════
        // STANDARD MODE — LLM macro context validation (Groq)
        // ═══════════════════════════════════════════

        console.log(`[RiskManager] 🧠 All 8 hard filters PASSED. Sending to Groq for macro context validation...`);
        broadcastAgentState("risk_manager", "deep_analysis", signal.symbol, "active");

        try {
            const userPrompt = `El Sentinel ha generado esta señal de trading que PASÓ TODOS los filtros matemáticos:

${JSON.stringify(signal, null, 2)}

Estado actual del portfolio:
- Balance: $${this.paperEngine.getTotalBalance().toFixed(2)}
- Equity: $${equity.toFixed(2)}
- DD Diario: ${effectiveDailyDD.toFixed(2)}% (límite: ${AXI_SELECT_RULES.maxDailyDrawdownPct}%)
- DD Máximo: ${effectiveMaxDD.toFixed(2)}% (límite: ${AXI_SELECT_RULES.maxTotalDrawdownPct}%)
- Posiciones abiertas: ${openPositions.length}
- PnL Total: $${this.paperEngine.getTotalPnL().toFixed(2)}
- Posiciones del mismo mercado: ${sameMarketPositions.length}/2

Fecha/hora UTC: ${new Date().toUTCString()}

Evalúa el contexto macroeconómico y los parámetros de riesgo. Responde en JSON:
{
  "decision": "APPROVE" | "REJECT" | "REJECT_WITH_FEEDBACK",
  "reason": "Explicación DETALLADÍSIMA del razonamiento de riesgo (ej: liquidez, drawdown, correlación, sentimiento macro)",
  "macro_risk": "LOW" | "MEDIUM" | "HIGH"
}`;

            const { data: decision, usage } = await askGroq<{
                decision: "APPROVE" | "REJECT" | "REJECT_WITH_FEEDBACK";
                reason: string;
                macro_risk: string;
            }>(
                getSystemPrompt(),
                userPrompt,
                { temperature: 0.0, maxTokens: 300, jsonMode: true }
            );

            if (!decision || !decision.decision) {
                console.warn("[RiskManager] LLM returned invalid decision. Rejecting for safety.");
                broadcastAgentState("risk_manager", "rejected", "Invalid LLM response", "error");
                return hardReject("LLM no produjo decisión válida. Rechazado por seguridad.", "RISK_REWARD_INSUFFICIENT");
            }

            const approved = decision.decision === "APPROVE";

            if (approved) {
                // Execute the trade via ToolExecutor
                const leverageVal = (signal as any).leverage || (signal.exchange.toLowerCase() === 'hyperliquid' ? MARKET_RULES.crypto.maxLeverage : 1);
                
                const toolResult = await this.toolExecutor.execute("execute_trade", {
                    exchange: signal.exchange,
                    symbol: signal.symbol,
                    side: signal.action,
                    notional_usd: signal.notional_usd,
                    order_type: "MARKET",
                    stop_loss_pct: signal.stop_loss_pct,
                    take_profit_pct: signal.take_profit_pct,
                    leverage: leverageVal,
                    trailing_stop_pct: (signal as any).trailing_stop_pct || 0,
                    rationale: `[TÉCNICO]: ${signal.rationale}\n\n[RIESGO/MACRO]: ${decision.reason}`,
                });
                const resultObj = JSON.parse(toolResult);

                // Save decision to Supabase
                await saveAgentMemory("risk_manager", "last_decision", JSON.stringify({
                    signal: { action: signal.action, symbol: signal.symbol, confidence: signal.confidence },
                    hardFilters: "ALL_PASSED",
                    llmDecision: "APPROVE",
                    macroRisk: decision.macro_risk,
                    reason: decision.reason,
                    tradeResult: resultObj.success ? "EXECUTED" : "FAILED",
                    tokens: { prompt: usage.promptTokens, completion: usage.completionTokens },
                    timestamp: new Date().toISOString(),
                }), this.paperEngine.userId);

                if (resultObj.success) {
                    broadcastAgentState("risk_manager", "approved", `${signal.action} ${signal.symbol}`, "success");
                    console.log(`[RiskManager] ✅ APROBADO: ${signal.action} ${signal.symbol} $${signal.notional_usd} | Macro: ${decision.reason}`);
                    return { approved: true, action: "execute_trade", details: resultObj };
                } else {
                    broadcastAgentState("risk_manager", "rejected", resultObj.error?.slice(0, 30) || "Execution failed", "error");
                    console.log(`[RiskManager] ❌ LLM aprobó pero ejecución falló: ${resultObj.error}`);
                    return { approved: false, action: "EXECUTION_FAILED", details: resultObj };
                }
            } else if (decision.decision === "REJECT_WITH_FEEDBACK") {
                await saveAgentMemory("risk_manager", "last_decision", JSON.stringify({
                    signal: { action: signal.action, symbol: signal.symbol, confidence: signal.confidence },
                    hardFilters: "ALL_PASSED",
                    llmDecision: "REJECT_WITH_FEEDBACK",
                    reason: decision.reason,
                    timestamp: new Date().toISOString(),
                }), this.paperEngine.userId).catch(() => { });

                broadcastAgentState("risk_manager", "feedback", decision.reason.slice(0, 30), "active");
                broadcastAgentLog("ceo", `🗣️ Risk Guardian exige ajuste: ${decision.reason}`, "warn");
                console.log(`[RiskManager] ⚠️ LLM pidiendo feedback: ${decision.reason}`);
                return { approved: false, action: "REJECT_WITH_FEEDBACK", details: { reason: decision.reason, macro_risk: decision.macro_risk } };
            } else {
                // LLM rejected — log it
                await saveAgentMemory("risk_manager", "last_decision", JSON.stringify({
                    signal: { action: signal.action, symbol: signal.symbol, confidence: signal.confidence },
                    hardFilters: "ALL_PASSED",
                    llmDecision: "REJECT",
                    macroRisk: decision.macro_risk,
                    reason: decision.reason,
                    tokens: { prompt: usage.promptTokens, completion: usage.completionTokens },
                    timestamp: new Date().toISOString(),
                }), this.paperEngine.userId).catch(() => { });

                broadcastAgentState("risk_manager", "rejected", decision.reason.slice(0, 30), "error");
                broadcastAgentLog("ceo", `⛔ Risk Guardian rechazó (contexto macro): ${decision.reason}`, "error");
                console.log(`[RiskManager] ❌ LLM RECHAZÓ: ${decision.reason} (Macro risk: ${decision.macro_risk})`);
                return { approved: false, action: "REJECTED", details: { reason: decision.reason, macro_risk: decision.macro_risk } };
            }

        } catch (error: any) {
            console.error("[RiskManager] Error en Groq:", error.message);
            broadcastAgentState("risk_manager", "error", error.message.slice(0, 30), "error");
            return { approved: false, action: "ERROR", details: { error: error.message } };
        }
    }

    /**
     * Hot-reloads a risk configuration value.
     */
    public updateConfig(key: string, value: any) {
        import("../config/ExchangeManager").then(({ updateRule }) => {
            updateRule(key, value);
        });
    }
}
