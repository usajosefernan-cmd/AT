import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { broadcastAgentState, broadcastAgentLog, _setIoInstance } from "./src/utils/SwarmEvents";
import { WebSocketManager, MarketTick, OHLCCandle } from "./src/utils/WebSocketManager";
import { PaperExecutionEngine } from "./src/engine/PaperExecutionEngine";
import { AILoop } from "./src/engine/AILoop";
import { TelegramManager } from "./src/utils/TelegramManager";
import { updatePaperBalance, savePaperPosition, supabase } from "./src/utils/supabaseClient";
import { MarketScannerLoop } from "./src/engine/MarketScannerLoop";

// ═══════════════════════════════════════════
// 1. Express + HTTP Server
// ═══════════════════════════════════════════
const app = express();

// Configure CORS for production and local development
const corsOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://algotradingnew-josfer.web.app"
];

app.use(cors({
    origin: corsOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
}));

app.use(express.json());

const server = http.createServer(app);

// ═══════════════════════════════════════════
// 2. Socket.io -> Frontend Dashboard
// ═══════════════════════════════════════════
// Initialize Socket.io directly to set CORS and Auth middleware
const io = new Server(server, {
    cors: {
        origin: corsOrigins,
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Middleware for Socket.io authentication
// In dev mode (default), allow connections without JWT for localhost development.
// In production, require a valid Supabase JWT.
io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    const isProduction = process.env.MODE === "PRODUCTION";

    if (!token) {
        if (isProduction) {
            return next(new Error("Authentication error: No token provided"));
        }
        // Dev mode: allow unauthenticated connections for localhost
        console.log("[Socket.io] Dev mode: allowing unauthenticated connection", socket.id);
        return next();
    }

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
        if (isProduction) {
            return next(new Error("Authentication error: Invalid or expired token"));
        }
        console.warn("[Socket.io] Dev mode: token invalid but allowing connection", socket.id);
        return next();
    }

    // Auth passed
    next();
});

// Now we connect SwarmEvents with this authenticated IO instance
_setIoInstance(io);

// ═══════════════════════════════════════════
// 3. Real Market WebSocket Manager
//    SOLO: Hyperliquid (cripto), MEXC (memecoins), Alpaca (acciones)
// ═══════════════════════════════════════════
const wsManager = new WebSocketManager();

// ═══════════════════════════════════════════
// 4. Paper Execution Engine
// ═══════════════════════════════════════════
const paperEngine = new PaperExecutionEngine(
    parseFloat(process.env.PAPER_INITIAL_BALANCE || "10000")
);

// ═══════════════════════════════════════════
// 5. Telegram Bot
// ═══════════════════════════════════════════
const telegram = new TelegramManager();

// Precio en vivo compartido entre todos los módulos
const latestPrices: Record<string, number> = {};

// ═══════════════════════════════════════════
// 6. AI Loop — EL CEREBRO
//    Conecta: WSS → Sentinel(Groq) → Risk(Claude) → Execute → Supabase
// ═══════════════════════════════════════════
const aiLoop = new AILoop(paperEngine, telegram, latestPrices);

// ═══════════════════════════════════════════
// 6b. SWARM ORCHESTRATOR — Especialistas multi-mercado
// ═══════════════════════════════════════════
import { SwarmOrchestrator } from "./src/engine/SwarmOrchestrator";
const swarmOrchestrator = new SwarmOrchestrator(aiLoop.riskManager);

// Instanciar el Scanner Proactivo (Nueva generación)
const marketScanner = new MarketScannerLoop(
    aiLoop.sentinel,
    aiLoop.riskManager,
    paperEngine,
    telegram,
    latestPrices
);

// Re-wire CEOAgent to use SwarmOrchestrator for force_analysis
(aiLoop.ceoAgent as any).toolExecutor.onForceAnalysis = () => swarmOrchestrator.runScanCycle();

let swarmInterval: NodeJS.Timeout | null = null;
function startSwarm() {
    if (swarmInterval) clearInterval(swarmInterval);
    
    // Iniciar el enjambre de especialistas (cada 45s)
    swarmInterval = setInterval(async () => {
        await swarmOrchestrator.runScanCycle();
    }, 45000);

    // Iniciar el Scanner Proactivo (cada 5s internamente)
    marketScanner.start();
}
function stopSwarm() {
    if (swarmInterval) clearInterval(swarmInterval);
    swarmInterval = null;
    marketScanner.stop();
}

import { getRadarAssets } from "./src/tools/MarketRadar";

// ═══════════════════════════════════════════
// 7. Real Market Data → Frontend + PaperEngine + AILoop + Hunter
// ═══════════════════════════════════════════

import { recordTick } from "./src/tools/ExplorationTools";

wsManager.on("tick", (tick: MarketTick) => {
    latestPrices[tick.symbol] = tick.price;
    io.emit("market_tick", tick);
    paperEngine.onRealTick(tick);

    // Feed the radar for velocity calculation
    recordTick(tick.symbol, tick.price, tick.volume || 0);
    
    // Feed the proactive scanner
    marketScanner.onTick(tick.symbol, tick.price, tick.volume || 0);
});

wsManager.on("kline", (candle: OHLCCandle) => {
    io.emit("market_kline", candle);
});

// Conectar AILoop: Sentinel candles + Telegram CEO handler
aiLoop.wire(wsManager);


// ═══════════════════════════════════════════
// 8. Paper Engine Events → Frontend + Supabase + Telegram
// ═══════════════════════════════════════════
paperEngine.on("pnl_update", (data) => io.emit("paper_pnl", data));

paperEngine.on("position_opened", async (pos) => {
    io.emit("paper_position_opened", pos);
    await savePaperPosition(pos);
});

paperEngine.on("position_closed", async (pos) => {
    io.emit("paper_position_closed", pos);
    await savePaperPosition(pos);
    const emoji = pos.realizedPnl >= 0 ? "🟢" : "🔴";
    telegram.broadcastAlert(
        `${emoji} * Posición Cerrada *\n${pos.symbol} ${pos.side} \nPnL: $${pos.realizedPnl.toFixed(2)} \nRazón: ${pos.status} `
    );
});

paperEngine.on("account_update", async (snapshot) => {
    io.emit("paper_account", snapshot);
    await updatePaperBalance(snapshot.balance, snapshot.equity, snapshot.dailyDrawdown, snapshot.maxDrawdown);
});

paperEngine.on("drawdown_alert", (alert) => {
    io.emit("paper_drawdown_alert", alert);
    broadcastAgentState("risk", "drawdown_warning", `${alert.type}: ${alert.current.toFixed(2)}% `, "error");
    telegram.broadcastAlert(
        `⚠️ * DRAWDOWN *\n${alert.type}: ${alert.current.toFixed(2)}% / ${alert.limit}%`
    );
});

// ═══════════════════════════════════════════
// 9. API Endpoints
// ═══════════════════════════════════════════

// CEO command from Dashboard Chat — now goes through the real CEOAgent with LLM
app.post("/api/command", async (req, res) => {
    try {
        const { command } = req.body;
        const response = await aiLoop.ceoAgent.processMessage(command);
        res.json({ success: true, response });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// CEO message from Telegram — also goes through the real CEOAgent
app.post("/api/telegram-webhook", async (req, res) => {
    try {
        const { message } = req.body;
        const response = await aiLoop.handleTelegramMessage(message);
        res.json({ success: true, response });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Kill Switch
app.post("/api/killswitch", (_req, res) => {
    paperEngine.liquidateAll(latestPrices);
    broadcastAgentState("ceo", "killswitch_activated", "ALL HALTED", "error");
    telegram.broadcastAlert("🛑 *KILL SWITCH* desde Dashboard.");
    res.json({ success: true });
});

// ═══ FORCE ANALYSIS — Bypass candle timer, run pipeline NOW ═══
app.post("/api/force-analysis", async (_req, res) => {
    try {
        console.log(`\n🔴 [FORCE ANALYSIS] Manual trigger from Dashboard`);
        await swarmOrchestrator.runScanCycle();
        res.json({ success: true, result: { message: "Swarm scan triggered manually" } });
    } catch (error: any) {
        console.error(`[FORCE ANALYSIS] Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// ═══ CONFIG — Read/Write system_config in Supabase ═══
app.get("/api/config", async (_req, res) => {
    try {
        const { data, error } = await supabase
            .from("system_config")
            .select("*");
        if (error) {
            // Table may not exist — return empty config (frontend uses defaults)
            return res.json({ success: true, config: [] });
        }
        res.json({ success: true, config: data || [] });
    } catch (error: any) {
        // Fallback: return empty config so frontend works with defaults
        res.json({ success: true, config: [] });
    }
});

app.put("/api/config", async (req, res) => {
    try {
        const { key, value } = req.body;
        const { error } = await supabase
            .from("system_config")
            .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
        if (error) throw error;
        // Hot-reload risk limits into the running RiskManager
        if (key.startsWith("risk_")) {
            aiLoop.reloadRiskConfig(key, value);
        }
        io.emit("config_updated", { key, value });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Portfolio state
app.get("/api/positions", (_req, res) => {
    res.json({
        positions: paperEngine.getOpenPositionsSnapshot(),
        equity: paperEngine.getEquity(),
        balance: paperEngine.account.balance,
        dailyDrawdown: paperEngine.getDailyDrawdownPct(),
        maxDrawdown: paperEngine.getMaxDrawdownPct(),
        totalPnl: paperEngine.account.totalPnl,
    });
});

// AI Loop stats
app.get("/api/ai-stats", (_req, res) => {
    res.json(aiLoop.getStats());
});

// ═══ MARKET HISTORY — REAL DATA PROXY ═══
app.get("/api/history", async (req, res) => {
    try {
        const { symbol, exchange, interval = "1m", limit = 100 } = req.query;
        if (!symbol) return res.status(400).json({ error: "Missing symbol" });

        // Default to Binance for high-quality chart data if exchange specific isn't ready
        // Most symbols match (BTC-USDT -> BTCUSDT)
        let binanceSymbol = String(symbol).replace("-", "").replace("/", "");
        if (!binanceSymbol.endsWith("USDT") && !binanceSymbol.includes("USD")) binanceSymbol += "USDT";

        const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${binanceSymbol.toUpperCase()}&interval=${interval}&limit=${limit}`);
        const data = await response.json();

        if (!Array.isArray(data)) throw new Error("Invalid response from provider");

        const candles = data.map((d: any) => ({
            timestamp: d[0],
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5]),
            isClosed: true
        }));

        res.json({ success: true, candles });
    } catch (error: any) {
        console.error(`[HISTORY API] Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// ═══ SPECIALIST COMMAND — Direct interaction ═══
app.post("/api/specialist-command", async (req, res) => {
    try {
        const { agentId, message } = req.body;
        // Broadcast the specific command to the agent stream
        broadcastAgentState(agentId, "USER_COMMAND", `Comando recibido: ${message}`, "active");

        // Simulating a response from the specific specialist
        const response = `Entendido. Soy el especialista ${agentId}. He procesado tu comando: "${message}". Monitorizando el mercado con prioridad en este parámetro.`;

        setTimeout(() => {
            broadcastAgentState(agentId, "AGENT_REPLY", response, "success");
        }, 1000);

        res.json({ success: true, response });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Radar assets for frontend drop-downs
app.get("/api/radar/:exchange", (req, res) => {
    try {
        const symbols = getRadarAssets(req.params.exchange.toUpperCase());
        res.json({ success: true, symbols });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Health + latest prices
app.get("/api/health", (_req, res) => {
    res.json({
        status: "running",
        mode: "PAPER",
        uptime: process.uptime(),
        connectedClients: io.engine?.clientsCount || 0,
        latestPrices,
        aiStats: aiLoop.getStats(),
        swarmRunning: swarmInterval !== null,
    });
});

// ═══════════════════════════════════════════
// 9b. SWARM CONTROL — Pause/Resume to save tokens
// ═══════════════════════════════════════════
app.post("/api/hunter/pause", (_req, res) => {
    stopSwarm();
    io.emit("hunter_status", { running: false });
    res.json({ success: true, message: "Swarm PAUSED. All specialists resting." });
});

app.post("/api/hunter/resume", (_req, res) => {
    startSwarm();
    io.emit("hunter_status", { running: true });
    res.json({ success: true, message: "Swarm RESUMED. Specialists scanning markets." });
});

app.get("/api/hunter/stats", (_req, res) => {
    res.json({ running: swarmInterval !== null });
});

// ═══════════════════════════════════════════
// 10. Socket.io event handlers for bidirectional chat
// ═══════════════════════════════════════════

// 🚨 HEARTBEAT CONSTANTE CADA 2 SEGUNDOS PARA EL DASHBOARD 🚨
setInterval(() => {
    io.emit('agent_log', {
        agent: 'SYSTEM',
        message: 'Heartbeat del servidor: ' + new Date().toISOString()
    });
}, 2000);

io.on("connection", (socket) => {
    // Bidirectional chat: frontend sends command → CEO processes → response emitted back
    socket.on("user_command", async (data: { text: string }) => {
        try {
            broadcastAgentLog("ceo", `💬 Comando recibido del Dashboard: "${data.text}"`, "info");
            const response = await aiLoop.ceoAgent.processMessage(data.text);
            socket.emit("ceo_response", { text: response, timestamp: Date.now() });
            broadcastAgentLog("ceo", `🤖 Respuesta: ${response.slice(0, 200)}`, "success");
        } catch (err: any) {
            socket.emit("ceo_response", { text: `Error: ${err.message}`, timestamp: Date.now() });
            broadcastAgentLog("ceo", `❌ Error procesando comando: ${err.message}`, "error");
        }
    });

    // Handle manual market subscription from Dashboard
    socket.on("subscribe_market", (data: { exchange: string, symbol: string }) => {
        console.log(`[Socket] Client requested subscription: ${data.exchange} - ${data.symbol}`);
        broadcastAgentLog("system", `🔄 Monitoreando activo: ${data.symbol} (${data.exchange})`, "info");

        if (data.exchange === "HYPERLIQUID") {
            wsManager.connectHyperliquid([data.symbol]);
        } else if (data.exchange === "MEXC") {
            wsManager.connectMEXC([data.symbol]);
        } else if (data.exchange === "ALPACA") {
            wsManager.connectAlpaca([data.symbol]);
        }
    });
});

// ═══════════════════════════════════════════
// 11. Start Everything
// ═══════════════════════════════════════════
const PORT = parseInt(process.env.PORT || "8080", 10);

server.listen(PORT, "0.0.0.0", () => {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  🧠 MULTI-AGENT TRADING SYSTEM`);
    console.log(`  📊 Mode: PAPER (Real Data, Virtual Execution)`);
    console.log(`  ⚙️  Listening on: 0.0.0.0:${PORT}`);
    console.log(`  🔒 Supabase Auth Middleware ACTIVE`);
    console.log(`  🔗 CORS Allowed: ${corsOrigins.join(", ")}`);
    console.log(`${"═".repeat(60)}\n`);

    // HYPERLIQUID: Cripto principal
    const hlSymbols = (process.env.HL_SYMBOLS || "BTC,ETH").split(",");
    wsManager.connectHyperliquid(hlSymbols);

    // MEXC: Memecoins spot
    const mexcSymbols = (process.env.MEXC_SYMBOLS || "BTCUSDT,ETHUSDT").split(",");
    wsManager.connectMEXC(mexcSymbols);

    // ALPACA: Acciones US
    const stockSymbols = (process.env.STOCK_SYMBOLS || "AAPL,TSLA,SPY").split(",");
    wsManager.connectAlpaca(stockSymbols);

    // Telegram
    telegram.start();

    // 🤖 START AUTONOMOUS SWARM ORCHESTRATOR
    startSwarm();

    console.log(`  📡 Hyperliquid (Cripto):  ${hlSymbols.join(", ")}`);
    console.log(`  📡 MEXC (Memecoins):      ${mexcSymbols.join(", ")}`);
    console.log(`  📡 Alpaca (Acciones):     ${stockSymbols.join(", ")}`);
    console.log(`  🤖 Sentinel:  Groq / Llama-3.3-70b`);
    console.log(`  🛡️  Risk Mgr: Groq / Llama-3.3-70b (Feedback Loops)`);
    console.log(`  👨‍💼 CEO:       Groq / Llama-3.3-70b`);
    console.log(`  📱 Telegram:  @elreydelmambot`);
    console.log(`  🦅 SWARM:     Memecoin, CryptoPerp, Equities, Forex (Every 45s)`);
    console.log(`\n  Pipeline: Radar → Orchestrator → Specialist → RiskManager → Supabase`);
    console.log(`${"═".repeat(60)}\n`);
});

process.on("SIGTERM", () => {
    stopSwarm();
    wsManager.disconnectAll();
    telegram.stop();
    server.close();
});
