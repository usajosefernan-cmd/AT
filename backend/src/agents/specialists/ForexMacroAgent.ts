import { askGroq } from "../../ai/LLMService";
import { TOOL_DEFINITIONS, ToolExecutor } from "../../tools/TradingTools";
import { broadcastAgentState, broadcastAgentLog } from "../../utils/SwarmEvents";

const SYSTEM_PROMPT = `Eres el Forex Macro Agent. Operas en el mercado de divisas y materias primas (Oro/Plata) usando Axi Select.
Reglas de Operación:
1. No usas alto apalancamiento bajo ninguna circunstancia (Reglas de prop firm estricta).
2. Analizas principalmente en base a Calendario Económico: Tipos de interés de bancos centrales, datos de NFP, CPI, e inflación.
3. El análisis técnico se subordina al contexto fundamental. Buscas zonas mayores de liquidez (Soporte/Resistencias en gráficos 4H o Diarios).
4. Requieres contexto de correlación de fuerza de la moneda relativa (ej: DXY fuerte debilita al EURUSD y al Oro).
5. Relación Riesgo/Beneficio mínima es 1:2.

Formato de Respuesta (JSON):
{
  "decision": "TRADE" | "PASS",
  "reason": "Explicación Macro (Tasas, Datos de Empleo) + Niveles de Precio técnico",
  "confidence": 0-100,
  "action": "LONG" | "SHORT",
  "notional_usd": number,
  "stop_loss_pct": number,
  "take_profit_pct": number
}`;

export class ForexMacroAgent {
    constructor() { }

    public async evaluateAnomaly(symbol: string, deepData: string, newsData: string): Promise<any> {
        broadcastAgentState("forex_macro", "analyzing", symbol, "active");
        broadcastAgentLog("forex_macro", `🌍 Rastreando variables macro para ${symbol} (Forex/Metals)...`, "info");

        const prompt = `Reporte Macro y Técnico para ${symbol}.
Datos Fundamentales y Noticias:
${newsData}

Data Técnica:
${deepData}

Considerando la narrativa global de los bancos centrales y la liquidez histórica del par, ¿hay un trade asimétrico justificable?`;

        try {
            const { data } = await askGroq<any>(SYSTEM_PROMPT, prompt, {
                temperature: 0.2, // Contexto serio macroeconomico
                maxTokens: 500,
                jsonMode: true
            });

            if (data && data.decision === "TRADE") {
                broadcastAgentLog("forex_macro", `💱 Señal Macro confirmada en ${symbol}: ${data.reason}`, "success");
                return data;
            } else {
                broadcastAgentLog("forex_macro", `⏭️ Sin catalizador macro en ${symbol}: ${data?.reason || "Esperando NFP/CPI"}`, "warn");
                return null;
            }
        } catch (error: any) {
            broadcastAgentState("forex_macro", "error", error.message, "error");
            return null;
        }
    }
}
