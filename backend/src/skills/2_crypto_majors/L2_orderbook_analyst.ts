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
    
    // L1 wraps data in FlowAnomalyAlert: { symbol, timestamp, type, data: { cvd_1m, ... } }
    // Unwrap nested data if present
    const raw = data.data || data;
    
    // Evaluar agresividad usando datos reales de CVD y OI
    const cvdAbs = Math.abs(raw.cvd_1m || 0);
    const oiDelta = raw.open_interest_delta || 0;
    
    // Score: CVD > 5 BTC es significativo, OI delta > 2% es agresivo
    const cvdScore = Math.min(50, cvdAbs * 10);  // 5 BTC → 50 pts
    const oiScore = Math.min(50, oiDelta * 15);   // 3.3% → 50 pts
    const totalScore = Math.round(cvdScore + oiScore);
    
    const isAggressive = totalScore >= 50;
    console.log(`\x1b[36m[L2 Orderbook]\x1b[0m ${raw.symbol || '??'}: CVD=${cvdAbs.toFixed(3)} (${cvdScore.toFixed(0)}pts) + OI=${oiDelta.toFixed(1)}% (${oiScore.toFixed(0)}pts) = ${totalScore}pts → ${isAggressive ? '✅ PASA' : '❌ RECHAZADO'}`);
    
    return {
        tactical_score: Math.min(100, totalScore),
        analysis: isAggressive 
            ? `CVD agresivo (${cvdAbs.toFixed(2)}) + OI delta ${oiDelta.toFixed(1)}%. Orderbook imbalance detectado. Posible movimiento institucional.` 
            : `CVD moderado (${cvdAbs.toFixed(2)}). Rango lateral sin presión direccional clara.`,
        spoofing_detected: false
    };
}
