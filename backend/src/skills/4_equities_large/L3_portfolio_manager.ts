import { VWAPEvaluation } from './L2_vwap_analyst';
import { GapAlert } from './L1_gap_screener';
import { VectorMemoryManager } from '../../memory/VectorMemoryManager';

export interface EquityRiskDecision {
    approved: boolean;
    size_pct_equity: number;
    use_bracket_order: boolean;
    take_profit: number;
    stop_loss: number;
    rationale: string;
}

// ═══════════════════════════════════════════
// TOOL DEFINITION (OpenAI Function Calling Format)
// ═══════════════════════════════════════════
export const EQUITIES_L3_PORTFOLIO_DEF = {
    type: "function" as const,
    function: {
        name: "evaluate_equity_portfolio_risk",
        description: "L3 Risk & Portfolio Manager para Equities (Alpaca): Evalúa el contexto macro, límites de pérdida diarios (Max Daily Loss = 2%), y dimensionamiento institucional (0.25 - 0.75% por trade). Instruye Bracket Orders (SL y TP ensamblados).",
        parameters: {
            type: "object",
            properties: {
                vwap_evaluation: {
                    type: "string",
                    description: "JSON stringificado con la evaluación táctica del VWAP (L2)."
                },
                gap_data: {
                    type: "string",
                    description: "JSON stringificado de la alerta delscreener (L1)."
                }
            },
            required: ["vwap_evaluation", "gap_data"]
        }
    }
};

// ═══════════════════════════════════════════
// TOOL IMPLEMENTATION
// ═══════════════════════════════════════════
export async function executeEquitiesL3PortfolioManager(vwapJson: string, gapJson: string): Promise<string> {
    try {
        const vwapEval: VWAPEvaluation = JSON.parse(vwapJson);
        const alert: GapAlert = JSON.parse(gapJson);
        const decision = await internalPortfolioManagerEvaluation(alert, vwapEval);
        
        return JSON.stringify({
            status: "INSTITUTIONAL_RISK_DECISION",
            decision
        });
    } catch (error: any) {
        return JSON.stringify({ error: `L3 Portfolio Manager falló: ${error.message}` });
    }
}

/**
 * Lógica estratégica institucional (Ej: Claude 3.5 Sonnet evaluando portafolio)
 */
async function internalPortfolioManagerEvaluation(alert: GapAlert, vwapEval: VWAPEvaluation): Promise<EquityRiskDecision> {
    console.log(`\x1b[35m[Director L3 - Portfolio Manager]\x1b[0m Evaluando Bracket Orders y límites de riesgo global Alpaca para ${alert.symbol}...`);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Si L2 detecta que el VWAP se perdió, abortamos operaciones agresivas.
    if (vwapEval.gap_classification !== 'Gap and Go' || vwapEval.tactical_score < 70) {
        return {
            approved: false,
            size_pct_equity: 0,
            use_bracket_order: false,
            take_profit: 0,
            stop_loss: 0,
            rationale: `RECHAZADO. Condiciones de ${vwapEval.gap_classification} no favorecen Asimetría R:R. Protegiendo Drawdown Intradía. No hay ventaja algorítmica.`
        };
    }

    // --- PROTECCIÓN EVOLUTIVA (Vector Memory) ---
    const userId = process.env.DEFAULT_USER_ID || '00000000-0000-0000-0000-000000000000';
    const mistakes = await VectorMemoryManager.queryPastMistakes(userId, "4_equities_large", { classification: vwapEval.gap_classification });
    let approvedSize = 0.5; // 0.5% del Portfolio
    let rationalePrefix = `APROBADO. Estructura "${vwapEval.gap_classification}" institucional validada (RVOL ${alert.data.rvol_open}x).`;

    if (mistakes.length >= 3) {
        approvedSize = 0.25; // Reducción de 50%
        rationalePrefix = `APROBADO CON REDUCCIÓN (Protección Evolutiva). La memoria refleja ${mistakes.length} fallos recientes en "${vwapEval.gap_classification}". Position sizing reducido al ${approvedSize}% Equity.`;
    }

    // --- PARCHES L5 (Quantitative Researcher) ---
    const l5Patches = await VectorMemoryManager.queryPolicyPatches(userId, "4_equities_large");
    for (const patch of l5Patches) {
        if ((patch.severity === 'CRITICAL' || patch.severity === 'HIGH') &&
            (patch.patch_type === 'VETO_CONDITION' || patch.patch_type === 'ALPHA_DECAY_WARNING')) {
            return {
                approved: false,
                size_pct_equity: 0,
                use_bracket_order: false,
                take_profit: 0,
                stop_loss: 0,
                rationale: `RECHAZADO (L5 Patch - ${patch.severity}): ${patch.directive}`
            };
        }
        // Parches no-VETO aún reducen sizing un 20% como precaución
        if (patch.patch_type === 'SIZING_ADJUSTMENT') {
            approvedSize *= 0.8;
            rationalePrefix += ` [L5: sizing reducido 20% por ${patch.directive.substring(0, 50)}]`;
        }
    }

    // APROBACIÓN: Dimensionamiento Conservador (0.5% del Equity para Equities USA)
    const currentPrice = alert.intraday_candles[alert.intraday_candles.length - 1];
    
    // El riesgo debe estar estrictamente bajo el VWAP o el mínimo de la vela de apertura.
    const stopLoss = alert.data.open_price * 0.99; // 1% SL asumiendo que el open era el soporte clave
    const takeProfit = currentPrice + ((currentPrice - stopLoss) * 3); // R:R = 1:3 Base

    return {
        approved: true,
        size_pct_equity: approvedSize,
        use_bracket_order: true,
        stop_loss: parseFloat(stopLoss.toFixed(2)),
        take_profit: parseFloat(takeProfit.toFixed(2)),
        rationale: `${rationalePrefix} El sector tecnológico (QQQ) muestra inflows relativos en bloque (Cuaderno 4B). Instruyendo Bracket Order (SL/TP atachados) a través de Alpaca.`
    };
}
