/**
 * MarketScannerLoop.ts
 *
 * PROACTIVE market scanner. Runs every 10 seconds, scans ALL monitored assets
 * for volume spikes, momentum shifts, and anomalies. When detected, immediately
 * triggers the Sentinel→Risk→Execute pipeline WITHOUT waiting for a 15m candle close.
 *
 * This transforms the system from a passive "wait for candle" bot into an
 * aggressive multi-asset scanner that floods the LiveTerminal with real activity.
 */

import { SentinelAgent, TradeSignal } from "../agents/SentinelAgent";
import { RiskManagerAgent } from "../agents/RiskManagerAgent";
import { PaperExecutionEngine } from "../engine/PaperExecutionEngine";
import { broadcastAgentState, broadcastAgentLog } from "../utils/SwarmEvents";
import { saveAgentMemory } from "../utils/supabaseClient";
import { TelegramManager } from "../utils/TelegramManager";
import { OHLCCandle } from "../utils/WebSocketManager";
import { getRadarTickers, RadarAsset } from "../tools/MarketRadar";

// ═══════════════════════════════════════════
// DYNAMIC WATCHLIST Integration
// ═══════════════════════════════════════════

interface AssetConfig {
    symbol: string;
    exchange: string;
    type: "crypto" | "memecoin" | "equity" | "forex";
}

// ═══════════════════════════════════════════
// Volume/Price tracker per symbol
// ═══════════════════════════════════════════

interface TickSnapshot {
    price: number;
    volume: number;       // accumulated volume in the last window
    volumeHistory: number[];  // last N windows for average comparison
    priceHistory: number[];
    lastUpdate: number;
    scanCount: number;
}

export class MarketScannerLoop {
    private sentinel: SentinelAgent;
    private riskManager: RiskManagerAgent;
    private paperEngine: PaperExecutionEngine;
    private telegram: TelegramManager;
    private latestPrices: Record<string, number>;

    // Watchlist dynamically generated from Radar
    private dynamicWatchlist: AssetConfig[] = [];

    // Live tracking
    private snapshots: Map<string, TickSnapshot> = new Map();
    private intervalId: NodeJS.Timeout | null = null;
    private radarIntervalId: NodeJS.Timeout | null = null;
    private isScanning = false;

    // Throttle: max 1 LLM call per symbol per 30s (more aggressive)
    private lastAnalysisTime: Map<string, number> = new Map();
    private analysisThrottleMs = 30_000; 

    // Stats
    private stats = {
        totalScans: 0,
        spikesDetected: 0,
        signalsGenerated: 0,
        tradesOpened: 0,
        tradesRejected: 0,
    };

    constructor(
        sentinel: SentinelAgent,
        riskManager: RiskManagerAgent,
        paperEngine: PaperExecutionEngine,
        telegram: TelegramManager,
        latestPrices: Record<string, number>,
    ) {
        this.sentinel = sentinel;
        this.riskManager = riskManager;
        this.paperEngine = paperEngine;
        this.telegram = telegram;
        this.latestPrices = latestPrices;
    }

    /**
     * Ingest every tick that comes from WSS to build volume profiles.
     */
    public onTick(symbol: string, price: number, volume: number) {
        let snap = this.snapshots.get(symbol);
        if (!snap) {
            snap = { price: 0, volume: 0, volumeHistory: [], priceHistory: [], lastUpdate: 0, scanCount: 0 };
            this.snapshots.set(symbol, snap);
        }
        snap.price = price;
        snap.volume += volume;
        snap.lastUpdate = Date.now();
    }

    /**
     * Updates the local watchlist from the Market Radar.
     * This ensures we are always scanning the hottest assets.
     */
    private async refreshWatchlist() {
        try {
            const tickers = await getRadarTickers();
            this.dynamicWatchlist = tickers.map(t => ({
                symbol: t.symbol,
                exchange: t.exchange,
                type: t.exchange === "mexc" ? "memecoin" : t.exchange === "hyperliquid" ? "crypto" : t.exchange === "alpaca" ? "equity" : "forex"
            }));
            
            if (this.stats.totalScans % 10 === 0) {
                broadcastAgentLog("sentinel", `🔄 Radar actualizado: ${this.dynamicWatchlist.length} activos en el colador dinámico.`, "info");
            }
        } catch (err) {
            console.error("[Scanner] Failed to refresh dynamic watchlist:", err);
        }
    }

    /**
     * Start the proactive scanner loop.
     */
    public async start() {
        if (this.intervalId) return;

        // Initial fetch
        await this.refreshWatchlist();

        console.log(`[Scanner] 🚀 Starting DYNAMIC scanner: ${this.dynamicWatchlist.length} assets.`);
        broadcastAgentLog("ceo", `🚀 Radar Dinámico Operativo: Monitoreando ${this.dynamicWatchlist.length} activos en tiempo real.`, "success");

        // Scan every 15 seconds (responsable — no inundar APIs)
        this.intervalId = setInterval(() => this.scan(), 15_000);
        
        // Secondary scan via REST radar every 45s
        setInterval(() => this.scanRadarAnomalies(), 45_000);
        
        // Refresh radar every 60 seconds
        this.radarIntervalId = setInterval(() => this.refreshWatchlist(), 60_000);

        // First scan immediately
        this.scan();
    }

    public stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * Main scan cycle. Checks all assets for volume spikes and momentum.
     */
    private async scan() {
        if (this.isScanning) return; // prevent overlap
        this.isScanning = true;
        this.stats.totalScans++;

        const scanStart = Date.now();
        const hotAssets: { asset: AssetConfig; spike: number; momentum: number }[] = [];

        for (const asset of this.dynamicWatchlist) {
            const snap = this.snapshots.get(asset.symbol);
            if (!snap || snap.lastUpdate === 0) continue; // no data yet

            // Calculate volume ratio vs average of last 6 windows (1 minute history at 10s intervals)
            const avgVolume = snap.volumeHistory.length > 0
                ? snap.volumeHistory.reduce((a: number, b: number) => a + b, 0) / snap.volumeHistory.length
                : snap.volume;

            const volumeRatio = avgVolume > 0 ? snap.volume / avgVolume : 1;

            // Calculate price momentum (% change over recent history)
            const oldPrice = snap.priceHistory.length > 0 ? snap.priceHistory[0] : snap.price;
            const momentum = oldPrice > 0 ? ((snap.price - oldPrice) / oldPrice) * 100 : 0;

            // Detect spikes: volume > 1.5x average OR momentum > 0.3%
            const isVolumeSpike = volumeRatio > 1.5 && snap.volume > 0;
            const isMomentumSpike = Math.abs(momentum) > 0.3;
            // Memecoins: lower threshold (they're more volatile)
            const isMemecoinHot = asset.type === "memecoin" && (volumeRatio > 1.2 || Math.abs(momentum) > 0.15);

            if (isVolumeSpike || isMomentumSpike || isMemecoinHot) {
                hotAssets.push({ asset, spike: volumeRatio, momentum });
            }

            // Rotate history
            snap.volumeHistory.push(snap.volume);
            if (snap.volumeHistory.length > 6) snap.volumeHistory.shift();
            snap.priceHistory.push(snap.price);
            if (snap.priceHistory.length > 12) snap.priceHistory.shift();

            // Reset accumulated volume for next window
            snap.volume = 0;
            snap.scanCount++;
        }

        // Process ONLY the best hot asset per cycle (sort by spike desc)
        hotAssets.sort((a, b) => b.spike - a.spike);
        const best = hotAssets[0];

        if (best) {
            this.stats.spikesDetected++;
            const lastTime = this.lastAnalysisTime.get(best.asset.symbol) || 0;

            if (Date.now() - lastTime >= this.analysisThrottleMs) {
                this.lastAnalysisTime.set(best.asset.symbol, Date.now());

                broadcastAgentLog("sentinel",
                    `🔥 SPIKE: ${best.asset.symbol} Vol ${best.spike.toFixed(1)}x | Mom ${best.momentum > 0 ? "+" : ""}${best.momentum.toFixed(2)}%`,
                    "warn");

                // Await analysis — ONE at a time
                try {
                    await this.analyzeHotAsset(best.asset, best.spike, best.momentum);
                } catch (err: any) {
                    console.error(`[Scanner] Error ${best.asset.symbol}:`, err.message?.slice(0, 80));
                }
            }
        }

        this.isScanning = false;
    }

    /**
     * Scans the REST-based Radar data directly for major 24h changes.
     * This acts as a secondary trigger for the specialists.
     */
    private async scanRadarAnomalies() {
        try {
            const tickers = await getRadarTickers();
            // Find top gainers/losers or high volume spikes from REST
            const targets = tickers
                .filter(t => Math.abs(t.change_pct_24h) > 5 || t.quoteVolume > 100_000_000)
                .slice(0, 3); // Solo top 3, procesados secuencialmente

            for (const t of targets) {
                const lastTime = this.lastAnalysisTime.get(t.symbol) || 0;
                if (Date.now() - lastTime < this.analysisThrottleMs) continue;

                const asset: AssetConfig = {
                    symbol: t.symbol,
                    exchange: t.exchange,
                    type: t.exchange === "mexc" ? "memecoin" : t.exchange === "hyperliquid" ? "crypto" : t.exchange === "alpaca" ? "equity" : "forex"
                };

                broadcastAgentLog("sentinel", `📡 Radar REST detectó oportunidad en ${t.symbol} (${t.change_pct_24h.toFixed(1)}% 24h). Delegando...`, "info");
                
                // Construct a mock snapshot for the analyzer if not exists
                if (!this.snapshots.has(t.symbol)) {
                    this.snapshots.set(t.symbol, {
                        price: t.price,
                        volume: 0,
                        volumeHistory: [],
                        priceHistory: [],
                        lastUpdate: Date.now(),
                        scanCount: 0
                    });
                }

                this.analyzeHotAsset(asset, 1.0, t.change_pct_24h / 24).catch(() => {});
                this.lastAnalysisTime.set(t.symbol, Date.now());
            }
        } catch (err) {}
    }

    /**
     * Run the full Sentinel → Risk → Execute pipeline for a hot asset.
     */
    private async analyzeHotAsset(asset: AssetConfig, volumeSpike: number, momentum: number) {
        const snap = this.snapshots.get(asset.symbol);
        if (!snap) return;

        // Build a synthetic candle from the current data
        const syntheticCandle: OHLCCandle = {
            type: "KLINE",
            source: asset.exchange === "hyperliquid" ? "HYPERLIQUID" : asset.exchange === "mexc" ? "MEXC" : "ALPACA",
            symbol: asset.symbol,
            interval: "1m",
            open: snap.priceHistory.length > 0 ? snap.priceHistory[snap.priceHistory.length - 1] : snap.price,
            high: snap.price * 1.001,
            low: snap.price * 0.999,
            close: snap.price,
            volume: snap.volumeHistory.length > 0 ? snap.volumeHistory[snap.volumeHistory.length - 1] : 100,
            timestamp: Date.now(),
            isClosed: true,
        };

        // CEO announces the scan
        broadcastAgentState("ceo", "orchestrating", `Directing ${asset.symbol} scan`, "active");
        broadcastAgentLog("ceo",
            `🗣️ "Sentinel, he detectado actividad inusual en ${asset.symbol}. Analiza inmediatamente. Vol spike: ${volumeSpike.toFixed(1)}x, momentum: ${momentum > 0 ? "+" : ""}${momentum.toFixed(2)}%"`,
            "info");

        // Sentinel analyzes
        broadcastAgentState("sentinel", "analyzing", asset.symbol, "active");
        let signal: TradeSignal | null = null;

        try {
            signal = await this.sentinel.analyze(syntheticCandle);
        } catch (err: any) {
            broadcastAgentLog("sentinel", `❌ Error analizando ${asset.symbol}: ${err.message}`, "error");
            return;
        }

        if (!signal) {
            broadcastAgentLog("sentinel",
                `📉 "${asset.symbol}: Sin ventaja estadística tras análisis. Volviendo a standby."`,
                "info");
            broadcastAgentState("sentinel", "idle", asset.symbol, "idle");
            return;
        }

        this.stats.signalsGenerated++;

        // Force memecoin/aggressive fields
        if (asset.type === "memecoin") {
            signal.exchange = "mexc";
            (signal as any).aggressiveMode = true;
        }

        broadcastAgentLog("sentinel",
            `🎯 SEÑAL ${signal.action} en ${signal.symbol} @ $${signal.entry_price} | Confianza: ${signal.confidence}% | ${signal.rationale}`,
            "success");

        // CEO passes to Risk
        broadcastAgentLog("ceo",
            `🗣️ "Buena caza, Sentinel. Risk Guardian, evalúa ${signal.action} ${signal.symbol} $${signal.notional_usd}."`,
            "info");

        // Risk Manager evaluates
        broadcastAgentState("risk", "evaluating", `${signal.action} ${signal.symbol}`, "active");
        broadcastAgentLog("risk", `🛡️ Evaluando ${signal.action} ${signal.symbol}...`, "info");

        let evaluation: any;
        try {
            evaluation = await this.riskManager.evaluate(signal);
        } catch (err: any) {
            broadcastAgentLog("risk", `❌ Error en Risk Manager: ${err.message}`, "error");
            return;
        }

        if (evaluation.approved) {
            this.stats.tradesOpened++;
            broadcastAgentLog("risk", `✅ APROBADO: ${signal.action} ${signal.symbol} $${signal.notional_usd}`, "success");
            broadcastAgentLog("ceo",
                `🗣️ "¡Ejecutado! ${signal.action} ${signal.symbol} en PAPER. Buen trabajo equipo."`,
                "success");

            TelegramManager.broadcastAlert(
                `🏢 *TRADE ABIERTO (SCANNER)*\n🎯 ${signal.action} ${signal.symbol} @ $${signal.entry_price}\n💰 $${signal.notional_usd}\n📊 Vol spike: ${volumeSpike.toFixed(1)}x\n💡 ${signal.rationale}`
            );
        } else {
            this.stats.tradesRejected++;
            const reason = evaluation.details?.reason || evaluation.details?.error || "Filtro de riesgo";
            broadcastAgentLog("risk", `⛔ RECHAZADO: ${reason}`, "warn");
            broadcastAgentLog("ceo", `🗣️ "Entendido. ${signal.symbol} bloqueado. Motivo: ${reason}"`, "warn");
        }

        // Save to Supabase
        await saveAgentMemory("scanner", "last_scan", JSON.stringify({
            asset, volumeSpike, momentum, signal,
            approved: evaluation?.approved,
            timestamp: new Date().toISOString(),
        })).catch(() => { }); // Don't crash on RLS errors
    }

    public getStats() {
        return { ...this.stats, watchlistSize: this.dynamicWatchlist.length, activeAssets: this.snapshots.size };
    }

    public getWatchlist() {
        return this.dynamicWatchlist;
    }
}
