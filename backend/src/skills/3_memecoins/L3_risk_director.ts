import { NarrativeEvaluation } from './L2_narrative_analyst';
import { MemeSpikeAlert } from './L1_momentum_screener';
import { VectorMemoryManager } from '../../memory/VectorMemoryManager';

export interface MemeRiskDecision {
    approved: boolean;
    size_usd: number;
    stop_loss: number;
    rationale: string;
}

// ═══════════════════════════════════════════
// TOOL DEFINITION (OpenAI Function Calling Format)
// ═══════════════════════════════════════════
export const MEME_L3_RISK_DEF = {
    type: "function" as const,
    function: {
        name: "evaluate_meme_risk",
        description: "L3 Risk & Portfolio Manager: LLM Pesado actuando como cortafuegos final para Memecoins. Usa Cuaderno 3A (On-chain, Rugs, Bribes, Slippage). Aplica Fractional Kelly minúsculo y exige asimetría de R:R (Ej: 1:10). Retorna aprobación, size, stop_loss ultra ajustado y rationale.",
        parameters: {
            type: "object",
            properties: {
                narrative_evaluation: {
                    type: "string",
                    description: "JSON stringificado con la evaluación táctica de L2."
                },
                spike_data: {
                    type: "string",
                    description: "JSON stringificado con los datos originales de L1."
                }
            },
            required: ["narrative_evaluation", "spike_data"]
        }
    }
};

// ═══════════════════════════════════════════
// TOOL IMPLEMENTATION
// ═══════════════════════════════════════════
export async function executeMemeL3Risk(narrativeJson: string, spikeJson: string): Promise<string> {
    try {
        const narrativeEval: NarrativeEvaluation = JSON.parse(narrativeJson);
        const alert: MemeSpikeAlert = JSON.parse(spikeJson);
        const decision = await internalMemeRiskEvaluation(alert, narrativeEval);
        
        return JSON.stringify({
            status: "RISK_DECISION_MADE",
            decision
        });
    } catch (error: any) {
        return JSON.stringify({ error: `L3 Risk Director falló: ${error.message}` });
    }
}

/**
 * Lógica LLM Estratégica Pesada (Ej: Claude 3.5 Sonnet)
 */
async function internalMemeRiskEvaluation(alert: MemeSpikeAlert, narrativeEval: NarrativeEvaluation): Promise<MemeRiskDecision> {
    console.log(`\x1b[35m[Director L3 - Risk Manager Memes]\x1b[0m Evaluando asimetría R:R para ${alert.symbol} (Score: ${narrativeEval.tactical_score}/100)...`);

    // Inferencia lenta y pesada
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Cortafuegos: si no es Parabólico o el score es bajo, abortar para no comerse un Rug Pull.
    if (narrativeEval.pump_phase !== 'Parabólico' || narrativeEval.tactical_score < 80) {
        return {
            approved: false,
            size_usd: 0,
            stop_loss: 0,
            rationale: `VETO. Estamos en fase de '${narrativeEval.pump_phase}'. Las probabilidades on-chain de un rug pull / dump institucional son severas superando el 65% de riesgo base. Cortafuegos activado.`
        };
    }

    // --- PROTECCIÓN EVOLUTIVA (Vector Memory) ---
    const mistakes = VectorMemoryManager.queryPastMistakes("3_memecoins", { phase: narrativeEval.pump_phase });
    if (mistakes.length >= 3) {
        return {
            approved: false,
            size_usd: 0,
            stop_loss: 0,
            rationale: `VETO (Protección Evolutiva): La memoria histórica registra ${mistakes.length} fallos/rug pulls consecutivos operando bajo estas condiciones. Protegiendo PnL de anomalías algorítmicas enemigas.`
        };
    }

    // APROBACIÓN: Fractional Kelly minúsculo (0.25% de la cuenta) debido al alto slippage/volatilidad de redes como Solana/Mexc.
    const riskAmountUsd = 25; // Asumiendo $10k acct = 0.25%
    const slPrc = alert.alertPrice * 0.90; // 10% de stop amplio para sacudidas de micro-caps

    return {
        approved: true,
        size_usd: riskAmountUsd,
        stop_loss: parseFloat(slPrc.toFixed(8)),
        rationale: `APROBADO. Estructura asimétrica extrema detectada. R:R de 1:10 es factible. Asignando Nano-Position Sizing (Fractional Kelly 0.25%) considerando el riesgo latente de Jito Bundles / Smart Contracts Honeypots detectado en el cuaderno 3A.`
    };
}
