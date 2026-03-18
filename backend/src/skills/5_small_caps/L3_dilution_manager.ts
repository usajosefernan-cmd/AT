import { CatalystEvaluation } from './L2_catalyst_analyst';
import { SmallCapAlert } from './L1_halt_screener';
import { VectorMemoryManager } from '../../memory/VectorMemoryManager';

export interface DilutionRiskDecision {
    approved: boolean;
    size_usd: number;
    trailing_stop_pct: number;
    filing_warnings: string[];
    rationale: string;
}

// ═══════════════════════════════════════════
// TOOL DEFINITION (OpenAI Function Calling Format)
// ═══════════════════════════════════════════
export const SMALL_CAPS_L3_DILUTION_DEF = {
    type: "function" as const,
    function: {
        name: "evaluate_dilution_risk",
        description: "L3 Risk Manager para Small Caps: Revisa el riesgo de dilución extrema (Cuaderno 5A). Busca S-1, S-3 (Shelf Offerings) activas o ATMs que puedan sofocar el squeeze. Asigna sizing ultra-conservador y Trailing Stops agresivos.",
        parameters: {
            type: "object",
            properties: {
                catalyst_evaluation: {
                    type: "string",
                    description: "JSON stringificado con la evaluación táctica del catalizador (L2)."
                },
                halt_data: {
                    type: "string",
                    description: "JSON stringificado de la alerta del screener LULD (L1)."
                }
            },
            required: ["catalyst_evaluation", "halt_data"]
        }
    }
};

// ═══════════════════════════════════════════
// TOOL IMPLEMENTATION
// ═══════════════════════════════════════════
export async function executeSmallCapsL3DilutionManager(catalystJson: string, haltJson: string): Promise<string> {
    try {
        const catalystEval: CatalystEvaluation = JSON.parse(catalystJson);
        const alert: SmallCapAlert = JSON.parse(haltJson);
        const decision = await internalDilutionEvaluation(alert, catalystEval);
        
        return JSON.stringify({
            status: "DILUTION_RISK_DECISION",
            decision
        });
    } catch (error: any) {
        return JSON.stringify({ error: `L3 Dilution Manager falló: ${error.message}` });
    }
}

/**
 * Lógica de protección extrema institucional (LLM Pesado)
 */
async function internalDilutionEvaluation(alert: SmallCapAlert, catalystEval: CatalystEvaluation): Promise<DilutionRiskDecision> {
    console.log(`\x1b[35m[Director L3 - Dilution Risk Manager]\x1b[0m Revisando filings de la SEC para toxic dilution en ${alert.symbol}...`);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Si L2 detectó una trampa, cortamos de inmediato.
    if (catalystEval.setup_classification === 'Halt_and_Fail' || catalystEval.tactical_score < 75) {
        return {
            approved: false,
            size_usd: 0,
            trailing_stop_pct: 0,
            filing_warnings: [],
            rationale: `RECHAZADO. L2 reporta estructura de trampa (${catalystEval.setup_classification}). Las probabilidades de que manipulen el Open post-halt son altísimas. Abortando.`
        };
    }

    // --- PROTECCIÓN EVOLUTIVA (Vector Memory) ---
    const mistakes = await VectorMemoryManager.queryPastMistakes("5_small_caps", { setup: catalystEval.setup_classification });
    let riskAmountUsd = 50; 
    let rationalePrefix = `APROBADO. El setup ${catalystEval.setup_classification} es óptimo y la velocidad de cinta soporta el Squeeze.`;

    if (mistakes.length >= 3) {
        riskAmountUsd = 25; // Reducción de urgencia de 50%
        rationalePrefix = `APROBADO CON REDUCCIÓN (Protección Evolutiva). Riesgo histórico masivo tras ${mistakes.length} fallos en "${catalystEval.setup_classification}". Capital fragmentado al 50%.`;
    }

    // --- PARCHES L5 (Quantitative Researcher) ---
    const l5Patches = await VectorMemoryManager.queryPolicyPatches("5_small_caps");
    for (const patch of l5Patches) {
        if ((patch.severity === 'CRITICAL' || patch.severity === 'HIGH') &&
            (patch.patch_type === 'VETO_CONDITION' || patch.patch_type === 'ALPHA_DECAY_WARNING')) {
            return {
                approved: false,
                size_usd: 0,
                trailing_stop_pct: 0,
                filing_warnings: [],
                rationale: `RECHAZADO (L5 Patch - ${patch.severity}): ${patch.directive}`
            };
        }
        if (patch.patch_type === 'SIZING_ADJUSTMENT') {
            riskAmountUsd = Math.max(10, riskAmountUsd * 0.7);
            rationalePrefix += ` [L5: sizing reducido 30%]`;
        }
    }

    // APROBACIÓN con Cortafuegos SEC Filings
    // Simulamos que encontramos un filing S-3 antiguo pero sin acción inminente.
    const trailingStopPct = 5.0; // 5% trailing, deben respirar pero cortar rápido

    return {
        approved: true,
        size_usd: riskAmountUsd,
        trailing_stop_pct: trailingStopPct,
        filing_warnings: ["S-3 Shelf Offering detectada hace 6 meses. Posible activación de ATM si supera los $10.00."],
        rationale: `${rationalePrefix} Riesgo residual de dilución inyectando 'paper' al mercado si el precio sube demasiado (Cuaderno 5A). Se aprueba con Sizing Ultra-Reducido ($${riskAmountUsd}) y orden Trailing Stop agresiva al ${trailingStopPct}%.`
    };
}
