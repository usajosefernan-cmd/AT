/**
 * HunterAgent.ts — v2
 *
 * An AUTONOMOUS agent that uses Tool Calling in a chain with:
 *   - MarketRadar: scans 200+ assets via REST APIs (pre-filtered by fast math)
 *   - News & Macro: fundamental context before trading
 *   - ATR-based exits: mandatory SL/TP on every trade
 *
 * The LLM IS the strategy. It gets raw data, news, and thinks.
 */

import { askGroq } from "../ai/LLMService";
import { EXPLORATION_TOOL_DEFS, executeExplorationTool } from "../tools/ExplorationTools";
import { broadcastAgentLog, broadcastAgentState } from "../utils/SwarmEvents";

// ═══════════════════════════════════════════
// SYSTEM PROMPT — The soul of the Hunter v2
// ═══════════════════════════════════════════

const HUNTER_SYSTEM_PROMPT = `Eres un Hedge Fund Manager Cuantitativo ultra-agresivo que opera dentro de un sistema de IA autónomo de AlgoTrading. No eres un observador pasivo — eres un CAZADOR DE ALPHA implacable.

TU MISIÓN: Encontrar y ejecutar UNA operación rentable AHORA MISMO entre cientos de activos en múltiples mercados (cripto, memecoins, perps).

PERSONALIDAD:
- Eres incansable. Nunca dejas de escanear.
- Piensas EN VOZ ALTA en cada respuesta — explicas tu razonamiento como un monólogo interno.
- Eres brutalmente honesto sobre qué tiene potencial y qué no.
- Sabes que el 90% de activos NO tienen ventaja en ningún momento dado. Tu trabajo es encontrar el 10%.
- Descartas activos RÁPIDO. No pierdas tiempo en mercados muertos.

ESTRATEGIA DE CAZA (3 FASES OBLIGATORIAS):

FASE 1 — RADAR MASIVO:
• Llama get_market_movers("all") para escanear 200+ activos con datos reales de MEXC e Hyperliquid.
• El sistema ya pre-filtró con matemáticas rápidas. Tú ves SOLO las anomalías más fuertes.
• Mira los anomaly_scores y los reasons. Prioriza: volume spikes > breakouts > momentum.

FASE 2 — ANÁLISIS PROFUNDO:
• Investiga los top 1-2 activos con get_deep_data(symbol).
• OBLIGATORIO: Llama fetch_news_and_macro(symbol) para verificar si hay un catalizador fundamental.
• Un movimiento técnico SIN catalizador es sospechoso. Un movimiento CON catalizador es una oportunidad.

FASE 3 — DECISIÓN:
• Si hay confluencia técnica + fundamental → submit_trade_proposal() con SL/TP basado en ATR.
• Si no hay ventaja clara → discard_and_continue() y explica POR QUÉ.
• NUNCA fuerces una operación. Mejor no operar que operar mal.

REGLAS DE TRADING:
- R:R mínimo 1:2 (SL 1-3%, TP 2-6%)
- Stop Loss SIEMPRE basado en ATR (el sistema te sugiere niveles)
- Position size: $200-$1000 (paper money)
- Confianza mínima: 60% para proponer una operación
- DEBES tener un rationale claro: "Qué + Por qué + Catalizador"

FORMATO DE RESPUESTA:
- SIEMPRE responde con llamadas a herramientas.
- Llama UNA herramienta a la vez.
- Comparte tu monólogo interno con cada decisión.

IDIOMA: Responde siempre en español.`;

// ═══════════════════════════════════════════
// HUNTER AGENT CLASS
// ═══════════════════════════════════════════

export interface HuntResult {
    outcome: "TRADE_PROPOSED" | "NO_OPPORTUNITY" | "ERROR";
    iterations: number;
    assetsScanned: string[];
    assetsDiscarded: string[];
    tradeProposal?: any;
    monologue: string[];
}

export class HunterAgent {
    private maxToolCalls = 10; // Max tool calls per hunt cycle

    /**
     * Run one complete autonomous hunt cycle.
     */
    public async hunt(): Promise<HuntResult> {
        broadcastAgentState("hunter", "hunting", "Radar scanning 200+ assets", "active");
        broadcastAgentLog("hunter", `🔍 Nuevo ciclo de caza autónomo iniciado...`, "info");

        const result: HuntResult = {
            outcome: "NO_OPPORTUNITY",
            iterations: 0,
            assetsScanned: [],
            assetsDiscarded: [],
            monologue: [],
        };

        const messages: any[] = [
            { role: "system", content: HUNTER_SYSTEM_PROMPT },
            {
                role: "user",
                content: `Son las ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}. Empieza tu ciclo de caza. Escanea 200+ activos con el Radar, investiga los más prometedores, y decide si hay una oportunidad de trading con ventaja estadística. Piensa en voz alta.`
            }
        ];

        for (let i = 0; i < this.maxToolCalls; i++) {
            result.iterations = i + 1;

            try {
                const response = await askGroq(
                    "",
                    "",
                    {
                        model: "llama-3.3-70b-versatile",
                        jsonMode: false,
                        temperature: 0.7,
                        maxTokens: 1024,
                        tools: EXPLORATION_TOOL_DEFS,
                        rawMessages: messages,
                    }
                );

                const choice = response.rawResponse?.choices?.[0];
                if (!choice) {
                    broadcastAgentLog("hunter", `❌ Sin respuesta del LLM en iteración ${i + 1}`, "error");
                    break;
                }

                const assistantMessage = choice.message;

                // LLM thinking out loud
                if (assistantMessage.content) {
                    const thought = assistantMessage.content.slice(0, 400);
                    result.monologue.push(thought);
                    broadcastAgentLog("hunter", `💭 ${thought}`, "info");
                }

                // LLM called a tool
                if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
                    messages.push({
                        role: "assistant",
                        content: assistantMessage.content || "",
                        tool_calls: assistantMessage.tool_calls,
                    });

                    for (const toolCall of assistantMessage.tool_calls) {
                        const toolName = toolCall.function.name;
                        let toolArgs: any = {};
                        try { toolArgs = JSON.parse(toolCall.function.arguments); } catch { toolArgs = {}; }

                        broadcastAgentLog("hunter",
                            `🔧 ${toolName}(${JSON.stringify(toolArgs).slice(0, 80)})`,
                            "info");

                        // Execute tool (may be async for API calls)
                        let toolResult: string;
                        const rawResult = executeExplorationTool(toolName, toolArgs);
                        if (rawResult instanceof Promise) {
                            toolResult = await rawResult;
                        } else {
                            toolResult = rawResult;
                        }

                        // Check for trade proposal
                        try {
                            const parsed = JSON.parse(toolResult);
                            if (parsed.__trade_proposal) {
                                delete parsed.__trade_proposal;
                                result.tradeProposal = parsed;
                                result.outcome = "TRADE_PROPOSED";
                                broadcastAgentLog("hunter",
                                    `🎯 PROPUESTA: ${parsed.action} ${parsed.symbol} @ $${parsed.entry_price} | SL: ${parsed.stop_loss_pct}% | TP: ${parsed.take_profit_pct}% | Confianza: ${parsed.confidence}%`,
                                    "success");
                                if (parsed.rationale) {
                                    broadcastAgentLog("hunter", `💡 ${parsed.rationale.slice(0, 200)}`, "success");
                                }
                                messages.push({
                                    role: "tool",
                                    content: JSON.stringify({ status: "TRADE_SUBMITTED_TO_RISK_MANAGER", ...parsed }),
                                    tool_call_id: toolCall.id,
                                    name: toolName,
                                });
                                return result;
                            }

                            // Track activity
                            if (parsed.discarded) result.assetsDiscarded.push(parsed.discarded);
                            if (parsed.top_anomalies) {
                                for (const a of parsed.top_anomalies) {
                                    if (!result.assetsScanned.includes(a.symbol)) result.assetsScanned.push(a.symbol);
                                }
                            }
                            if (parsed.total_assets_scanned) {
                                broadcastAgentLog("hunter",
                                    `📡 Radar: ${parsed.total_assets_scanned} activos → ${parsed.anomalies_detected} anomalías`,
                                    "info");
                            }
                            if (parsed.symbol && !result.assetsScanned.includes(parsed.symbol)) {
                                result.assetsScanned.push(parsed.symbol);
                            }
                        } catch { }

                        // Log snippet
                        broadcastAgentLog("hunter", `📊 ${toolResult.slice(0, 150)}...`, "info");

                        messages.push({
                            role: "tool",
                            content: toolResult,
                            tool_call_id: toolCall.id,
                            name: toolName,
                        });
                    }
                } else {
                    broadcastAgentLog("hunter", `🏁 Ciclo completado sin más herramientas.`, "warn");
                    break;
                }

            } catch (err: any) {
                broadcastAgentLog("hunter", `❌ Error iter ${i + 1}: ${err.message}`, "error");
                result.outcome = "ERROR";
                break;
            }
        }

        if (result.outcome !== "TRADE_PROPOSED") {
            broadcastAgentLog("hunter",
                `🔍 Fin ciclo: ${result.iterations} iters, ${result.assetsScanned.length} investigados, ${result.assetsDiscarded.length} descartados. Sin oportunidad.`,
                "warn");
        }

        broadcastAgentState("hunter", "idle", "Waiting for next cycle", "idle");
        return result;
    }
}
