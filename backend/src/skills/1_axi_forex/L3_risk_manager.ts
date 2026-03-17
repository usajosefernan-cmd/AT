import { TacticalEvaluation } from './L2_geometry_analyst';
import { AnomalyAlert } from './L1_macro_screener';
import { VectorMemoryManager } from '../../memory/VectorMemoryManager';

export interface StrategicDecision {
    approved: boolean;
    position_size: number;
    stop_loss: number;
    rationale: string;
}

// ═══════════════════════════════════════════
// TOOL DEFINITION (OpenAI Function Calling Format)
// ═══════════════════════════════════════════
export const AXI_L3_RISK_DEF = {
    type: "function" as const,
    function: {
        name: "evaluate_strategic_risk",
        description: "El General: IA de Máximo Razonamiento. Revisa la propuesta táctica del Soldado usando Inteligencia Macro, Reglas Axi Select (Cuaderno 1A) y Correlación Dinámica (Cuaderno 1B). Decide si se aprueba el trade, calculando Size via Kelly Criterion y Stop Loss estricto.",
        parameters: {
            type: "object",
            properties: {
                tactical_evaluation: {
                    type: "string",
                    description: "JSON stringificado con la evaluación táctica devuelta por El Soldado."
                },
                anomaly_data: {
                    type: "string",
                    description: "JSON stringificado con los datos originales de la anomalía."
                }
            },
            required: ["tactical_evaluation", "anomaly_data"]
        }
    }
};

// ═══════════════════════════════════════════
// TOOL IMPLEMENTATION
// ═══════════════════════════════════════════
export async function executeAxiL3RiskManager(tacticalEvalJson: string, anomalyDataJson: string): Promise<string> {
    try {
        const tacticalEval: TacticalEvaluation = JSON.parse(tacticalEvalJson);
        const alert: AnomalyAlert = JSON.parse(anomalyDataJson);
        const decision = await internalStrategicEvaluation(alert, tacticalEval);
        
        return JSON.stringify({
            status: "STRATEGIC_DECISION_MADE",
            decision
        });
    } catch (error: any) {
        return JSON.stringify({ error: `El General falló al procesar los datos: ${error.message}` });
    }
}

/**
 * Lógica de simulación del LLM Estratégico Pesado
 */
async function internalStrategicEvaluation(alert: AnomalyAlert, tacticalEval: TacticalEvaluation): Promise<StrategicDecision> {
    console.log(`\x1b[35m[General Riesgo]\x1b[0m Evaluando propuesta táctica (Score: ${tacticalEval.tactical_score}/100)...`);

    // Aquí irá la llamada al LLM pesado (Claude 3.5 Sonnet / Groq 70B)
    // SYSTEM PROMPT inyectaría Cuadernos 1A y 1B (Axi Select Rules, Markov, Kelly)
    await new Promise((resolve) => setTimeout(resolve, 1200));

    if (tacticalEval.tactical_score < 75) {
        return {
            approved: false,
            position_size: 0,
            stop_loss: 0,
            rationale: "VETO: El informe táctico es débil. Riesgo de ruina innecesario frente a los límites dinámicos (Trailing Drawdown) de Axi Select."
        };
    }

    // --- PROTECCIÓN EVOLUTIVA (Vector Memory) ---
    const mistakes = await VectorMemoryManager.queryPastMistakes("1_axi_forex", { pattern: tacticalEval.geometry_patterns.join(',') });
    if (mistakes.length >= 3) {
        return {
            approved: false,
            position_size: 0,
            stop_loss: 0,
            rationale: `VETO (Protección Evolutiva): La memoria histórica indica que fallamos ${mistakes.length} veces seguidas operando este mismo patrón. Reduciendo riesgo a 0 para proteger Drawdown.`
        };
    }

    const sl = alert.triggerPrice * 0.995;
    return {
        approved: true,
        position_size: 1.25, // Kelly fractional
        stop_loss: parseFloat(sl.toFixed(5)),
        rationale: `APROBADO. Condiciones de régimen estables (Markov-switching). Confluencia táctica: '${tacticalEval.geometry_patterns.join(',')}'. Kelly Criterion asigna 1.25% para proteger Trailing Drawdown de Axi Select.`
    };
}
