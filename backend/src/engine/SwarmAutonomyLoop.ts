import { executeAxiL1Screener } from '../skills/1_axi_forex/L1_macro_screener';
import { executeAxiL2Analyst } from '../skills/1_axi_forex/L2_geometry_analyst';
import { executeAxiL3RiskManager } from '../skills/1_axi_forex/L3_risk_manager';

import { executeCryptoL1Screener } from '../skills/2_crypto_majors/L1_flow_screener';
import { executeCryptoL2Analyst } from '../skills/2_crypto_majors/L2_orderbook_analyst';
import { executeCryptoL3RiskManager } from '../skills/2_crypto_majors/L3_liquidator_director';

import { executeMemeL1Screener } from '../skills/3_memecoins/L1_momentum_screener';
import { executeMemeL2Analyst } from '../skills/3_memecoins/L2_narrative_analyst';
import { executeMemeL3Risk } from '../skills/3_memecoins/L3_risk_director';

import { executeEquitiesL1Screener } from '../skills/4_equities_large/L1_gap_screener';
import { executeEquitiesL2Analyst } from '../skills/4_equities_large/L2_vwap_analyst';
import { executeEquitiesL3PortfolioManager } from '../skills/4_equities_large/L3_portfolio_manager';

import { executeSmallCapsL1Screener } from '../skills/5_small_caps/L1_halt_screener';
import { executeSmallCapsL2Analyst } from '../skills/5_small_caps/L2_catalyst_analyst';
import { executeSmallCapsL3DilutionManager } from '../skills/5_small_caps/L3_dilution_manager';

import { FirehoseManager } from '../data_feeds/FirehoseManager';
import { MarketDataCache } from '../data_feeds/MarketDataCache';
import { ProfileParser } from '../agents/ProfileParser';
import { askGroq } from '../ai/LLMService';
import { PaperExecutionEngine } from './PaperExecutionEngine';

export class SwarmAutonomyLoop {
    private static isRunning = false;
    private static firehose: FirehoseManager | null = null;
    private static heartbeatInterval: NodeJS.Timeout | null = null;
    private static scanCount = 0;
    private static paperEngine: PaperExecutionEngine | null = null;

    static setPaperEngine(engine: PaperExecutionEngine) {
        this.paperEngine = engine;
    }

    static getScanCount() {
        return this.scanCount;
    }

    static start() {
        if (this.isRunning) return;
        this.isRunning = true;

        console.log(`\n\x1b[45m\x1b[37m \uD83D\uDC1D INICIANDO SWARM AUTONOMY LOOP (EVENT-DRIVEN 24/7) \uD83D\uDC1D \x1b[0m\n`);
        
        this.firehose = new FirehoseManager();
        this.firehose.startStreams();

        // 🚨 HEARTBEAT OPENCLAW: Proactividad del Enjambre (Cada 45s)
        this.heartbeatInterval = setInterval(() => this.runHeartbeat(), 45000);

        // 1. Escuchar Cierres de Vela de MEXC (Ecosistema 3: Memecoins)
        this.firehose.on('mexc_kline_update', async (data) => {
            const asset = data.asset;
            
            // Alimentar caché de volumen
            MarketDataCache.addVolume(asset, data.volume);
            const avgVol = MarketDataCache.getAverageVolume(asset, 5); // 5 periodos

            // Construir payload real
            const realMemeData = {
                symbol: asset,
                timestamp: Date.now(),
                closePrice: data.close,
                volume_5m: data.volume, 
                historical_avg_vol_5m: avgVol,
                // Aproximación simple de turnover temporal
                turnover_ratio: (data.volume * data.close) / 1000000 
            };

            const io = (global as any).io;
            const l1Res = JSON.parse(executeMemeL1Screener(asset, realMemeData));
            if (l1Res.status === "MEME_MOMENTUM_SPIKE") {
                console.log(`\x1b[35m[Swarm Loop] \u26A1 Alerta REAL detectada en Ecosistema 3 (Memecoins) para ${asset} tras tick de MEXC.\x1b[0m`);
                io?.emit('swarm_alert', { ecosystem: '3_memecoins', asset, type: 'L1_SPIKE' });
                io?.emit('agent_state', { agent_id: 'l3_memes', status: 'active', action: `🐸 L1 SPIKE ${asset} — Analizando narrativa...` });
                
                const anomalyStr = JSON.stringify(l1Res.data);
                const l2ResStr = await executeMemeL2Analyst(anomalyStr);
                const l2Res = JSON.parse(l2ResStr);
                
                if (l2Res.evaluation && l2Res.evaluation.tactical_score >= 50) {
                    io?.emit('agent_state', { agent_id: 'l3_memes', status: 'active', action: `🐸 L2 APROBADO (${l2Res.evaluation.tactical_score}pts) — Evaluando riesgo...` });
                    const l3ResStr = await executeMemeL3Risk(JSON.stringify(l2Res.evaluation), anomalyStr);
                    const l3Res = JSON.parse(l3ResStr);
                    if (l3Res.decision?.approved) {
                        io?.emit('agent_state', { agent_id: 'l3_memes', status: 'success', action: `🎯 EJECUTANDO ${asset} — ${l3Res.decision.rationale?.substring(0, 50)}` });
                        io?.emit('trade_executed', { ecosystem: '3_memecoins', asset, decision: l3Res.decision });
                        // EJECUTAR EN PAPER ENGINE
                        this.paperEngine?.openPosition({
                            symbol: asset, exchange: 'MEXC', side: 'LONG',
                            entryPrice: data.close, notionalValue: Math.min(l3Res.decision.size_usd || 100, 500),
                            stopLoss: l3Res.decision.stop_loss, takeProfit: l3Res.decision.take_profit,
                            rationale: l3Res.decision.rationale, openedBy: 'L3_Memecoins'
                        });
                    } else {
                        io?.emit('agent_state', { agent_id: 'l3_memes', status: 'idle', action: `❌ L3 VETÓ ${asset}: ${l3Res.decision?.rationale?.substring(0, 50)}` });
                    }
                } else {
                    io?.emit('agent_state', { agent_id: 'l3_memes', status: 'idle', action: `😴 L2 rechazó ${asset} (score ${l2Res.evaluation?.tactical_score || 0})` });
                }
            }
        });

        // 2. Escuchar Velas de Alpaca (Ecosistemas 4 y 5: Equities / Small Caps)
        this.firehose.on('alpaca_bar_update', async (data) => {
            const asset = data.asset;
            
            // Actualizamos la caché de volumen 
            MarketDataCache.addVolume(asset, data.volume);
            const avgVol = MarketDataCache.getAverageVolume(asset, 20); // Media de 20 periodos típíca para Equities
            
            const prevClose = MarketDataCache.getPrevClose(asset);
            const gapPct = prevClose > 0 ? ((data.open - prevClose) / prevClose) * 100 : 0;
            const rvol = avgVol > 0 ? data.volume / avgVol : 0;

            // Evaluamos Ecosistema 4: Equities Large Caps
            const realEquitiesData = {
                symbol: asset,
                timestamp: Date.now(),
                prev_close: prevClose,
                open_price: data.open,
                gap_pct: gapPct, 
                rvol_open: rvol 
            };

            const l1EqRes = JSON.parse(executeEquitiesL1Screener(asset, realEquitiesData));
            if (l1EqRes.status === "EARNINGS_GAP_DETECTED") {
                console.log(`\x1b[35m[Swarm Loop] \u26A1 Alerta REAL detectada en Ecosistema 4 (Equities) para ${asset} tras tick de Alpaca.\x1b[0m`);
                (global as any).io?.emit('swarm_alert', { ecosystem: '4_equities_large', asset, type: 'L1_GAP' });
                
                const gapStr = JSON.stringify(l1EqRes.alert.data);
                const l2ResStr = await executeEquitiesL2Analyst(JSON.stringify(l1EqRes.alert));
                const l2Res = JSON.parse(l2ResStr);
                
                if (l2Res.evaluation && l2Res.evaluation.tactical_score >= 60) {
                    const l3ResStr = await executeEquitiesL3PortfolioManager(JSON.stringify(l2Res.evaluation), JSON.stringify(l1EqRes.alert));
                    const l3Res = JSON.parse(l3ResStr);
                    if (l3Res.decision?.approved) {
                        (global as any).io?.emit('trade_executed', { ecosystem: '4_equities_large', asset, decision: l3Res.decision });
                    }
                }
            }

            // Evaluamos Ecosistema 5: Small Caps
            const realSmallCapsData = {
                symbol: asset,
                timestamp: Date.now(),
                halt_price: data.close,
                price_change_5m: rvol > 3 ? 12 : 2, // Depende del evento, por ahora se evalua sobre RVOL (ejemplo)
                relative_volume: rvol,
                halt_time: new Date().toLocaleTimeString() 
            };

            const l1ScRes = JSON.parse(executeSmallCapsL1Screener(asset, realSmallCapsData as any)); 
            if (l1ScRes.status === "SMALL_CAP_HALT_DETECTED") {
                console.log(`\x1b[35m[Swarm Loop] \u26A1 Alerta REAL detectada en Ecosistema 5 (Small Caps) para ${asset} tras tick de Alpaca.\x1b[0m`);
                (global as any).io?.emit('swarm_alert', { ecosystem: '5_small_caps', asset, type: 'L1_HALT' });
                // Aquí continuaría la lógica asíncrona igual
            }
        });

        // 3. Escuchar Trades de Hyperliquid (Ecosistema 2: Cripto Majors)
        this.firehose.on('hl_trade_update', async (data) => {
            const asset = data.asset;
            // Evaluamos volumen con trades reales (mock data cruda en este contexto)
            const realFlowData = {
                symbol: asset,
                timestamp: Date.now(),
                price: parseFloat(data.trades[0].px) || 0,
                cvd_1m: data.trades.reduce((acc: number, t: any) => acc + (parseFloat(t.sz) || 0) * (t.dir === 'Buy' ? 1 : -1), 0), 
                funding_rate: 0.01, 
                open_interest_delta: 3.5 
            };

            const io = (global as any).io;
            const l1Res = JSON.parse(executeCryptoL1Screener(asset, realFlowData));
            if (l1Res.status === "CRYPTO_FLOW_ANOMALY") {
                console.log(`\x1b[35m[Swarm Loop] \u26A1 Alerta REAL detectada en Ecosistema 2 (Cripto Majors) para ${asset} tras tick de Hyperliquid.\x1b[0m`);
                io?.emit('swarm_alert', { ecosystem: '2_crypto_majors', asset, type: 'L1_FLOW' });
                io?.emit('agent_state', { agent_id: 'l3_crypto', status: 'active', action: `₿ L1 FLOW ${asset} — Analizando orderbook...` });
                
                try {
                const flowStr = JSON.stringify(l1Res.data);
                const l2ResStr = await executeCryptoL2Analyst(flowStr);
                const l2Res = JSON.parse(l2ResStr);
                const l2Score = l2Res.evaluation?.tactical_score || 0;
                console.log(`\x1b[36m[Swarm L2]\x1b[0m ${asset}: Score=${l2Score} ${l2Score >= 50 ? '✅ PASA' : '❌ NO PASA'}`);
                
                if (l2Res.evaluation && l2Score >= 50) {
                    io?.emit('agent_state', { agent_id: 'l3_crypto', status: 'active', action: `₿ L2 APROBADO (${l2Score}pts) — Evaluando riesgo...` });
                    console.log(`\x1b[33m[Swarm L3]\x1b[0m ${asset}: Llamando L3 Risk Manager...`);
                    const l3ResStr = await executeCryptoL3RiskManager(JSON.stringify(l2Res.evaluation), flowStr);
                    const l3Res = JSON.parse(l3ResStr);
                    console.log(`\x1b[33m[Swarm L3]\x1b[0m ${asset}: approved=${l3Res.decision?.approved} rationale=${l3Res.decision?.rationale?.substring(0, 80)}`);
                    if (l3Res.decision?.approved) {
                        const price = parseFloat(data.trades[0]?.px) || 0;
                        io?.emit('agent_state', { agent_id: 'l3_crypto', status: 'success', action: `🎯 EJECUTANDO ${asset} @ $${price.toFixed(0)}` });
                        io?.emit('trade_executed', { ecosystem: '2_crypto_majors', asset, decision: l3Res.decision });
                        console.log(`\x1b[42m\x1b[30m [TRADE] ✅ ABRIENDO ${asset} @ $${price} \x1b[0m`);
                        this.paperEngine?.openPosition({
                            symbol: asset, exchange: 'Hyperliquid', side: 'LONG',
                            entryPrice: price, notionalValue: Math.min(l3Res.decision.size_usd || 200, 1000),
                            stopLoss: l3Res.decision.stop_loss, takeProfit: l3Res.decision.take_profit,
                            rationale: l3Res.decision.rationale, openedBy: 'L3_Crypto_Majors'
                        });
                    } else {
                        io?.emit('agent_state', { agent_id: 'l3_crypto', status: 'idle', action: `❌ L3 VETÓ ${asset}: ${l3Res.decision?.rationale?.substring(0, 50)}` });
                    }
                } else {
                    io?.emit('agent_state', { agent_id: 'l3_crypto', status: 'idle', action: `😴 L2 rechazó ${asset} (score ${l2Score})` });
                }
                } catch (pipeErr: any) {
                    console.error(`\x1b[31m[Swarm] ❌ Pipeline error ${asset}:\x1b[0m`, pipeErr.message);
                    io?.emit('agent_state', { agent_id: 'l3_crypto', status: 'error', action: `❌ Error: ${pipeErr.message?.substring(0, 50)}` });
                }
            }
        });

        // 4. Ecosistema 1: Axi Forex (Para Forex se requeriría WSS broker o MT5. Aquí dejamos placeholder ordenado)
        // Ejemplo de abstracción a futuro para Axi/MetaTrader
        /*
        this.firehose.on('axi_tick_update', async (data) => {
             const l1Res = JSON.parse(executeAxiL1Screener(data.asset, [data.candle]));
             if (l1Res.status === "ANOMALY_DETECTED") { ... }
        });
        */
    }

    static stop() {
        if (this.firehose) {
            this.firehose.removeAllListeners();
            // TODO: Agregar firehose.stopStreams() en el futuro
        }
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.isRunning = false;
        console.log(`\n\x1b[41m\x1b[37m [Swarm Loop] EVENT-DRIVEN LOOP APAGADO MANUALMENTE. \x1b[0m\n`);
    }

    private static async runHeartbeat() {
        if (!this.isRunning) return;
        console.log(`\x1b[36m[Swarm Heartbeat]\x1b[0m Latido del enjambre iniciado. Despertando Directores L3...`);

        // Emitimos al frontend que hay un latido de enjambre (Animación de Pixel Agents)
        (global as any).io?.emit('swarm_heartbeat_activity', { status: 'working' });
        
        // Sumamos un escaneo (latido) al ecosistema global
        this.scanCount++;

        const marketState = JSON.stringify(MarketDataCache.getSnapshot());
        const io = (global as any).io;

        // Definición de los 5 Directores L3 con sus perfiles y mercados
        const directors = [
            { agent_id: 'l3_crypto',     profile: 'L3_Crypto_Majors', market: 'Crypto Perpetuals', emoji: '₿' },
            { agent_id: 'l3_memes',      profile: 'L3_Memecoins',     market: 'Memecoins Spot',    emoji: '🐸' },
            { agent_id: 'l3_equities',   profile: 'L3_Equities',      market: 'Equities US',       emoji: '📈' },
            { agent_id: 'l3_small_caps', profile: 'L3_Small_Caps',    market: 'Small/Micro Caps',  emoji: '🔬' },
            { agent_id: 'l3_forex',      profile: 'L3_Axi_Forex',     market: 'Forex Majors',      emoji: '💱' },
        ];

        // CEO observa mientras los directores trabajan
        io?.emit('agent_state', { agent_id: 'ceo', status: 'active', action: '👔 Supervisando Heartbeat #' + this.scanCount });

        for (const dir of directors) {
            try {
                // 1. Notificar al frontend que ESTE director está escaneando
                io?.emit('agent_state', {
                    agent_id: dir.agent_id,
                    status: 'active',
                    action: `${dir.emoji} Escaneando ${dir.market}...`
                });

                const profile = ProfileParser.getProfile(dir.profile);
                const context = `Mercado ${dir.market} — snapshot resumen: ${typeof marketState === 'string' ? marketState.substring(0, 500) : 'N/A'}\n\n¿Hay oportunidad inmediata? Responde JSON: { "action": "WAIT" | "TRADE", "reason": "..." }`;
                
                const { data } = await askGroq<any>(profile, context, { jsonMode: true });
                const decision = typeof data === 'string' ? JSON.parse(data) : (data || { action: 'WAIT', reason: 'Sin datos' });

                if (decision.action === 'TRADE') {
                    // 2a. Director quiere operar → lo notificamos al frontend
                    console.log(`\x1b[35m[${dir.profile} PROACTIVO]\x1b[0m Trade propuesto! Razón: ${decision.reason}`);
                    io?.emit('agent_state', {
                        agent_id: dir.agent_id,
                        status: 'success',
                        action: `🎯 TRADE: ${decision.reason?.substring(0, 60) || 'Oportunidad detectada'}`
                    });
                } else {
                    // 2b. Director espera → idle con razón
                    console.log(`\x1b[90m[${dir.profile}] Skipping. Razón: ${decision.reason}\x1b[0m`);
                    io?.emit('agent_state', {
                        agent_id: dir.agent_id,
                        status: 'idle',
                        action: `😴 ${decision.reason?.substring(0, 50) || 'Sin oportunidades'}`
                    });
                }
            } catch (e: any) {
                console.error(`[Heartbeat Error - ${dir.profile}] ${e.message}`);
                io?.emit('agent_state', {
                    agent_id: dir.agent_id,
                    status: 'idle',
                    action: `⚠️ Error: ${e.message?.substring(0, 40)}`
                });
            }
        }

        // CEO termina de supervisar
        io?.emit('agent_state', { agent_id: 'ceo', status: 'idle', action: '✅ Heartbeat #' + this.scanCount + ' completado' });
    }
}
