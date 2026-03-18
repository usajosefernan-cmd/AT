import { TacticalEvaluation } from './L2_geometry_analyst';
import { AnomalyAlert } from './L1_macro_screener';
import { VectorMemoryManager } from '../../memory/VectorMemoryManager';
import { MarkdownParser } from '../../utils/MarkdownParser';
import { askGroq } from '../../ai/LLMService';

export interface StrategicDecision {
    decision: "PASS" | "REJECT";
    reasoning: string;
    kelly_percentage_full: number;
    fractional_kelly_applied: string;
    allocated_capital_usd: number;
    recommended_lot_size: number;
}

// ═══════════════════════════════════════════
// TOOL DEFINITION (OpenAI Function Calling Format)
// ═══════════════════════════════════════════
export const AXI_L3_RISK_DEF = {
    type: "function" as const,
    function: {
        name: "evaluate_strategic_risk",
        description: "L3 Risk Manager. Evalúa la táctica del L2. Decide tamaño de posición, Kelly Críterion y protege el Trailing Drawdown de Axi Select.",
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
 * Invocación al cerebro LLM usando OpenClaw Markdown Identity
 */
async function internalStrategicEvaluation(alert: AnomalyAlert, tacticalEval: TacticalEvaluation): Promise<StrategicDecision | { error: string }> {
    console.log(`\x1b[35m[Axi L3 Risk]\x1b[0m Evaluando propuesta táctica con identidad Markdown...`);

    // --- PROTECCIÓN EVOLUTIVA (Vector Memory) ---
    const mistakes = await VectorMemoryManager.queryPastMistakes("1_axi_forex", { pattern: tacticalEval.geometry_patterns.join(',') });
    if (mistakes.length >= 3) {
        console.warn(`\x1b[33m[Axi L3 Risk] VETO Automático:\x1b[0m 3 Fallos históricos consecutivos en '${tacticalEval.geometry_patterns.join(',')}'.`);
        return {
            decision: "REJECT",
            reasoning: `VETO (Protección Evolutiva): La memoria histórica indica que fallamos ${mistakes.length} veces seguidas operando este mismo patrón. Reduciendo riesgo a 0 para proteger Drawdown.`,
            kelly_percentage_full: 0,
            fractional_kelly_applied: "0",
            allocated_capital_usd: 0,
            recommended_lot_size: 0
        };
    }

    // --- PARCHES L5 (Quantitative Researcher) ---
    const l5Patches = await VectorMemoryManager.queryPolicyPatches("1_axi_forex");
    const criticalPatches = l5Patches.filter(p => p.severity === 'CRITICAL' || p.severity === 'HIGH');
    // VETO automático si algún parche CRITICAL afecta a los setups actuales
    for (const patch of criticalPatches) {
        if (patch.patch_type === 'VETO_CONDITION' || patch.patch_type === 'ALPHA_DECAY_WARNING') {
            console.warn(`\x1b[33m[Axi L3 Risk] VETO L5:\x1b[0m [${patch.severity}] ${patch.directive.substring(0, 100)}`);
            return {
                decision: "REJECT",
                reasoning: `VETO (L5 Policy Patch - ${patch.severity}): ${patch.directive}`,
                kelly_percentage_full: 0,
                fractional_kelly_applied: "0",
                allocated_capital_usd: 0,
                recommended_lot_size: 0
            };
        }
    }

    // 1. Extraer la Mente / Conocimiento Ontológico
    const systemPrompt = MarkdownParser.getSkillContext("1_axi_forex/L3_Strategic_Risk");

    // 2. Componer el mensaje al LLM (incluyendo parches L5 como contexto)
    const l5Context = l5Patches.length > 0
        ? `\n\nDIRECTIVAS L5 (QUANTITATIVE RESEARCHER — Parches de Política Activos):\n${l5Patches.map(p => `- [${p.severity}][${p.patch_type}] ${p.directive}`).join('\n')}\n`
        : '';

    const userPrompt = `
EVALUACIÓN ESTRATÉGICA REQUERIDA (AXI SELECT)
---------------------------------------------
ANOMALÍA L1:
${JSON.stringify(alert, null, 2)}

ANÁLISIS TÁCTICO L2:
${JSON.stringify(tacticalEval, null, 2)}
${l5Context}
Aplica tu conocimiento y reglas de Kelly/Trailing Drawdown para emitir el veredicto final en JSON estricto.
`;

    // 3. Llamar a Groq (Llama 3.3 70B es ideal para L3 reasoning)
    const result = await askGroq<StrategicDecision>(
        systemPrompt,
        userPrompt,
        {
            model: "llama-3.3-70b-versatile",
            jsonMode: true,
            temperature: 0.1 // Baja temperatura para decisiones de riesgo frías
        }
    );

    return result.data;
}
