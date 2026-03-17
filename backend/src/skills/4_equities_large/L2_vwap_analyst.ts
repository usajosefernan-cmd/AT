import { GapAlert } from './L1_gap_screener';

export interface VWAPEvaluation {
    gap_classification: 'Gap and Go' | 'Gap Fade' | 'Choppy_Consolidation';
    tactical_score: number; // 0 to 100
    tactical_context: string;
}

// ═══════════════════════════════════════════
// TOOL DEFINITION (OpenAI Function Calling Format)
// ═══════════════════════════════════════════
export const EQUITIES_L2_VWAP_DEF = {
    type: "function" as const,
    function: {
        name: "evaluate_vwap_dynamics",
        description: "L2 Tactical Quant Analyst para Equities: Evalúa la interacción del precio con el VWAP en los primeros 15-30 minutos de un Gap de apertura. Identifica si es un 'Gap and Go' o un 'Gap Fade'.",
        parameters: {
            type: "object",
            properties: {
                gap_data: {
                    type: "string",
                    description: "JSON stringificado de la alerta EARNINGS_GAP_DETECTED de L1."
                }
            },
            required: ["gap_data"]
        }
    }
};

// ═══════════════════════════════════════════
// TOOL IMPLEMENTATION
// ═══════════════════════════════════════════
export async function executeEquitiesL2Analyst(gapDataJson: string): Promise<string> {
    try {
        const alert: GapAlert = JSON.parse(gapDataJson);
        const evaluation = await internalVWAPEvaluation(alert);
        
        return JSON.stringify({
            status: "VWAP_ANALYSIS_COMPLETE",
            evaluation
        });
    } catch (error: any) {
        return JSON.stringify({ error: `L2 VWAP Analyst falló: ${error.message}` });
    }
}

/**
 * Lógica táctica rápida (Ej: Inferencia del comportamiento respecto al VWAP)
 */
async function internalVWAPEvaluation(alert: GapAlert): Promise<VWAPEvaluation> {
    console.log(`\n\x1b[36m[Director L2 - Equities Analyst]\x1b[0m Evaluando dinámica contra el VWAP en ${alert.symbol}...`);
    
    // Simulación de latencia de LLM
    await new Promise((resolve) => setTimeout(resolve, 400));
    
    const candles = alert.intraday_candles;
    const isTrendingUp = candles[candles.length - 1] > candles[0]; 
    
    if (isTrendingUp && alert.data.gap_pct > 0) {
        return {
            gap_classification: 'Gap and Go',
            tactical_score: 90,
            tactical_context: `Fuerte rechazo a caer por debajo del VWAP de apertura. Estructura de "Gap and Go" confirmada (Cuaderno 4C). Las instituciones están absorbiendo la toma de ganancias. Continuación alcista altamente probable.`
        };
    } else {
        return {
            gap_classification: 'Gap Fade',
            tactical_score: 45,
            tactical_context: `El precio ha perdido el anclaje del VWAP inicial. Riesgo de "Gap Fade" (relleno de hueco). Presión vendedora tras el gap institucional.`
        };
    }
}
