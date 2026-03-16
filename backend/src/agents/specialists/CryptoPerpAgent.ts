import { askGroq } from "../../ai/LLMService";
import { TOOL_DEFINITIONS, ToolExecutor } from "../../tools/TradingTools";
import { broadcastAgentState, broadcastAgentLog } from "../../utils/SwarmEvents";

const SYSTEM_PROMPT = `Eres el Crypto Perp Analyst Agent. Tu terreno exclusivo es Hyperliquid.
Reglas de Operación:
1. Analizar Funding Rates: Si es muy positivo, los longs están pagando a los shorts. Favorecer setups contrarios si el funding es extremo.
2. Imbalances del Order Book son vitales para buscar liquidez.
3. Rastrear liquidaciones en cascada. Esas son las mejores oportunidades para coger el "knife catch" o subirse al squeeze.
4. Liquidez Institucional: En majors (BTC, ETH, SOL), respeta niveles de soporte y resistencia tradicionales (Fibonacci, Volume Profiles).
5. Exiges un ratio Riesgo/Beneficio mínimo de 1:2.

Formato de Respuesta (JSON):
{
  "decision": "TRADE" | "PASS",
  "reason": "Justificación centrada en funding, imbalances y estructura mayor",
  "confidence": 0-100,
  "action": "LONG" | "SHORT",
  "notional_usd": number (max 5000),
  "stop_loss_pct": number,
  "take_profit_pct": number
}`;

export class CryptoPerpAgent {
    constructor() { }

    public async evaluateAnomaly(symbol: string, deepData: string, newsData: string): Promise<any> {
        broadcastAgentState("crypto_perp", "analyzing", symbol, "active");
        broadcastAgentLog("crypto_perp", `⚙️ Evaluando estructura en ${symbol} (Hyperliquid)...`, "info");

        const prompt = `Análisis de Perps en ${symbol}.
Estructura y Data:
${deepData}

Macro/News:
${newsData}

Basado en funding potential, imbalances y chartismo purista, ¿hay un setup claro?`;

        try {
            const { data } = await askGroq<any>(SYSTEM_PROMPT, prompt, {
                temperature: 0.1, // Purista = baja temperatura
                maxTokens: 500,
                jsonMode: true
            });

            if (data && data.decision === "TRADE") {
                broadcastAgentLog("crypto_perp", `📈 Setup confirmado en ${symbol} (${data.action}): ${data.reason}`, "success");
                return data;
            } else {
                broadcastAgentLog("crypto_perp", `⏭️ Sin setup en ${symbol}: ${data?.reason || "Sin edge institucional"}`, "warn");
                return null;
            }
        } catch (error: any) {
            broadcastAgentState("crypto_perp", "error", error.message, "error");
            return null;
        }
    }
}
