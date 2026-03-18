/**
 * MarketRadar.ts
 *
 * MASSIVE multi-market scanner that dynamically fetches the Top 200
 * most active symbols from MEXC and Hyperliquid REST APIs every 60s.
 *
 * Pre-filtering with FAST MATH (Node.js, zero LLM calls):
 *   - Volume spike anomaly detection
 *   - Momentum / velocity
 *   - Price change divergences
 *   - ATR calculation for dynamic SL/TP
 *
 * ONLY the top anomalies "wake up" the HunterAgent to save Groq tokens.
 */
import { broadcastAgentLog, _getIoInstance } from "../utils/SwarmEvents";
import { getTopUSEquities, getTopForexPairs, getTopSmallCapGappers } from "./TVScreener";

// ═══════════════════════════════════════════
// Types
// ═══════════════════════════════════════════

export interface RadarAsset {
    symbol: string;
    exchange: string;
    price: number;
    change_pct_24h: number;
    volume_24h: number;
    high_24h: number;
    low_24h: number;
    quoteVolume: number;
}

export interface RadarAnomaly {
    symbol: string;
    exchange: string;
    price: number;
    change_pct_24h: number;
    volume_24h: number;
    anomaly_score: number; // 0-100
    anomaly_reasons: string[];
    atr_pct: number;       // Average True Range as % of price
    suggested_sl_pct: number;
    suggested_tp_pct: number;
}

// ═══════════════════════════════════════════
// Tick data storage for rolling calculations
// ═══════════════════════════════════════════

interface TickHistory {
    prices: number[];
    volumes: number[];
    timestamps: number[];
}

const tickStore: Record<string, TickHistory> = {};
const MAX_TICKS = 120; // Keep last ~120 ticks per symbol

export function recordRadarTick(symbol: string, price: number, volume: number) {
    if (!tickStore[symbol]) {
        tickStore[symbol] = { prices: [], volumes: [], timestamps: [] };
    }
    const store = tickStore[symbol];
    store.prices.push(price);
    store.volumes.push(volume);
    store.timestamps.push(Date.now());
    if (store.prices.length > MAX_TICKS) {
        store.prices.shift();
        store.volumes.shift();
        store.timestamps.shift();
    }
}

// ═══════════════════════════════════════════
// REST API Fetchers
// ═══════════════════════════════════════════

export let cachedMEXCTickers: RadarAsset[] = [];
export let cachedHLTickers: RadarAsset[] = [];
export let cachedAlpacaTickers: RadarAsset[] = [];
export let cachedForexTickers: RadarAsset[] = [];
let lastFetchTime = 0;
const CACHE_TTL = 60_000; // 60 seconds

export function getRadarAssets(exchange: string): string[] {
    if (exchange === "HYPERLIQUID") {
        const envHl = (process.env.HL_SYMBOLS || "BTC,ETH").split(",");
        const radarHl = cachedHLTickers.map(t => t.symbol);
        return Array.from(new Set([...envHl, ...radarHl]));
    }
    if (exchange === "MEXC") {
        const envMexc = (process.env.MEXC_SYMBOLS || "BTCUSDT,ETHUSDT").split(",");
        const radarMexc = cachedMEXCTickers.map(t => t.symbol);
        return Array.from(new Set([...envMexc, ...radarMexc]));
    }
    if (exchange === "ALPACA") {
        return (process.env.STOCK_SYMBOLS || "AAPL,TSLA,SPY,NVDA,MSFT,AMZN,META,GOOGL,NFLX,AMD,INTC,PYPL,SQ,BA,DIS,JPM,V,MA").split(",");
    }
    if (exchange === "AXI") {
        return ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "GBPJPY", "AUDUSD", "USDCHF"];
    }
    return [];
}

/**
 * Fetches the top ~200 USDT pairs from MEXC by 24h volume.
 * Public API, no auth required.
 */
async function fetchMEXCTopTickers(): Promise<RadarAsset[]> {
    try {
        const resp = await fetch("https://api.mexc.com/api/v3/ticker/24hr");
        if (!resp.ok) throw new Error(`MEXC API ${resp.status}`);
        const data: any[] = await resp.json() as any[];

        return data
            .filter((t: any) => {
                const sym = t.symbol || "";
                const quoteVol = parseFloat(t.quoteVolume) || 0;
                // STRICT FILTERS:
                // 1. Must end in USDT
                if (!sym.endsWith("USDT")) return false;
                // 2. Base symbol must be 2-10 UPPERCASE LETTERS only (no numbers, no @, no junk)
                const base = sym.replace("USDT", "");
                if (!/^[A-Z]{2,10}$/.test(base)) return false;
                // 3. Minimum $5M 24h quote volume (liquidity filter)
                if (quoteVol < 5_000_000) return false;
                // 4. Price must be > 0
                if (parseFloat(t.lastPrice) <= 0) return false;
                return true;
            })
            .map((t: any) => ({
                symbol: t.symbol,
                exchange: "mexc",
                price: parseFloat(t.lastPrice) || 0,
                change_pct_24h: parseFloat(t.priceChangePercent) || 0,
                volume_24h: parseFloat(t.volume) || 0,
                high_24h: parseFloat(t.highPrice) || 0,
                low_24h: parseFloat(t.lowPrice) || 0,
                quoteVolume: parseFloat(t.quoteVolume) || 0,
            }))
            .sort((a, b) => b.quoteVolume - a.quoteVolume)
            .slice(0, 500); // Expanded to 500 assets
    } catch (err: any) {
        console.error(`[MarketRadar] MEXC fetch error: ${err.message}`);
        return cachedMEXCTickers;
    }
}

/**
 * Fetches all perp markets from Hyperliquid.
 */
async function fetchHyperliquidTickers(): Promise<RadarAsset[]> {
    try {
        const statsResp = await fetch("https://api.hyperliquid.xyz/info", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "metaAndAssetCtxs" }),
        });
        if (!statsResp.ok) throw new Error(`Hyperliquid API ${statsResp.status}`);
        const statsData = await statsResp.json() as any;
        const universe: any[] = statsData?.[0]?.universe || [];
        const assetCtxs: any[] = statsData?.[1] || [];

        const assets: RadarAsset[] = [];

        for (let i = 0; i < universe.length && i < assetCtxs.length; i++) {
            const sym = universe[i]?.name || "";
            if (!/^[A-Z0-9]{2,12}$/.test(sym)) continue;

            const ctx = assetCtxs[i];
            const price = parseFloat(ctx.markPx || "0");
            if (price <= 0) continue;

            const volume = parseFloat(ctx.dayNtlVlm || "0");
            // Min $500k notional volume for radar entry
            if (volume < 500_000) continue;

            const prevDayPx = parseFloat(ctx.prevDayPx || "0");
            const change = prevDayPx > 0 ? ((price - prevDayPx) / prevDayPx) * 100 : 0;

            assets.push({
                symbol: sym,
                exchange: "hyperliquid",
                price,
                change_pct_24h: +change.toFixed(2),
                volume_24h: volume,
                high_24h: price * (1 + Math.abs(change) / 200),
                low_24h: price * (1 - Math.abs(change) / 200),
                quoteVolume: volume,
            });
        }

        return assets.sort((a, b) => b.volume_24h - a.volume_24h); // All perps
    } catch (err: any) {
        console.error(`[MarketRadar] Hyperliquid fetch error: ${err.message}`);
        return cachedHLTickers;
    }
}

/**
 * Fetches active US Equities dynamically from TradingView Screener.
 * Combines Mega-Cap active stocks with Small-Cap Gappers.
 */
async function fetchAlpacaTickers(): Promise<RadarAsset[]> {
    try {
        const [equities, gappers] = await Promise.all([
            getTopUSEquities(100),       // Mega/Large caps with high volume
            getTopSmallCapGappers(100)   // Small/Micro caps moving >4%
        ]);
        
        const combined = [...(equities || []), ...(gappers || [])];
        
        // Deduplicate by symbol just in case
        const unique = Array.from(new Map(combined.map(item => [item.symbol, item])).values());
        
        if (unique.length > 0) return unique;
    } catch (err) { }
    return cachedAlpacaTickers;
}

/**
 * Fetches active Forex pairs dynamically from TradingView Screener.
 */
async function fetchForexTickers(): Promise<RadarAsset[]> {
    try {
        const forex = await getTopForexPairs(30); // Get top 30 active pairs
        if (forex && forex.length > 0) return forex;
    } catch (err) { }
    return cachedForexTickers;
}

/**
 * Get fresh combined tickers from all exchanges.
 */
export async function getRadarTickers(): Promise<RadarAsset[]> {
    const now = Date.now();
    if (now - lastFetchTime < CACHE_TTL && (cachedMEXCTickers.length > 0 || cachedHLTickers.length > 0)) {
        return [...cachedMEXCTickers, ...cachedHLTickers, ...cachedAlpacaTickers, ...cachedForexTickers];
    }

    const [mexc, hl, alpaca, forex] = await Promise.all([
        fetchMEXCTopTickers(),
        fetchHyperliquidTickers(),
        fetchAlpacaTickers(),
        fetchForexTickers()
    ]);

    cachedMEXCTickers = mexc;
    cachedHLTickers = hl;
    cachedAlpacaTickers = alpaca;
    cachedForexTickers = forex;
    lastFetchTime = now;

    console.log(`[MarketRadar] Refreshed: ${mexc.length} MEXC + ${hl.length} Hyperliquid + ${alpaca.length} Alpaca + ${forex.length} Forex = ${mexc.length + hl.length + alpaca.length + forex.length} total activos escaneados.`);
    return [...mexc, ...hl, ...alpaca, ...forex];
}

// ═══════════════════════════════════════════
// PRE-FILTER: Fast math anomaly detection (zero LLM)
// ═══════════════════════════════════════════

/**
 * Scans all tickers and returns only the TOP anomalies worth investigating.
 * This runs in pure TypeScript — no Groq calls — saving tokens.
 *
 * Scoring criteria:
 *   - Volume spike vs 24h average
 *   - Absolute price change magnitude
 *   - Price near daily high/low (breakout potential)
 *   - Tick velocity (recent momentum from live data)
 */
export async function detectAnomalies(maxResults: number = 10): Promise<RadarAnomaly[]> {
    const tickers = await getRadarTickers();
    const anomalies: RadarAnomaly[] = [];

    for (const asset of tickers) {
        if (asset.price <= 0) continue;

        let score = 0;
        const reasons: string[] = [];

        // 1. Absolute 24h change magnitude
        const absChange = Math.abs(asset.change_pct_24h);
        if (absChange > 15) {
            score += 30;
            reasons.push(`Movimiento extremo 24h: ${asset.change_pct_24h > 0 ? "+" : ""}${asset.change_pct_24h}%`);
        } else if (absChange > 8) {
            score += 20;
            reasons.push(`Movimiento fuerte 24h: ${asset.change_pct_24h > 0 ? "+" : ""}${asset.change_pct_24h}%`);
        } else if (absChange > 4) {
            score += 10;
            reasons.push(`Movimiento moderado 24h: ${asset.change_pct_24h > 0 ? "+" : ""}${asset.change_pct_24h}%`);
        }

        // 2. Price near daily high (breakout) or low (bounce)
        if (asset.high_24h > 0 && asset.low_24h > 0) {
            const range = asset.high_24h - asset.low_24h;
            if (range > 0) {
                const posInRange = (asset.price - asset.low_24h) / range;
                if (posInRange > 0.95) {
                    score += 15;
                    reasons.push(`Cerca del máximo 24h (breakout potencial)`);
                } else if (posInRange < 0.05) {
                    score += 10;
                    reasons.push(`Cerca del mínimo 24h (rebote potencial)`);
                }
            }
        }

        // 3. Volume anomaly: high quoteVolume relative to price
        if (asset.quoteVolume > 50_000_000) {
            score += 15;
            reasons.push(`Volumen masivo: $${(asset.quoteVolume / 1_000_000).toFixed(1)}M`);
        } else if (asset.quoteVolume > 10_000_000) {
            score += 8;
            reasons.push(`Volumen alto: $${(asset.quoteVolume / 1_000_000).toFixed(1)}M`);
        }

        // 4. Live tick velocity (if we have tick data)
        const ticks = tickStore[asset.symbol];
        if (ticks && ticks.prices.length >= 10) {
            const recent = ticks.prices.slice(-5);
            const older = ticks.prices.slice(-15, -5);
            if (older.length > 0) {
                const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
                const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
                const velocity = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;
                if (Math.abs(velocity) > 0.5) {
                    score += 20;
                    reasons.push(`Velocidad reciente: ${velocity > 0 ? "+" : ""}${velocity.toFixed(2)}%`);
                }
            }

            // Volume spike from ticks
            const recentVol = ticks.volumes.slice(-10).reduce((a, b) => a + b, 0);
            const totalVol = ticks.volumes.reduce((a, b) => a + b, 0);
            const avgVolPerTick = totalVol / ticks.volumes.length;
            const recentAvgVol = recentVol / Math.min(10, ticks.volumes.length);
            if (avgVolPerTick > 0 && recentAvgVol > avgVolPerTick * 2) {
                score += 15;
                reasons.push(`Spike de volumen reciente: ${(recentAvgVol / avgVolPerTick).toFixed(1)}x`);
            }
        }

        // Calculate ATR-based SL/TP
        const atr_pct = asset.high_24h > 0 && asset.low_24h > 0
            ? ((asset.high_24h - asset.low_24h) / asset.price) * 100
            : absChange * 0.5;

        const suggested_sl = Math.max(0.5, Math.min(atr_pct * 0.75, 5.0)); // 0.75x ATR, capped at 5%
        const suggested_tp = suggested_sl * 2.5; // Minimum 1:2.5 R:R

        if (score >= 8) { // Sensibilidad aumentada (antes 15)
            anomalies.push({
                symbol: asset.symbol,
                exchange: asset.exchange,
                price: asset.price,
                change_pct_24h: asset.change_pct_24h,
                volume_24h: asset.volume_24h,
                anomaly_score: Math.min(score, 100),
                anomaly_reasons: reasons,
                atr_pct: +atr_pct.toFixed(2),
                suggested_sl_pct: +suggested_sl.toFixed(2),
                suggested_tp_pct: +suggested_tp.toFixed(2),
            });
        }
    }

    // Sort by anomaly score, return top results
    const topAnomalies = anomalies
        .sort((a, b) => b.anomaly_score - a.anomaly_score)
        .slice(0, maxResults);

    // 🚨 EMITE LOS DATOS AL FRONTEND CADA VEZ QUE ESCANEA 🚨
    const io = _getIoInstance();
    if (io) {
        io.emit('market_tick', {
            symbol: 'SCANNER',
            data: topAnomalies
        });
    }

    return topAnomalies;
}

/**
 * Quick summary for the LLM: how many assets scanned, how many anomalies, top 3
 */
export async function getRadarSummary(): Promise<string> {
    const tickers = await getRadarTickers();
    const anomalies = await detectAnomalies(10);

    const summary = {
        timestamp: new Date().toISOString(),
        total_assets_scanned: tickers.length,
        exchanges: {
            mexc: cachedMEXCTickers.length,
            hyperliquid: cachedHLTickers.length,
        },
        anomalies_detected: anomalies.length,
        top_anomalies: anomalies.slice(0, 5).map(a => ({
            symbol: a.symbol,
            exchange: a.exchange,
            price: a.price,
            change_24h: `${a.change_pct_24h > 0 ? "+" : ""}${a.change_pct_24h}%`,
            anomaly_score: a.anomaly_score,
            reasons: a.anomaly_reasons,
            atr_pct: a.atr_pct,
            suggested_sl: `${a.suggested_sl_pct}%`,
            suggested_tp: `${a.suggested_tp_pct}%`,
        })),
        hint: "Use get_deep_data(symbol) to investigate any anomaly. Use fetch_news_and_macro(symbol) for fundamental context before deciding.",
    };

    broadcastAgentLog("hunter",
        `📡 Radar: ${tickers.length} activos escaneados → ${anomalies.length} anomalías detectadas`,
        "info");

    return JSON.stringify(summary, null, 2);
}
