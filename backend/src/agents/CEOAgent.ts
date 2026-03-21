/**
 * CEOAgent.ts
 *
 * El orquestador supremo. Lee de Telegram, gestiona Supabase,
 * y toma decisiones estratégicas de alto nivel.
 *
 * Usa Groq llama-3.3-70b-versatile (bueno y barato) para decisiones CEO.
 * Gemini como backup si Groq falla.
 */

import { askGroq } from "../ai/LLMService";
import { TOOL_DEFINITIONS, ToolExecutor } from "../tools/TradingTools";
import { PaperExecutionEngine } from "../engine/PaperExecutionEngine";
import { broadcastAgentState } from "../utils/SwarmEvents";
import {
    getAgentMemory,
    getAllAgentMemories,
    saveAgentMemory,
} from "../utils/supabaseClient";
import { ProfileParser } from "./ProfileParser";

// El Prompt se carga dinámicamente desde ProfileParser.getProfile("CEO")

// ═══════════════════════════════════════════
// CEO Tools: todas disponibles
// ═══════════════════════════════════════════

const CEO_TOOLS = TOOL_DEFINITIONS;

export class CEOAgent {
    private toolExecutor: ToolExecutor;
    private paperEngine: PaperExecutionEngine;
    private latestPrices: Record<string, number>;

    constructor(
        paperEngine: PaperExecutionEngine,
        latestPrices: Record<string, number>,
        onForceAnalysis?: () => Promise<any>
    ) {
        this.paperEngine = paperEngine;
        this.latestPrices = latestPrices;
        this.toolExecutor = new ToolExecutor(paperEngine, latestPrices, "PAPER", onForceAnalysis);
    }

    /**
     * Procesa un mensaje del usuario (desde Telegram o Dashboard Chat).
     * Usa Groq 70B para decisiones inteligentes con tool calling.
     */
    public async processMessage(userMessage: string): Promise<string> {
        broadcastAgentState("ceo", "processing", userMessage.slice(0, 30), "active");

        try {
            const contextBlock = `${userMessage}

CONTEXTO ACTUAL:
- Balance: $${this.paperEngine.getTotalBalance().toFixed(2)}
- Equity: $${this.paperEngine.getTotalEquity().toFixed(2)}
- DD Diario Máximo: ${this.paperEngine.getMaxDailyDrawdownPct().toFixed(2)}%
- DD Total Máximo: ${this.paperEngine.getMaxTotalDrawdownPct().toFixed(2)}%
- Posiciones abiertas: ${this.paperEngine.getTotalPositionsCount()}
- PnL acumulado: $${this.paperEngine.getTotalPnL().toFixed(2)}
- Precios actuales: ${JSON.stringify(this.latestPrices)}
- Hora UTC: ${new Date().toUTCString()}`;

            // CEO usa el modelo MÁS INTELIGENTE: Gemini 2.5 Pro
            // Se pasa como modelo especial → askGroq intentará Groq primero
            // pero necesitamos Gemini Pro aquí, así que usamos geminiClient directo
            const { data: content, rawResponse } = await askGroq<string>(
                ProfileParser.getProfile("CEO"),
                contextBlock,
                {
                    model: "gemini-3.1-pro-preview",  // Modelo TOP de Google
                    tools: CEO_TOOLS,
                    toolChoice: "auto",
                    temperature: 0.3,
                    maxTokens: 1000,
                    jsonMode: false,
                }
            );

            // Check tool calls from raw response
            const message = rawResponse?.choices?.[0]?.message;
            if (message?.tool_calls && message.tool_calls.length > 0) {
                const toolResults: { tool_call_id: string; content: string }[] = [];

                for (const call of message.tool_calls) {
                    const args = JSON.parse(call.function.arguments);
                    const result = await this.toolExecutor.execute(call.function.name, args);
                    toolResults.push({ tool_call_id: call.id, content: result });
                }

                // Follow-up con tool results via Gemini 2.5 Pro
                const { data: followUp } = await askGroq<string>(
                    ProfileParser.getProfile("CEO"),
                    userMessage,
                    {
                        model: "gemini-3.1-pro-preview",
                        temperature: 0.3,
                        maxTokens: 800,
                        jsonMode: false,
                        rawMessages: [
                            { role: "system", content: ProfileParser.getProfile("CEO") },
                            { role: "user", content: userMessage },
                            message,
                            ...toolResults.map(r => ({
                                role: "tool",
                                tool_call_id: r.tool_call_id,
                                content: r.content,
                            })),
                        ],
                    }
                );

                broadcastAgentState("ceo", "monitoring", undefined, "idle");
                return followUp || "Sin respuesta.";
            }

            broadcastAgentState("ceo", "monitoring", undefined, "idle");
            return content || message?.content || "Sin respuesta del modelo.";

        } catch (error: any) {
            console.error("[CEOAgent] Error:", error.message);
            broadcastAgentState("ceo", "error", error.message.slice(0, 30), "error");
            return `Error interno: ${error.message}`;
        }
    }

    /**
     * Genera un resumen diario del portfolio (se ejecuta a medianoche UTC).
     */
    public async generateDailyReport(): Promise<string> {
        const riskMemory = await getAgentMemory("risk_manager", "last_decision", this.paperEngine.userId);

        const report = [
            `📊 *REPORTE DIARIO — ${new Date().toISOString().split("T")[0]}*`,
            ``,
            `💰 Balance: $${this.paperEngine.getTotalBalance().toFixed(2)}`,
            `📈 Equity: $${this.paperEngine.getTotalEquity().toFixed(2)}`,
            `📉 DD Diario: ${this.paperEngine.getMaxDailyDrawdownPct().toFixed(2)}%`,
            `📉 DD Total: ${this.paperEngine.getMaxTotalDrawdownPct().toFixed(2)}%`,
            `📊 PnL Total: $${this.paperEngine.getTotalPnL().toFixed(2)}`,
            `🔓 Posiciones abiertas: ${this.paperEngine.getTotalPositionsCount()}`,
            `📝 Trades cerrados hoy: ${this.paperEngine.getTotalClosedCount()}`,
            ``,
            `Última decisión del Risk Manager:`,
            riskMemory ? riskMemory.content.slice(0, 200) : "Sin decisiones registradas.",
        ].join("\n");

        await saveAgentMemory("ceo", "daily_report", report, this.paperEngine.userId);
        return report;
    }
}
