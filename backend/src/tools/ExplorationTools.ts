/**
 * ExplorationTools.ts — v2
 *
 * Dynamic tools for the HunterAgent LLM via Tool Calling.
 * NOW powered by MarketRadar: dynamically scans 200+ assets from MEXC + Hyperliquid.
 *
 * Tools:
 *   - get_market_movers: Top anomalies from 250+ assets (pre-filtered by fast math)
 *   - get_deep_data: Detailed price analysis for a specific symbol
 *   - fetch_news_and_macro: Headlines + macro context + sentiment for a symbol
 *   - discard_and_continue: Explicit discard with reasoning
 *   - submit_trade_proposal: Trade proposal with REQUIRED ATR-based SL/TP
 */

import { broadcastAgentLog } from "../utils/SwarmEvents";
import { detectAnomalies, getRadarSummary, recordRadarTick } from "./MarketRadar";

// Live data from server.ts
let _latestPrices: Record<string, number> = {};
let _tickData: Record<string, { prices: number[]; volumes: number[]; count: number; lastUpdate: number }> = {};

export function injectLiveData(latestPrices: Record<string, number>) {
    _latestPrices = latestPrices;
}

export function recordTick(symbol: string, price: number, volume: number) {
    // Store locally + feed radar
    if (!_tickData[symbol]) {
        _tickData[symbol] = { prices: [], volumes: [], count: 0, lastUpdate: 0 };
    }
    const entry = _tickData[symbol];
    entry.prices.push(price);
    entry.volumes.push(volume);
    entry.count += 1;
    entry.lastUpdate = Date.now();
    if (entry.prices.length > 120) { entry.prices.shift(); entry.volumes.shift(); }

    // Feed the MarketRadar too
    recordRadarTick(symbol, price, volume);
}

// ═══════════════════════════════════════════
// TOOL DEFINITIONS (OpenAI function calling format)
// ═══════════════════════════════════════════

export const EXPLORATION_TOOL_DEFS = [
    {
        type: "function" as const,
        function: {
            name: "get_market_movers",
            description: "Scans 200+ assets across MEXC (spot) and Hyperliquid (perps) using real-time REST API data. Pre-filters with fast math to find volume anomalies, breakouts, and momentum. Returns ONLY the top anomalies worth investigating. Call this FIRST to decide where to look.",
            parameters: {
                type: "object",
                properties: {
                    exchange: {
                        type: "string",
                        enum: ["all", "hyperliquid", "mexc"],
                        description: "Which exchange to scan. Use 'all' for maximum coverage."
                    }
                },
                required: ["exchange"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "get_deep_data",
            description: "Gets detailed technical analysis for a specific symbol: price history, volatility, momentum, velocity, ATR, and suggested SL/TP levels. Use AFTER get_market_movers to investigate a promising anomaly.",
            parameters: {
                type: "object",
                properties: {
                    symbol: {
                        type: "string",
                        description: "The symbol to investigate (e.g. BTC, ETHUSDT, PEPEUSDT)"
                    }
                },
                required: ["symbol"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "fetch_news_and_macro",
            description: "Fetches real-time financial news headlines, crypto sentiment, and macro context for a specific asset. Use this BEFORE deciding to trade — check if the technical signal has a fundamental catalyst backing it.",
            parameters: {
                type: "object",
                properties: {
                    symbol: {
                        type: "string",
                        description: "The symbol to get news and macro context for"
                    }
                },
                required: ["symbol"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "discard_and_continue",
            description: "Explicitly discard an asset because it lacks statistical edge. Explain WHY. The loop restarts and you scan again.",
            parameters: {
                type: "object",
                properties: {
                    symbol: { type: "string", description: "Symbol to discard" },
                    reason: { type: "string", description: "Why this asset has no edge right now" }
                },
                required: ["symbol", "reason"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "submit_trade_proposal",
            description: "Submit a trade to the Risk Manager. MANDATORY: You MUST provide ATR-based stop_loss_pct and take_profit_pct. Minimum R:R is 1:2. The Risk Manager will reject trades without proper exit levels.",
            parameters: {
                type: "object",
                properties: {
                    symbol: { type: "string", description: "Asset to trade" },
                    action: { type: "string", enum: ["LONG", "SHORT"], description: "Direction" },
                    exchange: { type: "string", enum: ["hyperliquid", "mexc"], description: "Exchange" },
                    confidence: { type: "number", description: "Your conviction 0-100" },
                    entry_price: { type: "number", description: "Entry price" },
                    stop_loss_pct: { type: "number", description: "REQUIRED: Stop loss % based on ATR (e.g. 1.5 for 1.5%). Must be > 0.3%" },
                    take_profit_pct: { type: "number", description: "REQUIRED: Take profit % (must be ≥ 2x stop_loss_pct for 1:2 R:R)" },
                    notional_usd: { type: "number", description: "Position size $200-$1000 (paper)" },
                    rationale: { type: "string", description: "Full reasoning: technical + fundamental + risk analysis" },
                    catalyst: { type: "string", description: "The fundamental catalyst or news event backing this trade" }
                },
                required: ["symbol", "action", "exchange", "confidence", "entry_price", "stop_loss_pct", "take_profit_pct", "notional_usd", "rationale"]
            }
        }
    }
];

// ═══════════════════════════════════════════
// TOOL IMPLEMENTATIONS
// ═══════════════════════════════════════════

export function executeExplorationTool(toolName: string, args: any): string | Promise<string> {
    switch (toolName) {
        case "get_market_movers":
            return getMarketMovers(args.exchange);
        case "get_deep_data":
            return getDeepData(args.symbol);
        case "fetch_news_and_macro":
            return fetchNewsAndMacro(args.symbol);
        case "discard_and_continue":
            return discardAndContinue(args.symbol, args.reason);
        case "submit_trade_proposal":
            return submitTradeProposal(args);
        default:
            return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
}

/**
 * get_market_movers — Now powered by MarketRadar (200+ assets, pre-filtered)
 */
async function getMarketMovers(exchange: string): Promise<string> {
    try {
        const summary = await getRadarSummary();
        return summary;
    } catch (err: any) {
        return JSON.stringify({
            error: `Radar scan failed: ${err.message}`,
            fallback: "Try again in 10 seconds. The exchange APIs may be rate-limited."
        });
    }
}

/**
 * get_deep_data — Fetches REAL klines from MEXC/Hyperliquid API
 * and calculates RSI(14), MACD(12,26,9), ATR(14) in pure TypeScript.
 */
export async function getDeepData(symbol: string): Promise<string> {
    // Normalize symbol for MEXC (needs USDT suffix)
    const mexcSymbol = symbol.endsWith("USDT") ? symbol : symbol + "USDT";

    let closes: number[] = [];
    let highs: number[] = [];
    let lows: number[] = [];
    let volumes: number[] = [];
    let source = "unknown";

    // 1. Try MEXC REST Klines (5m candles, last 100)
    try {
        const url = `https://api.mexc.com/api/v3/klines?symbol=${mexcSymbol}&interval=5m&limit=100`;
        const resp = await fetch(url);
        if (resp.ok) {
            const data: any[] = await resp.json() as any[];
            if (data.length >= 20) {
                for (const k of data) {
                    highs.push(parseFloat(k[2]));
                    lows.push(parseFloat(k[3]));
                    closes.push(parseFloat(k[4]));
                    volumes.push(parseFloat(k[5]));
                }
                source = "mexc_5m";
            }
        }
    } catch { }

    // 2. Fallback: Hyperliquid candle API
    if (closes.length < 20) {
        try {
            const hlResp = await fetch("https://api.hyperliquid.xyz/info", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "candleSnapshot",
                    req: { coin: symbol.replace("USDT", ""), interval: "5m", startTime: Date.now() - 100 * 5 * 60 * 1000, endTime: Date.now() }
                }),
            });
            if (hlResp.ok) {
                const data: any[] = await hlResp.json() as any[];
                if (data.length >= 20) {
                    for (const k of data) {
                        highs.push(parseFloat(k.h));
                        lows.push(parseFloat(k.l));
                        closes.push(parseFloat(k.c));
                        volumes.push(parseFloat(k.v || "0"));
                    }
                    source = "hyperliquid_5m";
                }
            }
        } catch { }
    }

    if (closes.length < 20) {
        return JSON.stringify({
            symbol,
            status: "NO_KLINE_DATA",
            message: `No kline data from MEXC or Hyperliquid for ${symbol}. This symbol may be delisted or illiquid. DISCARD IT.`,
        });
    }

    // ═══ Calculate RSI(14) ═══
    const rsi = calcRSI(closes, 14);

    // ═══ Calculate MACD(12, 26, 9) ═══
    const macdResult = calcMACD(closes, 12, 26, 9);

    // ═══ Calculate ATR(14) ═══
    const atr = calcATR(highs, lows, closes, 14);
    const lastClose = closes[closes.length - 1];
    const atr_pct = lastClose > 0 ? (atr / lastClose) * 100 : 0;

    // ═══ SL/TP based on ATR ═══
    const sl_pct = Math.max(0.5, Math.min(atr_pct * 1.5, 5.0));
    const tp_pct = sl_pct * 2.5;

    // ═══ Trend analysis ═══
    const ema9 = calcEMA(closes, 9);
    const ema21 = calcEMA(closes, 21);
    const trendEMA = ema9 > ema21 ? "BULLISH" : ema9 < ema21 ? "BEARISH" : "SIDEWAYS";

    // ═══ Volume analysis ═══
    const recentVol = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const volRatio = avgVol > 0 ? +(recentVol / avgVol).toFixed(2) : 1;

    const result = {
        symbol,
        source,
        status: "LIVE_KLINES",
        candles_analyzed: closes.length,
        current_price: +lastClose.toFixed(6),
        // ─── REAL INDICATORS ───
        RSI_14: rsi !== null ? +rsi.toFixed(1) : null,
        RSI_signal: rsi !== null ? (rsi > 70 ? "OVERBOUGHT" : rsi < 30 ? "OVERSOLD" : "NEUTRAL") : "N/A",
        MACD_line: +macdResult.macd.toFixed(6),
        MACD_signal_line: +macdResult.signal.toFixed(6),
        MACD_histogram: +macdResult.histogram.toFixed(6),
        MACD_cross: macdResult.histogram > 0 && macdResult.prevHistogram <= 0 ? "BULLISH_CROSS"
            : macdResult.histogram < 0 && macdResult.prevHistogram >= 0 ? "BEARISH_CROSS"
                : macdResult.histogram > 0 ? "BULLISH" : "BEARISH",
        ATR_14: +atr.toFixed(6),
        ATR_pct: +atr_pct.toFixed(2),
        EMA_9: +ema9.toFixed(6),
        EMA_21: +ema21.toFixed(6),
        trend: trendEMA,
        // ─── VOLUME ───
        volume_ratio: volRatio,
        volume_signal: volRatio > 2 ? "SPIKE" : volRatio > 1.3 ? "ELEVATED" : "NORMAL",
        // ─── EXITS ───
        suggested_SL_pct: +sl_pct.toFixed(2),
        suggested_TP_pct: +tp_pct.toFixed(2),
        risk_reward: `1:${(tp_pct / sl_pct).toFixed(1)}`,
        // ─── SUMMARY ───
        analysis: `RSI=${rsi?.toFixed(0)} | MACD=${macdResult.histogram > 0 ? "Alcista" : "Bajista"} | Trend=${trendEMA} | Vol=${volRatio}x | ATR=${atr_pct.toFixed(1)}%`,
    };

    broadcastAgentLog("hunter",
        `📈 ${symbol}: RSI=${rsi?.toFixed(0)} MACD=${macdResult.histogram > 0 ? "↑" : "↓"} ATR=${atr_pct.toFixed(1)}% Vol=${volRatio}x`,
        "info");

    return JSON.stringify(result, null, 2);
}

// ═══════════════════════════════════════════
// INDICATOR MATH (pure TypeScript, zero deps)
// ═══════════════════════════════════════════

function calcRSI(closes: number[], period: number): number | null {
    if (closes.length < period + 1) return null;
    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff;
        else losses += Math.abs(diff);
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function calcEMA(data: number[], period: number): number {
    if (data.length === 0) return 0;
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
        ema = data[i] * k + ema * (1 - k);
    }
    return ema;
}

function calcMACD(closes: number[], fast: number, slow: number, signal: number) {
    const ema12 = calcEMAArray(closes, fast);
    const ema26 = calcEMAArray(closes, slow);
    const macdLine: number[] = [];
    for (let i = 0; i < closes.length; i++) {
        macdLine.push(ema12[i] - ema26[i]);
    }
    const signalLine = calcEMAArray(macdLine, signal);
    const lastIdx = closes.length - 1;
    const macd = macdLine[lastIdx] || 0;
    const sig = signalLine[lastIdx] || 0;
    const hist = macd - sig;
    const prevHist = lastIdx > 0 ? (macdLine[lastIdx - 1] || 0) - (signalLine[lastIdx - 1] || 0) : 0;
    return { macd, signal: sig, histogram: hist, prevHistogram: prevHist };
}

function calcEMAArray(data: number[], period: number): number[] {
    const result: number[] = [data[0]];
    const k = 2 / (period + 1);
    for (let i = 1; i < data.length; i++) {
        result.push(data[i] * k + result[i - 1] * (1 - k));
    }
    return result;
}

function calcATR(highs: number[], lows: number[], closes: number[], period: number): number {
    const trueRanges: number[] = [];
    for (let i = 1; i < highs.length; i++) {
        const tr = Math.max(
            highs[i] - lows[i],
            Math.abs(highs[i] - closes[i - 1]),
            Math.abs(lows[i] - closes[i - 1])
        );
        trueRanges.push(tr);
    }
    if (trueRanges.length < period) {
        return trueRanges.length > 0 ? trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length : 0;
    }
    // Use last `period` TRs
    const recent = trueRanges.slice(-period);
    return recent.reduce((a, b) => a + b, 0) / period;
}

/**
 * fetch_news_and_macro — Financial headlines + crypto sentiment + macro context
 * Uses CryptoCompare News API (free) and CoinGecko for sentiment
 */
export async function fetchNewsAndMacro(symbol: string): Promise<string> {
    const cleanSymbol = symbol.replace("USDT", "").replace("USD", "").toUpperCase();

    const results: any = {
        symbol: cleanSymbol,
        timestamp: new Date().toISOString(),
        headlines: [],
        crypto_fear_greed: null,
        macro_context: null,
    };

    // 1. Fetch crypto news from CryptoCompare (free, no key needed for limited calls)
    try {
        const newsResp = await fetch(
            `https://min-api.cryptocompare.com/data/v2/news/?categories=${cleanSymbol}&limit=5`
        );
        if (newsResp.ok) {
            const newsData = await newsResp.json() as any;
            if (newsData.Data) {
                results.headlines = newsData.Data.slice(0, 5).map((n: any) => ({
                    title: n.title,
                    source: n.source,
                    published: new Date(n.published_on * 1000).toISOString(),
                    sentiment: n.title.toLowerCase().includes("bull") || n.title.toLowerCase().includes("surge") || n.title.toLowerCase().includes("rally")
                        ? "POSITIVE"
                        : n.title.toLowerCase().includes("crash") || n.title.toLowerCase().includes("bear") || n.title.toLowerCase().includes("dump")
                            ? "NEGATIVE"
                            : "NEUTRAL",
                }));
            }
        }
    } catch { }

    // 2. Fetch Fear & Greed Index (crypto market sentiment)
    try {
        const fgResp = await fetch("https://api.alternative.me/fng/?limit=1");
        if (fgResp.ok) {
            const fgData = await fgResp.json() as any;
            const fg = fgData.data?.[0];
            if (fg) {
                results.crypto_fear_greed = {
                    value: parseInt(fg.value),
                    label: fg.value_classification, // e.g. "Extreme Greed", "Fear"
                    interpretation: parseInt(fg.value) > 70
                        ? "Mercado en Extreme Greed. Precaución: posible corrección."
                        : parseInt(fg.value) < 30
                            ? "Mercado en Fear. Posible oportunidad de compra contrarian."
                            : "Sentimiento neutral.",
                };
            }
        }
    } catch { }

    // 3. Basic macro context
    results.macro_context = {
        day_of_week: new Date().toLocaleDateString("es-ES", { weekday: "long" }),
        time_utc: new Date().toUTCString(),
        note: "Crypto markets operate 24/7. Equities: check if NYSE/NASDAQ is open (9:30-16:00 ET).",
        key_events: "Check Fed rate decisions, CPI data, employment reports for macro impact.",
    };

    // Summary for the LLM
    const headlineCount = results.headlines.length;
    const positiveNews = results.headlines.filter((h: any) => h.sentiment === "POSITIVE").length;
    const negativeNews = results.headlines.filter((h: any) => h.sentiment === "NEGATIVE").length;

    results.analysis_hint = headlineCount === 0
        ? `Sin noticias recientes para ${cleanSymbol}. El movimiento puede ser puramente técnico.`
        : `${headlineCount} noticias: ${positiveNews} positivas, ${negativeNews} negativas. ${positiveNews > negativeNews ? "Sentimiento informativo positivo." : negativeNews > positiveNews ? "Sentimiento informativo negativo, precaución." : "Sin sesgo claro."}`;

    broadcastAgentLog("hunter", `📰 News ${cleanSymbol}: ${headlineCount} titulares, FG Index: ${results.crypto_fear_greed?.value || "N/A"}`, "info");

    return JSON.stringify(results, null, 2);
}

function discardAndContinue(symbol: string, reason: string): string {
    broadcastAgentLog("hunter", `🗑️ Descartado ${symbol}: ${reason}`, "warn");
    return JSON.stringify({
        discarded: symbol,
        reason,
        action: "CONTINUE_SCANNING",
        message: "Asset discarded. Call get_market_movers() again to find the next opportunity."
    });
}

function submitTradeProposal(args: any): string {
    // Validate ATR-based exits are provided
    if (!args.stop_loss_pct || args.stop_loss_pct < 0.3) {
        return JSON.stringify({
            error: "REJECTED: stop_loss_pct is required and must be >= 0.3%. Calculate from ATR.",
            action: "FIX_AND_RETRY"
        });
    }
    if (!args.take_profit_pct || args.take_profit_pct < args.stop_loss_pct * 1.5) {
        return JSON.stringify({
            error: `REJECTED: take_profit_pct must be >= ${(args.stop_loss_pct * 1.5).toFixed(1)}% (minimum R:R 1:1.5). Your TP: ${args.take_profit_pct}%`,
            action: "FIX_AND_RETRY"
        });
    }

    return JSON.stringify({ __trade_proposal: true, ...args });
}
