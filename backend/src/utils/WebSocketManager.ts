import WebSocket from "ws";
import EventEmitter from "events";
import { broadcastAgentState } from "./SwarmEvents";

/**
 * Tick normalizado. Todos los exchanges producen este mismo formato.
 */
export interface MarketTick {
    type: "TICK";
    source: "MEXC" | "ALPACA" | "HYPERLIQUID";
    symbol: string;
    price: number;
    volume: number;
    bidPrice?: number;
    askPrice?: number;
    timestamp: number;
}

export interface OHLCCandle {
    type: "KLINE";
    source: "MEXC" | "ALPACA" | "HYPERLIQUID";
    symbol: string;
    interval: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    timestamp: number;
    isClosed: boolean;
}

type MarketEvent = MarketTick | OHLCCandle;

/**
 * WebSocketManager
 * Conexiones WSS reales SOLO a los exchanges autorizados:
 *   - MEXC (Cripto)
 *   - Alpaca (Acciones/TradFi)
 *   - Hyperliquid (Perps DEX)
 * 
 * NO Binance. NO otros exchanges.
 */
export class WebSocketManager extends EventEmitter {
    private mexcWs: WebSocket | null = null;
    private alpacaWs: WebSocket | null = null;
    private hyperliquidWs: WebSocket | null = null;

    private reconnectDelay = 5000;

    private mexcSymbols: Set<string> = new Set();
    private alpacaSymbols: Set<string> = new Set();
    private hyperliquidSymbols: Set<string> = new Set();

    // ═══════════════════════════════════════════
    // 1. MEXC Public WebSocket 
    // ═══════════════════════════════════════════
    public connectMEXC(symbols: string[] = ["BTCUSDT", "ETHUSDT"]) {
        symbols.forEach(s => this.mexcSymbols.add(s));
        
        // If already open, just send new subscriptions
        if (this.mexcWs && this.mexcWs.readyState === WebSocket.OPEN) {
            const subscribeMsg = {
                method: "SUBSCRIPTION",
                params: symbols.flatMap(s => [
                    `spot@public.deals.v3.api@${s}`,
                    `spot@public.kline.v3.api@${s}@Min1`,
                    `spot@public.kline.v3.api@${s}@Min15`,
                ]),
            };
            this.mexcWs.send(JSON.stringify(subscribeMsg));
            return;
        }

        // Clean previous socket to avoid leaks
        if (this.mexcWs) this.mexcWs.close();

        const url = "wss://wbs.mexc.com/ws";
        console.log(`[WSManager] Connecting to MEXC WSS: ${Array.from(this.mexcSymbols).join(", ")}`);

        this.mexcWs = new WebSocket(url);

        this.mexcWs.on("open", () => {
            console.log("[WSManager] ✅ MEXC WSS CONNECTED (Real Market Data)");
            broadcastAgentState("sentinel", "connected_mexc", Array.from(this.mexcSymbols).join(", "), "success");

            // Subscribe to trade + kline streams for ALL known symbols
            const subscribeMsg = {
                method: "SUBSCRIPTION",
                params: Array.from(this.mexcSymbols).flatMap(s => [
                    `spot@public.deals.v3.api@${s}`,
                    `spot@public.kline.v3.api@${s}@Min1`,
                    `spot@public.kline.v3.api@${s}@Min15`,
                ]),
            };
            this.mexcWs!.send(JSON.stringify(subscribeMsg));
        });

        this.mexcWs.on("message", (raw: WebSocket.Data) => {
            try {
                const msg = JSON.parse(raw.toString());

                // Respond to MEXC pings
                if (msg.msg === "PONG" || msg.id !== undefined) return;

                const channel: string = msg.c || "";
                const data = msg.d;
                if (!data) return;

                // --- Live Deals (trades) ---
                if (channel.includes("deals")) {
                    const deals = data.deals || [];
                    for (const deal of deals) {
                        const tick: MarketTick = {
                            type: "TICK",
                            source: "MEXC",
                            symbol: msg.s || "UNKNOWN",
                            price: parseFloat(deal.p),
                            volume: parseFloat(deal.v),
                            timestamp: deal.t || Date.now(),
                        };
                        this.emit("tick", tick);
                    }
                }

                // --- Kline (candlesticks) ---
                if (channel.includes("kline")) {
                    const k = data;
                    const interval = channel.includes("Min15") ? "15m" : "1m";
                    const candle: OHLCCandle = {
                        type: "KLINE",
                        source: "MEXC",
                        symbol: msg.s || "UNKNOWN",
                        interval,
                        open: parseFloat(k.o),
                        high: parseFloat(k.h),
                        low: parseFloat(k.l),
                        close: parseFloat(k.c),
                        volume: parseFloat(k.v || "0"),
                        timestamp: k.t || Date.now(),
                        isClosed: !!k.x,
                    };
                    this.emit("kline", candle);

                    if (interval === "15m" && candle.isClosed) {
                        this.emit("candle_closed_15m", candle);
                    }
                }
            } catch (err) {
                // MEXC sends non-JSON pings, safely ignore
            }
        });

        // Keepalive ping every 15s (MEXC requirement)
        const pingInterval = setInterval(() => {
            if (this.mexcWs && this.mexcWs.readyState === WebSocket.OPEN) {
                this.mexcWs.send(JSON.stringify({ method: "PING" }));
            }
        }, 15000);

        this.mexcWs.on("close", () => {
            console.warn("[WSManager] ⚠️ MEXC WSS DISCONNECTED. Reconnecting...");
            clearInterval(pingInterval);
            broadcastAgentState("sentinel", "reconnecting", "MEXC", "error");
            setTimeout(() => this.connectMEXC(Array.from(this.mexcSymbols)), this.reconnectDelay);
        });

        this.mexcWs.on("error", (err) => {
            console.error("[WSManager] MEXC WSS Error:", err.message);
        });
    }

    // ═══════════════════════════════════════════
    // 2. ALPACA Market Data WebSocket (Free IEX tier)
    //    Docs: https://docs.alpaca.markets/docs/real-time-stock-pricing-data
    // ═══════════════════════════════════════════
    public connectAlpaca(symbols: string[] = ["AAPL", "TSLA", "SPY"]) {
        symbols.forEach(s => this.alpacaSymbols.add(s));

        const apiKey = process.env.ALPACA_API_KEY;
        const apiSecret = process.env.ALPACA_API_SECRET;

        if (!apiKey || !apiSecret) {
            console.warn("[WSManager] ⚠️ ALPACA keys not set. Skipping Alpaca stream.");
            return;
        }

        // If open and authenticated, just subscribe to new symbols
        if (this.alpacaWs && this.alpacaWs.readyState === WebSocket.OPEN) {
            this.alpacaWs.send(JSON.stringify({
                action: "subscribe",
                trades: symbols,
                bars: symbols,
            }));
            return;
        }

        if (this.alpacaWs) this.alpacaWs.close();

        const url = "wss://stream.data.alpaca.markets/v2/iex";
        console.log(`[WSManager] Connecting to Alpaca WSS: ${Array.from(this.alpacaSymbols).join(", ")}`);

        this.alpacaWs = new WebSocket(url);

        this.alpacaWs.on("open", () => {
            console.log("[WSManager] Alpaca WSS OPEN. Authenticating...");
            this.alpacaWs!.send(JSON.stringify({
                action: "auth",
                key: apiKey,
                secret: apiSecret,
            }));
        });

        this.alpacaWs.on("message", (raw: WebSocket.Data) => {
            try {
                const messages = JSON.parse(raw.toString());
                if (!Array.isArray(messages)) return;

                for (const msg of messages) {
                    if (msg.T === "success" && msg.msg === "authenticated") {
                        console.log("[WSManager] ✅ Alpaca AUTHENTICATED.");
                        broadcastAgentState("sentinel", "connected_alpaca", Array.from(this.alpacaSymbols).join(", "), "success");
                        this.alpacaWs!.send(JSON.stringify({
                            action: "subscribe",
                            trades: Array.from(this.alpacaSymbols),
                            bars: Array.from(this.alpacaSymbols),
                        }));
                    }

                    if (msg.T === "t") {
                        const tick: MarketTick = {
                            type: "TICK",
                            source: "ALPACA",
                            symbol: msg.S,
                            price: msg.p,
                            volume: msg.s,
                            timestamp: new Date(msg.t).getTime(),
                        };
                        this.emit("tick", tick);
                    }

                    if (msg.T === "b") {
                        const candle: OHLCCandle = {
                            type: "KLINE",
                            source: "ALPACA",
                            symbol: msg.S,
                            interval: "1m",
                            open: msg.o,
                            high: msg.h,
                            low: msg.l,
                            close: msg.c,
                            volume: msg.v,
                            timestamp: new Date(msg.t).getTime(),
                            isClosed: true,
                        };
                        this.emit("kline", candle);
                    }
                }
            } catch (err) {
                console.error("[WSManager] Alpaca parse error:", err);
            }
        });

        this.alpacaWs.on("close", () => {
            console.warn("[WSManager] ⚠️ Alpaca WSS DISCONNECTED. Reconnecting...");
            broadcastAgentState("sentinel", "reconnecting", "Alpaca", "error");
            setTimeout(() => this.connectAlpaca(Array.from(this.alpacaSymbols)), this.reconnectDelay);
        });

        this.alpacaWs.on("error", (err) => {
            console.error("[WSManager] Alpaca WSS Error:", err.message);
        });
    }

    // ═══════════════════════════════════════════
    // 3. HYPERLIQUID WebSocket (Public market data)
    //    Docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket
    // ═══════════════════════════════════════════
    public connectHyperliquid(symbols: string[] = ["BTC", "ETH"]) {
        symbols.forEach(s => this.hyperliquidSymbols.add(s));

        // If already connected, just send subscriptions
        if (this.hyperliquidWs && this.hyperliquidWs.readyState === WebSocket.OPEN) {
            for (const symbol of symbols) {
                this.hyperliquidWs.send(JSON.stringify({ method: "subscribe", subscription: { type: "trades", coin: symbol } }));
                this.hyperliquidWs.send(JSON.stringify({ method: "subscribe", subscription: { type: "l2Book", coin: symbol } }));
                this.hyperliquidWs.send(JSON.stringify({ method: "subscribe", subscription: { type: "candle", coin: symbol, interval: "1m" } }));
            }
            return;
        }

        if (this.hyperliquidWs) this.hyperliquidWs.close();

        const url = "wss://api.hyperliquid.xyz/ws";
        console.log(`[WSManager] Connecting to Hyperliquid WSS: ${Array.from(this.hyperliquidSymbols).join(", ")}`);

        this.hyperliquidWs = new WebSocket(url);

        this.hyperliquidWs.on("open", () => {
            console.log("[WSManager] ✅ Hyperliquid WSS CONNECTED");
            broadcastAgentState("sentinel", "connected_hyperliquid", Array.from(this.hyperliquidSymbols).join(", "), "success");

            // Subscribe to all tracked symbols
            for (const symbol of Array.from(this.hyperliquidSymbols)) {
                this.hyperliquidWs!.send(JSON.stringify({
                    method: "subscribe",
                    subscription: { type: "trades", coin: symbol },
                }));

                this.hyperliquidWs!.send(JSON.stringify({
                    method: "subscribe",
                    subscription: { type: "l2Book", coin: symbol },
                }));

                this.hyperliquidWs!.send(JSON.stringify({
                    method: "subscribe",
                    subscription: { type: "candle", coin: symbol, interval: "1m" },
                }));
            }
        });

        this.hyperliquidWs.on("message", (raw: WebSocket.Data) => {
            try {
                const msg = JSON.parse(raw.toString());

                if (msg.channel === "trades" && msg.data) {
                    for (const trade of msg.data) {
                        const tick: MarketTick = {
                            type: "TICK",
                            source: "HYPERLIQUID",
                            symbol: trade.coin || "UNKNOWN",
                            price: parseFloat(trade.px),
                            volume: parseFloat(trade.sz),
                            timestamp: trade.time || Date.now(),
                        };
                        this.emit("tick", tick);
                    }
                }

                if (msg.channel === "l2Book" && msg.data) {
                    // Emit best bid/ask for spread tracking
                    const book = msg.data;
                    if (book.levels && book.levels.length >= 2) {
                        const bids = book.levels[0]; // [[price, size], ...]
                        const asks = book.levels[1];
                        if (bids.length > 0 && asks.length > 0) {
                            const tick: MarketTick = {
                                type: "TICK",
                                source: "HYPERLIQUID",
                                symbol: book.coin || "UNKNOWN",
                                price: (parseFloat(bids[0].px) + parseFloat(asks[0].px)) / 2,
                                volume: 0,
                                bidPrice: parseFloat(bids[0].px),
                                askPrice: parseFloat(asks[0].px),
                                timestamp: Date.now(),
                            };
                            this.emit("tick", tick);

                        }
                    }
                }

                if (msg.channel === "candle" && msg.data) {
                    const k = msg.data;
                    const candle: OHLCCandle = {
                        type: "KLINE",
                        source: "HYPERLIQUID",
                        symbol: k.s || "UNKNOWN",
                        interval: k.i || "1m",
                        open: parseFloat(k.o),
                        high: parseFloat(k.h),
                        low: parseFloat(k.l),
                        close: parseFloat(k.c),
                        volume: parseFloat(k.v),
                        timestamp: k.t || Date.now(),
                        isClosed: false,
                    };
                    this.emit("kline", candle);
                }
            } catch (err) {
                // Ignore parse errors on non-JSON frames
                console.error("[WSManager] Hyperliquid parse error:", err);
            }
        });

        this.hyperliquidWs.on("close", () => {
            console.warn("[WSManager] ⚠️ Hyperliquid WSS DISCONNECTED. Reconnecting...");
            broadcastAgentState("sentinel", "reconnecting", "Hyperliquid", "error");
            setTimeout(() => this.connectHyperliquid(Array.from(this.hyperliquidSymbols)), this.reconnectDelay);
        });

        this.hyperliquidWs.on("error", (err) => {
            console.error("[WSManager] Hyperliquid WSS Error:", err.message);
        });
    }

    // ═══════════════════════════════════════════
    // Teardown
    // ═══════════════════════════════════════════
    public disconnectAll() {
        console.log("[WSManager] Disconnecting all exchange WebSockets...");
        if (this.mexcWs) this.mexcWs.close();
        if (this.alpacaWs) this.alpacaWs.close();
        if (this.hyperliquidWs) this.hyperliquidWs.close();
        this.removeAllListeners();
    }
}
