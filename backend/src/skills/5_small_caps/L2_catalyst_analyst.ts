import { SmallCapAlert } from './L1_halt_screener';

export interface CatalystEvaluation {
    catalyst_strength: 'A_TIER' | 'B_TIER' | 'TRAP';
    tactical_score: number; // 0 to 100
    setup_classification: 'ABCD_Pattern' | 'Halt_and_Fail' | 'Squeeze_Continuation';
    catalyst_context: string;
}

// ═══════════════════════════════════════════
// TOOL DEFINITION (OpenAI Function Calling Format)
// ═══════════════════════════════════════════
export const SMALL_CAPS_L2_CATALYST_DEF = {
    type: "function" as const,
    function: {
        name: "evaluate_small_cap_catalyst",
        description: "L2 Tactical Analyst para Small Caps: Analiza la velocidad de la cinta, la estructura ABCD post-halt (Cuaderno 5C) y clasifica el catalizador subyacente (FDA, PR, Earnings) en los Cuadernos 5B.",
        parameters: {
            type: "object",
            properties: {
                halt_data: {
                    type: "string",
                    description: "JSON stringificado de la alerta SMALL_CAP_HALT_DETECTED de L1."
                }
            },
            required: ["halt_data"]
        }
    }
};

// ═══════════════════════════════════════════
// TOOL IMPLEMENTATION
// ═══════════════════════════════════════════
export async function executeSmallCapsL2Analyst(haltDataJson: string): Promise<string> {
    try {
        const alert: SmallCapAlert = JSON.parse(haltDataJson);
        const evaluation = await internalCatalystEvaluation(alert);
        
        return JSON.stringify({
            status: "CATALYST_ANALYSIS_COMPLETE",
            evaluation
        });
    } catch (error: any) {
        return JSON.stringify({ error: `L2 Catalyst Analyst falló: ${error.message}` });
    }
}

/**
 * Lógica táctica rápida (LLM evaluando micro-estructura The Tape y Patrones)
 */
async function internalCatalystEvaluation(alert: SmallCapAlert): Promise<CatalystEvaluation> {
    console.log(`\n\x1b[36m[Director L2 - Small Caps Analyst]\x1b[0m Evaluando Tape Velocity y Setup ABCD en ${alert.symbol}...`);
    
    // Simulación de latencia de LLM
    await new Promise((resolve) => setTimeout(resolve, 400));
    
    // Si la velocidad de la cinta es insana y el flotante es micro
    if (alert.tape_velocity > 100) {
        return {
            catalyst_strength: 'A_TIER',
            tactical_score: 88,
            setup_classification: 'ABCD_Pattern',
            catalyst_context: `Velocidad de cinta crítica (${alert.tape_velocity} trades/sec) superando el umbral de absorción retail. Patrón ABCD formándose justo debajo de la resistencia pre-halt. Catalizador detectado: Aprobación Fast-Track FDA (Cuaderno 5B). Alta probabilidad de compresión de cortos (Short Squeeze).`
        };
    } else {
        return {
            catalyst_strength: 'TRAP',
            tactical_score: 30,
            setup_classification: 'Halt_and_Fail',
            catalyst_context: `Pump artificial sin catalizador real (Wash Trading detectado, Cuaderno 5C). Falta de velocidad en el Level 2. Probable trampa para retail seguida de un Halt a la baja (LULD DOWN).`
        };
    }
}
