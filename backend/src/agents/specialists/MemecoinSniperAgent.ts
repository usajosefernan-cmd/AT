import { askGroq } from "../../ai/LLMService";
import { TOOL_DEFINITIONS, ToolExecutor } from "../../tools/TradingTools";
import { broadcastAgentState, broadcastAgentLog } from "../../utils/SwarmEvents";
import { PaperExecutionEngine } from "../../engine/PaperExecutionEngine";

const SYSTEM_PROMPT = `Eres el Memecoin Sniper Agent. Te especializas EXCLUSIVAMENTE en memecoins y altcoins de muy baja capitalización en MEXC.
Tus reglas de oro:
1. IGNORAR RSI y MACD tradicionales. En memecoins no funcionan.
2. BUSCAR "Pump & Dump" setups: Volumen explosivo en los últimos 5 a 15 minutos.
3. El sentimiento de Twitter/Noticias importa más que la estructura a largo plazo.
4. Siempre operas RÁPIDO (Scalping). Stop Loss ceñidos (max 5%) pero Take Profits abiertos (mínimo el doble del riesgo, preferentemente 3x a 5x).
5. Si no hay catalizador de volumen o noticia, RECHAZA el token.

Formato de Respuesta (JSON):
{
  "decision": "TRADE" | "PASS",
  "reason": "Justificación basada en volumen y sentimiento corto plazo",
  "confidence": 0-100,
  "action": "LONG" | "SHORT",
  "notional_usd": number (max 500),
  "stop_loss_pct": number,
  "take_profit_pct": number
}`;

export class MemecoinSniperAgent {
    constructor() { }

    public async evaluateAnomaly(symbol: string, deepData: string, newsData: string): Promise<any> {
        broadcastAgentState("memecoin_sniper", "analyzing", symbol, "active");
        broadcastAgentLog("memecoin_sniper", `🔍 Analizando anomalía en ${symbol} (MEXC)...`, "info");

        const prompt = `Anomalía detectada en ${symbol}.
Datos Técnicos:
${deepData}

Noticias y Sentimiento:
${newsData}

Basado en tu especialidad, ¿debemos operar este pump/dump?`;

        try {
            const { data } = await askGroq<any>(SYSTEM_PROMPT, prompt, {
                temperature: 0.7,
                maxTokens: 500,
                jsonMode: true
            });

            if (data && data.decision === "TRADE") {
                broadcastAgentLog("memecoin_sniper", `🎯 Set up encontrado en ${symbol} (${data.action}). Confianza: ${data.confidence}%`, "success");
                return data;
            } else {
                broadcastAgentLog("memecoin_sniper", `⏭️ Descartado ${symbol}: ${data?.reason || "Sin setup claro"}`, "warn");
                return null;
            }
        } catch (error: any) {
            broadcastAgentState("memecoin_sniper", "error", error.message, "error");
            return null;
        }
    }
}
