import { askGroq } from "../../ai/LLMService";
import { TOOL_DEFINITIONS, ToolExecutor } from "../../tools/TradingTools";
import { broadcastAgentState, broadcastAgentLog } from "../../utils/SwarmEvents";
import { isMarketOpen } from "../../config/ExchangeManager";

const SYSTEM_PROMPT = `Eres el Equities Analyst Agent. Eres un analista cuantitativo enfocado en acciones americanas.
Reglas de Operación (Alpaca):
1. Sólo emites órdenes si el mercado (NYSE/NASDAQ) está abierto.
2. Buscas ineficiencias intradiarias: Gaps de apertura (Morning Gaps) y reacciones post-reportes de ganancias (Earnings).
3. Buscas confirmación en Volumen institucional: el Precio debe moverse con fuerza y no quedarse atrapado en rangos.
4. Para setups swing (varios días), analizas EMA(21) vs EMA(50) diario y soporte macro.
5. El ratio de Riesgo/Beneficio mínimo es 1:2.

Formato de Respuesta (JSON):
{
  "decision": "TRADE" | "PASS",
  "reason": "Justificación centrada en gaps, earnings, sector rotation y volumen",
  "confidence": 0-100,
  "action": "LONG" | "SHORT",
  "notional_usd": number,
  "stop_loss_pct": number,
  "take_profit_pct": number
}`;

export class EquitiesAnalystAgent {
    constructor() { }

    public async evaluateAnomaly(symbol: string, deepData: string, newsData: string): Promise<any> {
        broadcastAgentState("equities_analyst", "analyzing", symbol, "active");
        broadcastAgentLog("equities_analyst", `📊 Analizando momentum y gaps en ${symbol} (Equities)...`, "info");

        // Regla dura: Verificar si el mercado de acciones está abierto
        if (!isMarketOpen("alpaca")) {
            broadcastAgentLog("equities_analyst", `💤 Mercado NYSE cerrado. Descartando setups intradía para ${symbol}.`, "warn");
            return null;
        }

        const prompt = `Análisis Institucional para ${symbol}.
Fundamentales/Noticias:
${newsData}

Data de Mercado:
${deepData}

Basado en tu edge (Gaps, Earnings, Relative Strength Sectorial), ¿existe una oportunidad operativa válida hoy?`;

        try {
            const { data } = await askGroq<any>(SYSTEM_PROMPT, prompt, {
                temperature: 0.3,
                maxTokens: 500,
                jsonMode: true
            });

            if (data && data.decision === "TRADE") {
                broadcastAgentLog("equities_analyst", `📈 Trade accionario formulado ${symbol}: ${data.reason}`, "success");
                return data;
            } else {
                broadcastAgentLog("equities_analyst", `⏭️ Sin setup válido en ${symbol}: ${data?.reason || "Sin condiciones"}`, "warn");
                return null;
            }
        } catch (error: any) {
            broadcastAgentState("equities_analyst", "error", error.message, "error");
            return null;
        }
    }
}
