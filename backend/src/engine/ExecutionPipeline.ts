import { AXI_L1_MACRO_DEF, executeAxiL1Screener, Candle } from '../skills/1_axi_forex/L1_macro_screener';
import { AXI_L2_GEOMETRY_DEF, executeAxiL2Analyst } from '../skills/1_axi_forex/L2_geometry_analyst';
import { AXI_L3_RISK_DEF, executeAxiL3RiskManager } from '../skills/1_axi_forex/L3_risk_manager';

import { CRYPTO_L1_FLOW_DEF, executeCryptoL1Screener, CryptoFlowData } from '../skills/2_crypto_majors/L1_flow_screener';
import { CRYPTO_L2_ORDERBOOK_DEF, executeCryptoL2Analyst } from '../skills/2_crypto_majors/L2_orderbook_analyst';
import { CRYPTO_L3_LIQUIDATOR_DEF, executeCryptoL3RiskManager } from '../skills/2_crypto_majors/L3_liquidator_director';
import { MEME_L1_SCREENER_DEF, executeMemeL1Screener, MemeMarketData } from '../skills/3_memecoins/L1_momentum_screener';
import { MEME_L2_NARRATIVE_DEF, executeMemeL2Analyst } from '../skills/3_memecoins/L2_narrative_analyst';
import { MEME_L3_RISK_DEF, executeMemeL3Risk } from '../skills/3_memecoins/L3_risk_director';

import { EQUITIES_L1_GAP_DEF, executeEquitiesL1Screener, EquityGapData } from '../skills/4_equities_large/L1_gap_screener';
import { EQUITIES_L2_VWAP_DEF, executeEquitiesL2Analyst } from '../skills/4_equities_large/L2_vwap_analyst';
import { EQUITIES_L3_PORTFOLIO_DEF, executeEquitiesL3PortfolioManager } from '../skills/4_equities_large/L3_portfolio_manager';

import { SMALL_CAPS_L1_HALT_DEF, executeSmallCapsL1Screener, HaltSpikeData } from '../skills/5_small_caps/L1_halt_screener';
import { SMALL_CAPS_L2_CATALYST_DEF, executeSmallCapsL2Analyst } from '../skills/5_small_caps/L2_catalyst_analyst';
import { SMALL_CAPS_L3_DILUTION_DEF, executeSmallCapsL3DilutionManager } from '../skills/5_small_caps/L3_dilution_manager';

/**
 * PIPELINE MAESTRO DE EJECUCIÓN (ORQUESTADOR / CEO ROUTER)
 * El CEO es el único que lee los comandos del usuario y enruta al escuadrón correcto.
 */

export const AXI_FOREX_TOOLS = [
    AXI_L1_MACRO_DEF,
    AXI_L2_GEOMETRY_DEF,
    AXI_L3_RISK_DEF
];

export const CRYPTO_MAJORS_TOOLS = [
    CRYPTO_L1_FLOW_DEF,
    CRYPTO_L2_ORDERBOOK_DEF,
    CRYPTO_L3_LIQUIDATOR_DEF
];

export const MEMECOINS_TOOLS = [
    MEME_L1_SCREENER_DEF,
    MEME_L2_NARRATIVE_DEF,
    MEME_L3_RISK_DEF
];

export const EQUITIES_TOOLS = [
    EQUITIES_L1_GAP_DEF,
    EQUITIES_L2_VWAP_DEF,
    EQUITIES_L3_PORTFOLIO_DEF
];

export const SMALL_CAPS_TOOLS = [
    SMALL_CAPS_L1_HALT_DEF,
    SMALL_CAPS_L2_CATALYST_DEF,
    SMALL_CAPS_L3_DILUTION_DEF
];

export async function executeAxiForexTool(toolName: string, args: any, contextCandles: Candle[] = []): Promise<string> {
    switch (toolName) {
        case "scan_axi_anomalies":
            return executeAxiL1Screener(args.asset, contextCandles);
        case "evaluate_tactical_geometry":
            return await executeAxiL2Analyst(args.anomaly_data);
        case "evaluate_strategic_risk":
            return await executeAxiL3RiskManager(args.tactical_evaluation, args.anomaly_data);
        default:
            return JSON.stringify({ error: `Herramienta desconocida en 1_axi_forex: ${toolName}` });
    }
}

export async function executeCryptoMajorsTool(toolName: string, args: any, liveData?: CryptoFlowData): Promise<string> {
    switch (toolName) {
        case "scan_crypto_flows":
            return executeCryptoL1Screener(args.symbol, liveData);
        case "evaluate_orderbook_imbalance":
            return await executeCryptoL2Analyst(args.flow_data);
        case "evaluate_liquidation_risk":
            return await executeCryptoL3RiskManager(args.orderbook_evaluation, args.flow_data);
        default:
            return JSON.stringify({ error: `Herramienta desconocida en 2_crypto_majors: ${toolName}` });
    }
}

export async function executeMemecoinsTool(toolName: string, args: any, liveData?: MemeMarketData): Promise<string> {
    switch (toolName) {
        case "scan_meme_momentum":
            return executeMemeL1Screener(args.symbol, liveData);
        case "evaluate_meme_narrative":
            return await executeMemeL2Analyst(args.spike_data);
        case "evaluate_meme_risk":
            return await executeMemeL3Risk(args.narrative_evaluation, args.spike_data);
        default:
            return JSON.stringify({ error: `Herramienta desconocida en 3_memecoins: ${toolName}` });
    }
}

export async function executeEquitiesTool(toolName: string, args: any, liveData?: EquityGapData): Promise<string> {
    switch (toolName) {
        case "scan_equity_gaps":
            return executeEquitiesL1Screener(args.symbol, liveData);
        case "evaluate_vwap_dynamics":
            return await executeEquitiesL2Analyst(args.gap_data);
        case "evaluate_equity_portfolio_risk":
            return await executeEquitiesL3PortfolioManager(args.vwap_evaluation, args.gap_data);
        default:
            return JSON.stringify({ error: `Herramienta desconocida en 4_equities_large: ${toolName}` });
    }
}

export async function executeSmallCapsTool(toolName: string, args: any, liveData?: HaltSpikeData): Promise<string> {
    switch (toolName) {
        case "scan_small_cap_halts":
            return executeSmallCapsL1Screener(args.symbol, liveData);
        case "evaluate_small_cap_catalyst":
            return await executeSmallCapsL2Analyst(args.halt_data);
        case "evaluate_dilution_risk":
            return await executeSmallCapsL3DilutionManager(args.catalyst_evaluation, args.halt_data);
        default:
            return JSON.stringify({ error: `Herramienta desconocida en 5_small_caps: ${toolName}` });
    }
}

// ═══════════════════════════════════════════
// CEO ROUTING & SIMULATION
// ═══════════════════════════════════════════
export class CEORouter {
    /**
     * El CEO interpreta el lenguaje natural del usuario y enruta la directiva.
     */
    static async routeUserCommand(userCommand: string) {
        console.log(`\n\x1b[44m\x1b[37m [CEO AGENT] Recibe orden: "${userCommand}" \x1b[0m`);
        
        const lowerCmd = userCommand.toLowerCase();
        if (lowerCmd.includes("pepe") || lowerCmd.includes("meme") || lowerCmd.includes("mexc")) {
            console.log(`\x1b[36m [CEO AGENT] -> Enrutando al Escuadrón 3 (Memecoins)...\x1b[0m`);
            await ExecutionPipeline.simulateMemePipeline("PEPEUSDT");
        } 
        else if (lowerCmd.includes("nvda") || lowerCmd.includes("aapl") || lowerCmd.includes("nasdaq") || lowerCmd.includes("alpaca")) {
            console.log(`\x1b[36m [CEO AGENT] -> Enrutando al Escuadrón 4 (Equities Large Caps)...\x1b[0m`);
            await ExecutionPipeline.simulateEquitiesPipeline("NVDA");
        }
        else if (lowerCmd.includes("gme") || lowerCmd.includes("amc") || lowerCmd.includes("squeeze") || lowerCmd.includes("halt")) {
            console.log(`\x1b[36m [CEO AGENT] -> Enrutando al Escuadrón 5 (Small Caps & Squeezes)...\x1b[0m`);
            await ExecutionPipeline.simulateSmallCapsPipeline("GME");
        }
        else if (lowerCmd.includes("forex") || lowerCmd.includes("eurusd") || lowerCmd.includes("axi")) {
            console.log(`\x1b[36m [CEO AGENT] -> Enrutando al Escuadrón 1 (Axi Forex)...\x1b[0m`);
            // Simularíamos las velas aquí
            await ExecutionPipeline.simulateAxiPipeline("EURUSD", []);
        }
        else {
            console.log(`\x1b[31m [CEO AGENT] -> No se pudo determinar el escuadrón. Faltan intents.\x1b[0m`);
        }
    }
}

// Simulador del Pipeline secuencial usando las Herramientas Nativas
export class ExecutionPipeline {
  
  static async simulateAxiPipeline(asset: string, candles: Candle[]) {
    console.log(`\n======================================================`);
    console.log(`⚙\uFE0F SIMULANDO PIPELINE AXI FOREX: ${asset}`);
    console.log(`======================================================`);

    // 1. Llamar herramienta L1
    const l1ResJson = JSON.parse(executeAxiL1Screener(asset, candles));
    if (l1ResJson.status !== "ANOMALY_DETECTED") {
        console.log(`\x1b[90m    ${l1ResJson.message}\x1b[0m`);
        return;
    }
    const anomalyStr = JSON.stringify(l1ResJson.data);

    // 2. Llamar herramienta L2
    const l2ResStr = await executeAxiL2Analyst(anomalyStr);
    const l2Res = JSON.parse(l2ResStr);
    if (!l2Res.evaluation || l2Res.evaluation.tactical_score <= 75) {
        console.log(`    \x1b[31mOperación descartada por L2 Geometry Analyst.\x1b[0m Analysis: ${l2Res.evaluation?.analysis}`);
        return;
    }
    const tacticalStr = JSON.stringify(l2Res.evaluation);

    // 3. Llamar herramienta L3
    const l3ResStr = await executeAxiL3RiskManager(tacticalStr, anomalyStr);
    const l3Res = JSON.parse(l3ResStr);

    if (l3Res.decision?.approved) {
        console.log(`\n    \x1b[42m\x1b[30m \u2705 APROBADO NATUALMENTE POR EL L3 RISK MANAGER \x1b[0m`);
        console.log(`    Rationale: ${l3Res.decision.rationale}`);
    } else {
        console.log(`\n    \x1b[41m\x1b[37m \u274C VETADO POR EL L3 RISK MANAGER \x1b[0m`);
        console.log(`    Rationale: ${l3Res.decision?.rationale}`);
    }
  }

  static async simulateCryptoPipeline(asset: string) {
    console.log(`\n======================================================`);
    console.log(`⚙\uFE0F SIMULANDO PIPELINE CRIPTO MAJORS: ${asset}`);
    console.log(`======================================================`);

    const l1Res = JSON.parse(executeCryptoL1Screener(asset));
    if (l1Res.status !== "CRYPTO_FLOW_ANOMALY") {
        console.log(`\x1b[90m    ${l1Res.message}\x1b[0m`);
        return;
    }
    const flowStr = JSON.stringify(l1Res.data);

    const l2ResStr = await executeCryptoL2Analyst(flowStr);
    const l2Res = JSON.parse(l2ResStr);
    if (!l2Res.evaluation || l2Res.evaluation.tactical_score < 50) {
        console.log(`    \x1b[31mOperación descartada por L2 Orderbook Analyst.\x1b[0m`);
        return;
    }
    
    const obStr = JSON.stringify(l2Res.evaluation);
    const l3ResStr = await executeCryptoL3RiskManager(obStr, flowStr);
    const l3Res = JSON.parse(l3ResStr);

    if (l3Res.decision?.approved) {
        console.log(`\n    \x1b[42m\x1b[30m \u2705 APROBADO POR EL L3 LIQUIDATOR DIRECTOR \x1b[0m`);
    } else {
        console.log(`\n    \x1b[41m\x1b[37m \u274C VETADO POR EL L3 LIQUIDATOR DIRECTOR \x1b[0m`);
    }
  }

  static async simulateMemePipeline(asset: string) {
    console.log(`\n======================================================`);
    console.log(`⚙\uFE0F SIMULANDO PIPELINE MEMECOINS: ${asset}`);
    console.log(`======================================================`);

    // 1. Llamar herramienta L1
    const l1Res = JSON.parse(executeMemeL1Screener(asset));
    if (l1Res.status !== "MEME_MOMENTUM_SPIKE") {
        console.log(`\x1b[90m    ${l1Res.message}\x1b[0m`);
        return;
    }
    const anomalyStr = JSON.stringify(l1Res.data);

    // 2. Llamar herramienta L2
    const l2ResStr = await executeMemeL2Analyst(anomalyStr);
    const l2Res = JSON.parse(l2ResStr);
    if (!l2Res.evaluation || l2Res.evaluation.tactical_score < 50) {
        console.log(`    \x1b[31mOperación descartada por L2 Narrative Analyst.\x1b[0m Phase: ${l2Res.evaluation?.pump_phase}`);
        return;
    }
    const narrativeStr = JSON.stringify(l2Res.evaluation);

    // 3. Llamar herramienta L3
    const l3ResStr = await executeMemeL3Risk(narrativeStr, anomalyStr);
    const l3Res = JSON.parse(l3ResStr);

    if (l3Res.decision?.approved) {
        console.log(`\n    \x1b[45m\x1b[37m \u2705 APROBADO NATUALMENTE POR EL L3 RISK DIRECTOR \x1b[0m`);
        console.log(`    Size: $${l3Res.decision.size_usd} | SL: ${l3Res.decision.stop_loss}`);
        console.log(`    Rationale: ${l3Res.decision.rationale}`);
    } else {
        console.log(`\n    \x1b[41m\x1b[37m \u274C VETADO POR EL L3 RISK DIRECTOR \x1b[0m`);
        console.log(`    Rationale: ${l3Res.decision?.rationale}`);
    }
  }

  static async simulateEquitiesPipeline(asset: string) {
    console.log(`\n======================================================`);
    console.log(`⚙\uFE0F SIMULANDO PIPELINE EQUITIES (LARGE CAPS): ${asset}`);
    console.log(`======================================================`);

    // 1. Llamar herramienta L1 (Screener de Gaps)
    const l1Res = JSON.parse(executeEquitiesL1Screener(asset));
    if (l1Res.status !== "EARNINGS_GAP_DETECTED") {
        console.log(`\x1b[90m    ${l1Res.message}\x1b[0m`);
        return;
    }
    const gapStr = JSON.stringify(l1Res.alert.data); // O usar l1Res.alert completo

    // 2. Llamar herramienta L2 (Analista VWAP)
    const l2ResStr = await executeEquitiesL2Analyst(JSON.stringify(l1Res.alert));
    const l2Res = JSON.parse(l2ResStr);
    
    if (!l2Res.evaluation || l2Res.evaluation.tactical_score < 60) {
        console.log(`    \x1b[31mOperación descartada por L2 VWAP Analyst.\x1b[0m Phase: ${l2Res.evaluation?.gap_classification}`);
        return;
    }
    const vwapStr = JSON.stringify(l2Res.evaluation);

    // 3. Llamar herramienta L3 (Portfolio Manager)
    const l3ResStr = await executeEquitiesL3PortfolioManager(vwapStr, JSON.stringify(l1Res.alert));
    const l3Res = JSON.parse(l3ResStr);

    if (l3Res.decision?.approved) {
        console.log(`\n    \x1b[44m\x1b[37m \u2705 APROBADO NATUALMENTE POR EL L3 PORTFOLIO MANAGER \x1b[0m`);
        console.log(`    Sizing: ${l3Res.decision.size_pct_equity}% del Equity | SL: $${l3Res.decision.stop_loss} | TP: $${l3Res.decision.take_profit}`);
        console.log(`    Bracket Order Activa: ${l3Res.decision.use_bracket_order}`);
        console.log(`    Rationale: ${l3Res.decision.rationale}`);
    } else {
        console.log(`\n    \x1b[41m\x1b[37m \u274C VETADO POR EL L3 PORTFOLIO MANAGER \x1b[0m`);
        console.log(`    Rationale: ${l3Res.decision?.rationale}`);
    }
  }

  static async simulateSmallCapsPipeline(asset: string) {
    console.log(`\n======================================================`);
    console.log(`⚙\uFE0F SIMULANDO PIPELINE SMALL CAPS & SQUEEZES: ${asset}`);
    console.log(`======================================================`);

    // 1. Llamar herramienta L1 (Halt Screener)
    const l1Res = JSON.parse(executeSmallCapsL1Screener(asset));
    if (l1Res.status !== "SMALL_CAP_HALT_DETECTED") {
        console.log(`\x1b[90m    ${l1Res.message}\x1b[0m`);
        return;
    }
    const haltStr = JSON.stringify(l1Res.alert.data); 

    // 2. Llamar herramienta L2 (Catalyst Analyst)
    const l2ResStr = await executeSmallCapsL2Analyst(JSON.stringify(l1Res.alert));
    const l2Res = JSON.parse(l2ResStr);
    
    if (!l2Res.evaluation || l2Res.evaluation.tactical_score < 60) {
        console.log(`    \x1b[31mOperación descartada por L2 Catalyst Analyst.\x1b[0m Setup: ${l2Res.evaluation?.setup_classification}`);
        return;
    }
    const catalystStr = JSON.stringify(l2Res.evaluation);

    // 3. Llamar herramienta L3 (Dilution Manager)
    const l3ResStr = await executeSmallCapsL3DilutionManager(catalystStr, JSON.stringify(l1Res.alert));
    const l3Res = JSON.parse(l3ResStr);

    if (l3Res.decision?.approved) {
        console.log(`\n    \x1b[43m\x1b[30m \u2705 APROBADO NATUALMENTE POR EL L3 DILUTION MANAGER \x1b[0m`);
        console.log(`    Size: $${l3Res.decision.size_usd} | Trailing Stop: ${l3Res.decision.trailing_stop_pct}%`);
        console.log(`    Filing Warnings: ${JSON.stringify(l3Res.decision.filing_warnings)}`);
        console.log(`    Rationale: ${l3Res.decision.rationale}`);
    } else {
        console.log(`\n    \x1b[41m\x1b[37m \u274C VETADO POR EL L3 DILUTION MANAGER \x1b[0m`);
        console.log(`    Rationale: ${l3Res.decision?.rationale}`);
    }
  }
}
