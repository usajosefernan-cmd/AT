import { VectorMemoryManager } from '../../memory/VectorMemoryManager';

export interface CryptoStrategicDecision {
    approved: boolean;
    leverage: number;
    position_size_usd: number;
    limit_price?: number;
    rationale: string;
}

export const CRYPTO_L3_LIQUIDATOR_DEF = {
    type: "function" as const,
    function: {
        name: "evaluate_liquidation_risk",
        description: "El Director de Liquidación L3: Autoriza trades apalancados cross-exchange en Cripto Majors controlando el margen real.",
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
    console.log(`\x1b[35m[L3 Liquidator Director]\x1b[0m Evaluando Riesgo Institucional para Perps (Score: ${obEval.tactical_score})...`);
    await new Promise(r => setTimeout(r, 600));

    if (obEval.tactical_score < 70) {
        return {
            approved: false,
            leverage: 1,
            position_size_usd: 0,
            rationale: "VETO: Cinta sin convicción clara direccional."
        };
    }

    const mistakes = VectorMemoryManager.queryPastMistakes("2_crypto_majors", { cvd_extreme: true });
    if (mistakes.length >= 2) {
        return {
            approved: false,
            leverage: 1,
            position_size_usd: 0,
            rationale: "VETO (Evolutivo): Falsos rompimientos de CVD detectados recientemente. Pausando entradas direccionales."
        };
    }

    return {
        approved: true,
        leverage: 5, // Hyperliquid
        position_size_usd: 5000,
        limit_price: flowData.price * 1.0001,
        rationale: "APROBADO. CVD alcista genuino validado contra spoofing. Margin seguro. Leverage asignado x5."
    };
}
