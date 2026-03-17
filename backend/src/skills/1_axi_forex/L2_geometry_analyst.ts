import { AnomalyAlert } from './L1_macro_screener';

export interface TacticalEvaluation {
    tactical_score: number; // 0 to 100
    analysis: string;
    geometry_patterns: string[];
}

// ═══════════════════════════════════════════
// TOOL DEFINITION (OpenAI Function Calling Format)
// ═══════════════════════════════════════════
export const AXI_L2_GEOMETRY_DEF = {
    type: "function" as const,
    function: {
        name: "evaluate_tactical_geometry",
        description: "El Soldado Táctico: Evalúa una anomalía del mercado utilizando conocimientos de Geometría, SMC, ICT Killzones, y FVG (basado en Cuaderno 1C). Retorna un JSON con el análisis geométrico y un tactical_score de 0 a 100.",
        parameters: {
            type: "object",
            properties: {
                anomaly_data: {
                    type: "string",
                    description: "JSON stringificado con los datos de la anomalía devueltos por El Sabueso."
                }
            },
            required: ["anomaly_data"]
        }
    }
};

// ═══════════════════════════════════════════
// TOOL IMPLEMENTATION
// ═══════════════════════════════════════════
export async function executeAxiL2Analyst(anomalyDataJson: string): Promise<string> {
    try {
        const alert: AnomalyAlert = JSON.parse(anomalyDataJson);
        const evaluation = await internalTacticalEvaluation(alert);
        return JSON.stringify({
            status: "TACTICAL_EVALUATION_COMPLETE",
            evaluation
        });
    } catch (error: any) {
        return JSON.stringify({ error: `Soldado Táctico falló al procesar los datos: ${error.message}` });
    }
}

/**
 * Lógica de simulación del LLM Táctico Rápido
 */
async function internalTacticalEvaluation(alert: AnomalyAlert): Promise<TacticalEvaluation> {
    console.log(`\n\x1b[36m[Soldado Táctico]\x1b[0m Evaluando anomalía severa (Trigger Z-Score) en ${alert.asset}...`);

    // Aquí irá la llamada al LLM (Llama-3 8B / Gemini Flash)
    // SYSTEM PROMPT inyectaría Cuaderno 1C
    await new Promise((resolve) => setTimeout(resolve, 500)); 

    const score = alert.severity > 6.5 ? 82 : 45;

    return {
        tactical_score: score,
        analysis: score >= 75 
            ? "Detecto una desviación estadística masiva en un FVG (Fair Value Gap) alcista en London Killzone. Liquidity Sweep confirmado. Alta probabilidad técnica." 
            : "Desviación brusca en rango lateral sin tomar liquidez. Patrón sucio y de baja convicción geométrica.",
        geometry_patterns: score >= 75 ? ["London Killzone", "Liquidity Sweep", "Bullish FVG"] : ["Choppy Range"]
    };
}
