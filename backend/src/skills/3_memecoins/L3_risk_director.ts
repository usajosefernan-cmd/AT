import { NarrativeEvaluation } from './L2_narrative_analyst';
import { MemeSpikeAlert } from './L1_momentum_screener';
import { VectorMemoryManager } from '../../memory/VectorMemoryManager';
import { getMarketRules } from '../../config/ExchangeManager';

export interface MemeRiskDecision {
    approved: boolean;
    size_usd: number;
    stop_loss: number;
    take_profit?: number;
    rationale: string;
}

// ═══════════════════════════════════════════
// TOOL DEFINITION (OpenAI Function Calling Format)
// ═══════════════════════════════════════════
export const MEME_L3_RISK_DEF = {
    type: "function" as const,
    function: {
        name: "evaluate_meme_risk",
        description: "L3 Risk & Portfolio Manager: Cortafuegos final para Memecoins. Evalúa riesgo según config de consola de mando.",
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

async function internalMemeRiskEvaluation(alert: MemeSpikeAlert, narrativeEval: NarrativeEvaluation): Promise<MemeRiskDecision> {
    console.log(`\x1b[35m[L3 Meme Risk]\x1b[0m Evaluando riesgo para ${alert.symbol} (Score: ${narrativeEval.tactical_score}, Phase: ${narrativeEval.pump_phase})...`);
    await new Promise(r => setTimeout(r, 300));

    // Leer reglas ESPECÍFICAS del mercado memecoins
    const rules = getMarketRules('memecoins');
    const maxPositionPct = rules.maxPositionPct;
    const maxRiskPerTrade = rules.maxRiskPerTradePct;

    // Cortafuegos: score mínimo 50 para pasar
    if (narrativeEval.tactical_score < 50) {
        return {
            approved: false,
            size_usd: 0,
            stop_loss: 0,
            rationale: `VETO: Score ${narrativeEval.tactical_score}/50 insuficiente. Phase: ${narrativeEval.pump_phase}.`
        };
    }

    // Si estamos en fase de Colapso, vetar
    if (narrativeEval.pump_phase === 'Colapso') {
        return {
            approved: false,
            size_usd: 0,
            stop_loss: 0,
            rationale: `VETO: Fase de Colapso detectada. Demasiado riesgo de rug pull.`
        };
    }

    // Memoria vectorial (errores pasados)
    try {
        const mistakes = await VectorMemoryManager.queryPastMistakes("3_memecoins", { phase: narrativeEval.pump_phase });
        if (mistakes.length >= 3) {
            return {
                approved: false,
                size_usd: 0,
                stop_loss: 0,
                rationale: `VETO (Memoria): ${mistakes.length} rug pulls registrados en condiciones similares.`
            };
        }
    } catch (e) {
        // Memoria no disponible, continuar
    }

    // Calcular posición desde reglas del mercado memecoins
    const accountEquity = 10000;
    const sizeUsd = Math.max(25, Math.round((accountEquity * maxPositionPct) / 100));

    // SL/TP: memes usan riesgo amplio por volatilidad
    const riskPct = (maxRiskPerTrade * 2) / 100; // Doble del config por volatilidad meme
    const slPrice = alert.alertPrice * (1 - riskPct);
    const tpPrice = alert.alertPrice * (1 + riskPct * 3); // R:R = 1:3 para memes

    console.log(`\x1b[32m[L3 Meme]\x1b[0m ✅ APROBADO: ${alert.symbol} | Size=$${sizeUsd} | Lev=${rules.maxLeverage}x | SL=${slPrice.toFixed(6)} | TP=${tpPrice.toFixed(6)} | Style=${rules.style} | MaxHold=${rules.maxHoldMinutes}min`);

    return {
        approved: true,
        size_usd: sizeUsd,
        stop_loss: parseFloat(slPrice.toFixed(8)),
        take_profit: parseFloat(tpPrice.toFixed(8)),
        rationale: `APROBADO. Phase=${narrativeEval.pump_phase}, Score=${narrativeEval.tactical_score}. Size=$${sizeUsd}. Lev=${rules.maxLeverage}x. Style=${rules.style}. R:R=1:3.`
    };
}

