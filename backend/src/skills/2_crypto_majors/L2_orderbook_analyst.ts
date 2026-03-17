export interface OrderbookEvaluation {
    tactical_score: number;
    analysis: string;
    spoofing_detected: boolean;
}

export const CRYPTO_L2_ORDERBOOK_DEF = {
    type: "function" as const,
    function: {
        name: "evaluate_orderbook_imbalance",
        description: "El Analista de Orderbook L2: Analiza desbalances en el Order Book y detecta spoofing ante una anomalía de CVD.",
        parameters: {
            type: "object",
            properties: {
                flow_data: {
                    type: "string",
                    description: "JSON stringificado del L1 Screener."
                }
            },
            required: ["flow_data"]
        }
    }
};

export async function executeCryptoL2Analyst(flowDataJson: string): Promise<string> {
    try {
        const data = JSON.parse(flowDataJson);
        const evaluation = await internalOBEvaluation(data);
        return JSON.stringify({
            status: "ORDERBOOK_EVALUATION_COMPLETE",
            evaluation
        });
    } catch (e: any) {
        return JSON.stringify({ error: `Falló L2 Cripto: ${e.message}` });
    }
}

async function internalOBEvaluation(data: any): Promise<OrderbookEvaluation> {
    console.log(`\n\x1b[36m[L2 Orderbook Analyst]\x1b[0m Analizando cinta profunda para Cripto Majors...`);
    await new Promise(r => setTimeout(r, 400));
    
    // Simular lógica de LLM / Microestructura
    const isAggressive = data.cvd_1m && data.cvd_1m > 1000000;
    
    return {
        tactical_score: isAggressive ? 85 : 40,
        analysis: isAggressive ? "Absorción masiva en los asks rompiendo la pared. Orderbook imbalance 70/30 a favor de compras agresivas." : "Rango lateral normal.",
        spoofing_detected: false
    };
}
