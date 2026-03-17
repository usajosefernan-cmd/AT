import { VectorMemoryManager } from '../../memory/VectorMemoryManager';
import { getMarketRules } from '../../config/ExchangeManager';

export interface CryptoStrategicDecision {
    approved: boolean;
    leverage: number;
    size_usd: number;
    stop_loss?: number;
    take_profit?: number;
    rationale: string;
}

export const CRYPTO_L3_LIQUIDATOR_DEF = {
    type: "function" as const,
    function: {
        name: "evaluate_liquidation_risk",
        description: "El Director de Liquidación L3: Autoriza trades en Cripto Majors controlando el riesgo según la configuración de la consola de mando.",
        parameters: {
            type: "object",
            properties: {
                orderbook_evaluation: {
                    type: "string",
                    description: "Evaluación táctica del L2."
                },
                flow_data: {
                    type: "string",
                    description: "Datos crudos del L1."
                }
            },
            required: ["orderbook_evaluation", "flow_data"]
        }
    }
};

export async function executeCryptoL3RiskManager(obEvalJson: string, flowDataJson: string): Promise<string> {
    try {
        const decision = await internalRiskEvaluation(JSON.parse(obEvalJson), JSON.parse(flowDataJson));
        return JSON.stringify({
            status: "STRATEGIC_DECISION_MADE",
            decision
        });
    } catch (e: any) {
        return JSON.stringify({ error: `Falló L3 Cripto: ${e.message}` });
    }
}

async function internalRiskEvaluation(obEval: any, flowData: any): Promise<CryptoStrategicDecision> {
    console.log(`\x1b[35m[L3 Liquidator Director]\x1b[0m Evaluando Riesgo para Perps (Score: ${obEval.tactical_score})...`);
    await new Promise(r => setTimeout(r, 300));

    // Leer reglas ESPECÍFICAS del mercado crypto (no globales)
    const rules = getMarketRules('crypto');
    const maxPositionPct = rules.maxPositionPct;
    const maxRiskPerTrade = rules.maxRiskPerTradePct;
    
    // Si L2 aprobó (score >= 50), L3 evalúa riesgo real
    if (obEval.tactical_score < 50) {
        return {
            approved: false,
            leverage: 1,
            size_usd: 0,
            rationale: `VETO: Score insuficiente (${obEval.tactical_score}/50). Sin confluencia.`
        };
    }

    // Consultar memoria vectorial por errores pasados
    try {
        const mistakes = await VectorMemoryManager.queryPastMistakes("2_crypto_majors", { cvd_extreme: true });
        if (mistakes.length >= 3) {
            return {
                approved: false,
                leverage: 1,
                size_usd: 0,
                rationale: `VETO (Memoria): ${mistakes.length} falsos rompimientos CVD recientes. Pausa temporal.`
            };
        }
    } catch (e) {
        // Memoria no disponible, continuar sin ella
    }

    // Calcular tamaño de posición basado en reglas del mercado crypto
    const accountEquity = 10000;
    const maxSizeUsd = (accountEquity * maxPositionPct) / 100;
    
    // Escalar tamaño según score: 50=mínimo, 100=máximo
    const scoreRatio = Math.min(1, (obEval.tactical_score - 50) / 50);
    const sizeUsd = Math.max(50, Math.round(maxSizeUsd * (0.3 + scoreRatio * 0.7)));

    // Unwrap flowData (puede venir anidado del L1)
    const raw = flowData.data || flowData;
    const price = raw.price || 0;
    
    // SL/TP basados en riesgo del mercado crypto
    const riskPct = maxRiskPerTrade / 100;
    const stopLoss = price > 0 ? price * (1 - riskPct) : undefined;
    const takeProfit = price > 0 ? price * (1 + riskPct * 2) : undefined;

    const maxLeverage = rules.maxLeverage;

    console.log(`\x1b[32m[L3 Crypto]\x1b[0m ✅ APROBADO: ${raw.symbol || '??'} | Size=$${sizeUsd} | SL=${stopLoss?.toFixed(2)} | TP=${takeProfit?.toFixed(2)} | Leverage=${maxLeverage}x | Score=${obEval.tactical_score}`);

    return {
        approved: true,
        leverage: maxLeverage,
        size_usd: sizeUsd,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        rationale: `APROBADO. Score=${obEval.tactical_score}. Size=$${sizeUsd} (${maxPositionPct}% max). Leverage=${maxLeverage}x. R:R=1:2.`
    };
}

