import { MemeSpikeAlert } from './L1_momentum_screener';

export interface NarrativeEvaluation {
    pump_phase: 'Acumulación' | 'Parabólico' | 'Distribución' | 'Colapso';
    tactical_score: number; // 0 to 100
    narrative_context: string;
}

// ═══════════════════════════════════════════
// TOOL DEFINITION (OpenAI Function Calling Format)
// ═══════════════════════════════════════════
export const MEME_L2_NARRATIVE_DEF = {
    type: "function" as const,
    function: {
        name: "evaluate_meme_narrative",
        description: "L2 Tactical Quant Analyst: LLM Rápido evaluando un asset de Meme. Usa Cuadernos 3B y 3C (Dip and Rip, Tape Reading). Detecta en qué fase del Pump & Dump está el activo. Retorna JSON con pump_phase y tactical_score.",
        parameters: {
            type: "object",
            properties: {
                spike_data: {
                    type: "string",
                    description: "JSON stringificado de la alerta MEME_MOMENTUM_SPIKE del L1."
                }
            },
            required: ["spike_data"]
        }
    }
};

// ═══════════════════════════════════════════
// TOOL IMPLEMENTATION
// ═══════════════════════════════════════════
export async function executeMemeL2Analyst(spikeDataJson: string): Promise<string> {
    try {
        const alert: MemeSpikeAlert = JSON.parse(spikeDataJson);
        const evaluation = await internalNarrativeEvaluation(alert);
        
        return JSON.stringify({
            status: "NARRATIVE_ANALYSIS_COMPLETE",
            evaluation
        });
    } catch (error: any) {
        return JSON.stringify({ error: `L2 Narrative Analyst falló: ${error.message}` });
    }
}

/**
 * Lógica LLM Táctica Rápida (Ej: Gemini Flash)
 */
async function internalNarrativeEvaluation(alert: MemeSpikeAlert): Promise<NarrativeEvaluation> {
    console.log(`\n\x1b[36m[Director L2 - Memecoins]\x1b[0m Evaluando la narrativa y fase del Pump en ${alert.symbol}...`);
    
    // Aquí el System Prompt inyecta reglas de Serie 3C (Dip and Rip, Momentum)
    // Constante latencia simulando inferencia rápida (~400ms)
    await new Promise((resolve) => setTimeout(resolve, 400));
    
    // Simulamos la detección del patrón basada en la historia de precios
    const isDipAndRip = alert.priceHistory[alert.priceHistory.length - 1] > alert.priceHistory[alert.priceHistory.length - 2];
    
    if (isDipAndRip && alert.rvol > 2.0) {
        return {
            pump_phase: 'Parabólico',
            tactical_score: 85,
            narrative_context: `RVOL Extremo (${alert.rvol}x). Patrón claro de Dip and Rip de manual (Cuaderno 3C) en timeframe de 1m. Alta velocidad en la cinta. Momentum puro.`
        };
    } else {
        return {
            pump_phase: 'Distribución',
            tactical_score: 40,
            narrative_context: `Se advierte absorción institucional oculta. Las órdenes Iceberg están frenando la subida a pesar del RVOL (${alert.rvol}x). Peligro inminente de trampa alcista.`
        };
    }
}
