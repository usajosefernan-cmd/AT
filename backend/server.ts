import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { broadcastAgentState, broadcastAgentLog, _setIoInstance } from "./src/utils/SwarmEvents";
import { WebSocketManager, MarketTick, OHLCCandle } from "./src/utils/WebSocketManager";
import { PaperExecutionEngine } from "./src/engine/PaperExecutionEngine";
import { CronOrchestrator } from "./src/engine/CronOrchestrator";
import { AILoop } from "./src/engine/AILoop";
import { ProfileParser } from "./src/agents/ProfileParser";
import { TelegramManager } from "./src/utils/TelegramManager";
import { updatePaperBalance, savePaperPosition, supabase, saveMarketRules, loadMarketRules, seedUserAccounts } from "./src/utils/supabaseClient";
import { MarketScannerLoop } from "./src/engine/MarketScannerLoop";
import { loadPixelAssets } from "./src/PixelAssetsLoader";
import { AXI_SELECT_RULES, MARKET_RULES, HYPERLIQUID_CONFIG, MEXC_CONFIG, ALPACA_CONFIG, updateRule } from "./src/config/ExchangeManager";
import path from "path";

// Pre-load Pixel Assets
let pixelAssetsCache: any = null;

// ═══════════════════════════════════════════
// 1. Express + HTTP Server
// ═══════════════════════════════════════════
const app = express();

// Configure CORS for production and local development
const corsOrigins: any = process.env.MODE === "PRODUCTION"
    ? ["https://algotradingnew-josfer.web.app", "https://algotradingnew.firebaseapp.com"]
    : true; // true reflects the request origin, allowing any origin with credentials

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
    // Store user info on socket for later use
    (socket as any).userId = user.id;
    console.log(`[Socket.io] Authenticated user: ${user.email} (${user.id.slice(0, 8)})`);

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
// 4. Paper Execution Engine & Institutional Clocks
//    DEFERRED: Will initialize with userId from first auth
// ═══════════════════════════════════════════

// The active user id — set from socket auth or env var
let activeUserId: string = process.env.DEFAULT_USER_ID || '';
let paperEngine: PaperExecutionEngine | null = null;
let cronOrchestrator: CronOrchestrator | null = null;

/**
 * Helper: extract userId from HTTP Authorization header.
 * Falls back to activeUserId (set by socket connection).
 */
async function getUserIdFromReq(req: express.Request): Promise<string> {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (user && !error) return user.id;
    }
    return activeUserId;
}

/**
 * Initialize or reinitialize the PaperEngine for a given user.
 */
async function initEngineForUser(userId: string) {
    if (paperEngine && activeUserId === userId) return; // Already initialized for this user
    activeUserId = userId;
    console.log(`[Server] 🚀 Initializing engine for user ${userId.slice(0, 8)}...`);

    // Seed accounts if new user
    await seedUserAccounts(userId);

    paperEngine = new PaperExecutionEngine(userId);
    await paperEngine.ready;

    // Load market rules from Supabase for this user
    const savedRules = await loadMarketRules(userId);
    if (savedRules) {
        for (const [key, val] of Object.entries(savedRules)) {
            updateRule(`market_${key}`, val);
        }
    }

    cronOrchestrator?.destroy();
    cronOrchestrator = new CronOrchestrator(paperEngine);

    console.log(`[Server] ✅ Engine ready for user ${userId.slice(0, 8)}`);
}

// Precio en vivo compartido entre todos los módulos
const latestPrices: Record<string, number> = {};

// ═══════════════════════════════════════════
// 6. AI Loop, Swarm, Scanner — DEFERRED until engine is ready
// ═══════════════════════════════════════════
import { SwarmOrchestrator } from "./src/engine/SwarmOrchestrator";
import { SwarmAutonomyLoop } from "./src/engine/SwarmAutonomyLoop";
import { getRadarAssets } from "./src/tools/MarketRadar";
import { recordTick } from "./src/tools/ExplorationTools";

let aiLoop: AILoop | null = null;
let marketScanner: MarketScannerLoop | null = null;
let swarmOrchestrator: SwarmOrchestrator | null = null;
let engineSystemsWired = false;

/**
 * Wire up all engine-dependent systems (AILoop, Swarm, Scanner, event listeners).
 * Called once after initEngineForUser.
 */
function wireEngineSystems() {
    if (engineSystemsWired || !paperEngine) return;
    engineSystemsWired = true;

    aiLoop = new AILoop(paperEngine, TelegramManager, latestPrices);
    swarmOrchestrator = new SwarmOrchestrator(aiLoop.riskManager);
    marketScanner = new MarketScannerLoop(
        aiLoop.sentinel,
        aiLoop.riskManager,
        paperEngine,
        TelegramManager,
        latestPrices
    );

    // Re-wire CEOAgent 
    (aiLoop.ceoAgent as any).toolExecutor.onForceAnalysis = () => swarmOrchestrator!.runScanCycle();

    // Connect AILoop to WSS
    aiLoop.wire(wsManager);

    // Paper Engine Events → Frontend + Telegram
    paperEngine.on("pnl_update", (data) => io.emit("paper_pnl", data));

    paperEngine.on("position_opened", async (pos) => {
        io.emit("paper_position_opened", pos);
        const sideEmoji = pos.side === 'LONG' ? '🟢' : '🔴';
        TelegramManager.broadcastAlert(
            `${sideEmoji} *TRADE ABIERTO*\n` +
            `${pos.symbol} ${pos.side}\n` +
            `Precio: $${pos.entryPrice?.toFixed(2) || '?'}\n` +
            `Tamaño: $${pos.notional?.toFixed(0) || '?'}\n` +
            `Leverage: ${pos.leverage || 1}x\n` +
            `Agente: ${pos.agent || 'Scanner'}\n` +
            (pos.rationale ? `Razón: ${pos.rationale.slice(0, 120)}` : '')
        );
    });

    paperEngine.on("position_closed", async (pos) => {
        io.emit("paper_position_closed", pos);
        const emoji = pos.realizedPnl >= 0 ? "🟢" : "🔴";
        TelegramManager.broadcastAlert(
            `${emoji} * Posición Cerrada *\n${pos.symbol} ${pos.side} \nPnL: $${pos.realizedPnl.toFixed(2)} \nRazón: ${pos.status} `
        );
    });

    paperEngine.on("account_update", (snapshot) => {
        io.emit("paper_account", snapshot);
    });

    paperEngine.on("drawdown_alert", (alert) => {
        io.emit("paper_drawdown_alert", alert);
        broadcastAgentState("risk", "drawdown_warning", `${alert.type}: ${alert.current.toFixed(2)}% `, "error");
    });

    console.log(`[Server] ✅ All engine systems wired.`);
}

function startSwarm() {
    if (!paperEngine || !marketScanner) return;
    SwarmAutonomyLoop.setPaperEngine(paperEngine);
    SwarmAutonomyLoop.start();
    marketScanner.start();
    TelegramManager.init(process.env.TELEGRAM_BOT_TOKEN || "");
}
function stopSwarm() {
    SwarmAutonomyLoop.stop();
    if (marketScanner) marketScanner.stop();
}

// ═══════════════════════════════════════════
// 7. Real Market Data → Frontend + PaperEngine
// ═══════════════════════════════════════════

wsManager.on("tick", (tick: MarketTick) => {
    latestPrices[tick.symbol] = tick.price;
    io.emit("market_tick", tick);
    if (paperEngine) paperEngine.onRealTick(tick);
    recordTick(tick.symbol, tick.price, tick.volume || 0);
    if (marketScanner) marketScanner.onTick(tick.symbol, tick.price, tick.volume || 0);
});

wsManager.on("kline", (candle: OHLCCandle) => {
    io.emit("market_kline", candle);
});

// drawdown_alert is wired inside wireEngineSystems()

// ═══════════════════════════════════════════
// 9. API Endpoints
// ═══════════════════════════════════════════

// CEO command from Dashboard Chat — now goes through the real CEOAgent with LLM
app.post("/api/command", async (req, res) => {
    try {
        if (!aiLoop) return res.status(503).json({ error: "Engine not ready" });
        const { command } = req.body;
        const response = await aiLoop.ceoAgent.processMessage(command);
        res.json({ success: true, response });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// CEO chat from AgentRooms
app.post("/api/ceo/chat", async (req, res) => {
    try {
        if (!aiLoop) return res.status(503).json({ error: "Engine not ready" });
        const { message, market } = req.body;
        const rules = MARKET_RULES[market] || {};
        const enrichedMsg = `${message}\n\n[CONTEXTO DEL MERCADO: ${market}]\nReglas: Leverage=${(rules as any).maxLeverage || 1}x, Position=${(rules as any).maxPositionPct || 20}%, Risk/Trade=${(rules as any).maxRiskPerTradePct || 3}%, Estilo=${(rules as any).style || 'swing'}, MaxHold=${(rules as any).maxHoldMinutes || '∞'}min`;
        const reply = await aiLoop.ceoAgent.processMessage(enrichedMsg);
        res.json({ success: true, reply });
    } catch (error: any) {
        res.status(500).json({ error: error.message, reply: "Error interno del CEO." });
    }
});

// Get per-market rules
app.get("/api/config/market-rules", (_req, res) => {
    res.json({ success: true, markets: MARKET_RULES });
});

// CEO message from Telegram — also goes through the real CEOAgent
app.post("/api/telegram-webhook", async (req, res) => {
    try {
        if (!aiLoop) return res.status(503).json({ error: "Engine not ready" });
        const { message } = req.body;
        const response = await aiLoop.handleTelegramMessage(message);
        res.json({ success: true, response });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Kill Switch
app.post("/api/killswitch", (_req, res) => {
    if (!paperEngine) return res.status(503).json({ error: "Engine not ready" });
    paperEngine.liquidateAll(latestPrices);
    broadcastAgentState("ceo", "killswitch_activated", "ALL HALTED", "error");
    TelegramManager.broadcastAlert("🛑 *KILL SWITCH* desde Dashboard.");
    res.json({ success: true });
});

// ═══ FORCE ANALYSIS — Bypass candle timer, run pipeline NOW ═══
app.post("/api/force-analysis", async (_req, res) => {
    try {
        if (!swarmOrchestrator) return res.status(503).json({ error: "Engine not ready" });
        console.log(`\n🔴 [FORCE ANALYSIS] Manual trigger from Dashboard`);
        await swarmOrchestrator.runScanCycle();
        res.json({ success: true, result: { message: "Swarm scan triggered manually" } });
    } catch (error: any) {
        console.error(`[FORCE ANALYSIS] Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// ═══ CONFIG — Read/Write system_config in Supabase ═══
app.get("/api/config", async (req, res) => {
    try {
        const userId = await getUserIdFromReq(req);
        if (!userId) return res.json({ success: true, config: [] });
        const { data, error } = await supabase
            .from("system_config")
            .select("*")
            .eq("user_id", userId);
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
        const userId = await getUserIdFromReq(req);
        if (!userId) return res.status(401).json({ error: "Not authenticated" });
        const { key, value } = req.body;
        const { error } = await supabase
            .from("system_config")
            .upsert({ key, value, user_id: userId, updated_at: new Date().toISOString() }, { onConflict: "key,user_id" });
        if (error) throw error;
        if (key.startsWith("risk_") && aiLoop) {
            aiLoop.reloadRiskConfig(key, value);
        }
        if (key.startsWith("agent_")) {
            await ProfileParser.reloadConfig();
        }
        io.emit("config_updated", { key, value });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ═══ RISK CONFIG — Live risk parameter editor ═══
app.get("/api/config/risk", (_req, res) => {
    res.json({
        success: true,
        rules: AXI_SELECT_RULES,
        markets: MARKET_RULES,
        exchanges: {
            hyperliquid: { maxNotional: HYPERLIQUID_CONFIG.maxNotionalPerTrade, maxPositions: HYPERLIQUID_CONFIG.maxOpenPositions },
            mexc: { maxNotional: MEXC_CONFIG.maxNotionalPerTrade, maxPositions: MEXC_CONFIG.maxOpenPositions },
            alpaca: { maxNotional: ALPACA_CONFIG.maxNotionalPerTrade, maxPositions: ALPACA_CONFIG.maxOpenPositions },
        }
    });
});

app.post("/api/config/risk", async (req, res) => {
    try {
        const userId = await getUserIdFromReq(req);
        if (!userId) return res.status(401).json({ error: "Not authenticated" });
        const updates = req.body;
        for (const [key, value] of Object.entries(updates)) {
            updateRule(key, value);
            if (aiLoop) aiLoop.reloadRiskConfig(key, value);
        }
        io.emit("config_updated", { risk: AXI_SELECT_RULES, markets: MARKET_RULES });
        saveMarketRules(MARKET_RULES, userId).catch(e => console.error('[Supabase] Save error:', e));
        const marketKeys = Object.entries(updates).filter(([k]) => k.startsWith("market_"));
        if (marketKeys.length > 0) {
            const upserts = marketKeys.map(([key, value]) => ({
                key,
                value: String(value),
                user_id: userId,
                updated_at: new Date().toISOString(),
            }));
            supabase.from("system_config").upsert(upserts, { onConflict: "key,user_id" })
                .then(({ error }) => { if (error) console.error('[Supabase] market_* save error:', error); });
        }
        if (paperEngine) {
            for (const [key, value] of Object.entries(updates)) {
                paperEngine.updateConfig(key, value);
            }
        }
        res.json({ success: true, rules: AXI_SELECT_RULES, markets: MARKET_RULES });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});
// ═══ ECOSYSTEM PROFILES — Named config presets per market ═══
app.get("/api/config/profiles/:ecosystem", async (req, res) => {
    try {
        const userId = await getUserIdFromReq(req);
        if (!userId) return res.json({ success: true, profiles: [] });
        const eco = req.params.ecosystem;
        const prefix = `eco_profile__${eco}__`;
        const { data, error } = await supabase
            .from("system_config")
            .select("*")
            .eq("user_id", userId)
            .like("key", `${prefix}%`);
        if (error) return res.json({ success: true, profiles: [] });
        const profiles = (data || []).map(row => ({
            name: row.key.replace(prefix, ""),
            data: JSON.parse(row.value || "{}"),
        }));
        res.json({ success: true, profiles });
    } catch (error: any) {
        res.json({ success: true, profiles: [] });
    }
});

app.post("/api/config/profiles", async (req, res) => {
    try {
        const userId = await getUserIdFromReq(req);
        if (!userId) return res.status(401).json({ error: "Not authenticated" });
        const { ecosystem, name, data } = req.body;
        if (!ecosystem || !name) return res.status(400).json({ error: "ecosystem and name required" });
        const key = `eco_profile__${ecosystem}__${name}`;
        const { error } = await supabase
            .from("system_config")
            .upsert({ key, value: JSON.stringify(data), user_id: userId, updated_at: new Date().toISOString() }, { onConflict: "key,user_id" });
        if (error) throw error;
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.delete("/api/config/profiles", async (req, res) => {
    try {
        const userId = await getUserIdFromReq(req);
        if (!userId) return res.status(401).json({ error: "Not authenticated" });
        const { ecosystem, name } = req.body;
        if (!ecosystem || !name) return res.status(400).json({ error: "ecosystem and name required" });
        const key = `eco_profile__${ecosystem}__${name}`;
        const { error } = await supabase.from("system_config").delete().eq("key", key).eq("user_id", userId);
        if (error) throw error;
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ═══ PAPER ENGINE CONTROLS — Reset DD + Balance ═══
app.post("/api/paper/reset-dd", (_req, res) => {
    if (!paperEngine) return res.status(503).json({ error: "Engine not ready" });
    paperEngine.resetDailyDrawdown();
    paperEngine.updateConfig("risk_max_daily_dd_pct", AXI_SELECT_RULES.maxDailyDrawdownPct);
    paperEngine.updateConfig("risk_max_total_dd_pct", AXI_SELECT_RULES.maxTotalDrawdownPct);
    io.emit("paper_dd_reset", { dailyDrawdown: paperEngine.getMaxDailyDrawdownPct() });
    res.json({ success: true, message: "Daily drawdown reset. Trading desbloqueado.", dailyDD: paperEngine.getMaxDailyDrawdownPct() });
});

app.post("/api/paper/reset-balance", async (req, res) => {
    const newBalance = parseFloat(req.body?.balance) || 10000;
    if (!paperEngine) return res.status(503).json({ error: "Engine not ready" });
    const userId = await getUserIdFromReq(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    
    try {
        await supabase.from("paper_positions").delete().eq("user_id", userId).neq('id', 'NONE');
        
        for (const m of Object.keys(paperEngine.accounts)) {
            const acc = paperEngine.accounts[m];
            acc.balance = newBalance;
            acc.initialBalance = newBalance;
            acc.peakBalance = newBalance;
            acc.dailyStartBalance = newBalance;
            acc.totalPnl = 0;
            acc.closedPositions = [];
            acc.positions.clear();
            
            await supabase.from("paper_account").upsert({
                id: m,
                user_id: userId,
                balance: newBalance,
                equity: newBalance,
                daily_drawdown: 0,
                max_drawdown: 0,
                total_pnl: 0,
                initial_balance: newBalance,
                peak_balance: newBalance,
                daily_start_balance: newBalance,
                updated_at: new Date().toISOString()
            }, { onConflict: "id,user_id" });
        }
        paperEngine.emitAccountUpdate();
        io.emit("paper_balance_reset", { balance: newBalance });
        res.json({ success: true, balance: newBalance, message: `Balance reiniciado a $${newBalance}` });
    } catch (e: any) {
        console.error("Error resetting balance in DB", e);
        res.status(500).json({ success: false, error: e.message });
    }
});
// Portfolio state
app.get("/api/positions", async (_req, res) => {
    if (!paperEngine) return res.json({ positions: [], equity: 0, balance: 0, dailyDrawdown: 0, maxDrawdown: 0, totalPnl: 0 });
    await paperEngine.ready;
    res.json({
        positions: paperEngine.getOpenPositionsSnapshot(),
        equity: paperEngine.getTotalEquity(),
        balance: paperEngine.getTotalBalance(),
        dailyDrawdown: paperEngine.getMaxDailyDrawdownPct(),
        maxDrawdown: paperEngine.getMaxTotalDrawdownPct(),
        totalPnl: paperEngine.getTotalPnL(),
    });
});

// AI Loop stats
app.get("/api/ai-stats", (_req, res) => {
    if (!aiLoop) return res.json({});
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
        aiStats: aiLoop ? aiLoop.getStats() : {},
        swarmRunning: (SwarmAutonomyLoop as any).isRunning,
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
    const TelemetryLogger = require("./src/utils/TelemetryLogger").TelemetryLogger;
    const llmCalls = TelemetryLogger.getTotalCalls();

    res.json({ 
        running: (SwarmAutonomyLoop as any).isRunning,
        llmCalls: llmCalls,
        totalCycles: (SwarmAutonomyLoop as any).getScanCount ? (SwarmAutonomyLoop as any).getScanCount() : 0,
        anomaliesFound: 0,
        tradeProposals: 0
    });
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

io.on("connection", async (socket) => {
    // Initialize engine on first authenticated connection
    const socketUserId = (socket as any).userId as string;
    if (socketUserId && !paperEngine) {
        await initEngineForUser(socketUserId);
        wireEngineSystems();
        startSwarm();
    } else if (socketUserId && activeUserId !== socketUserId) {
        engineSystemsWired = false;
        await initEngineForUser(socketUserId);
        wireEngineSystems();
    }

    socket.on("request_pixel_assets", () => {
        if (pixelAssetsCache) {
            console.log(`📡 [WSS] Enviando Pixel Assets bajo demanda al CLI ${socket.id}`);
            socket.emit("pixel_assets_loaded", pixelAssetsCache);
        }
    });

    socket.on("user_command", async (data: { text: string }) => {
        try {
            if (!aiLoop) return socket.emit("ceo_response", { text: "Engine not ready", timestamp: Date.now() });
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

    // Enviar assets estáticos del Pixel Office al frontend
    if (pixelAssetsCache) {
        socket.emit("pixel_assets_loaded", pixelAssetsCache);
    }
});
// ═══════════════════════════════════════════
// 11. Start Everything
// ═══════════════════════════════════════════
const PORT = parseInt(process.env.PORT || "8080", 10);

server.listen(PORT, "0.0.0.0", async () => {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  🧠 MULTI-AGENT TRADING SYSTEM`);
    console.log(`  📊 Mode: PAPER (Real Data, Virtual Execution)`);
    console.log(`  ⚙️  Listening on: 0.0.0.0:${PORT}`);
    console.log(`  🔒 Supabase Auth Middleware ACTIVE`);
    console.log(`  🔗 CORS Allowed: ${Array.isArray(corsOrigins) ? corsOrigins.join(", ") : "ALL (dev mode)"}`);
    console.log(`${"═".repeat(60)}\n`);

    // Market rules are now loaded per-user in initEngineForUser()
    console.log("[Startup] Engine init deferred until first authenticated connection.");

    // Load system_config from Supabase (persisted UI settings like risk_max_daily_dd_pct)
    try {
        const { data: configData, error: configError } = await supabase.from("system_config").select("*");
        if (!configError && configData) {
            let loadedCount = 0;
            for (const row of configData) {
                if (row.key.startsWith("risk_") || row.key.startsWith("market_")) {
                    updateRule(row.key, row.value);
                    loadedCount++;
                }
            }
            console.log(`[Startup] ✅ system_config cargado desde Supabase: ${loadedCount} reglas aplicadas.`);
        }
    } catch (e) {
        console.warn("[Startup] ⚠️ No se pudo cargar system_config desde Supabase:", e);
    }

    // Load AI Profiles & System Prompts
    try {
        await ProfileParser.bootstrap();
        console.log(`[Startup] ✅ ProfileParser inicializado.`);
    } catch (e) {
        console.warn("[Startup] ⚠️ Error inicializando ProfileParser:", e);
    }

    // Sync PaperEngine DD limits after market rules load (deferred - engine may not exist yet)
    if (paperEngine) {
        paperEngine.updateConfig("risk_max_daily_dd_pct", AXI_SELECT_RULES.maxDailyDrawdownPct);
        paperEngine.updateConfig("risk_max_total_dd_pct", AXI_SELECT_RULES.maxTotalDrawdownPct);
    }
    console.log(`[Startup] DD limits: daily=${AXI_SELECT_RULES.maxDailyDrawdownPct}%, total=${AXI_SELECT_RULES.maxTotalDrawdownPct}%`);

    // HYPERLIQUID: Cripto principal
    const hlSymbols = (process.env.HL_SYMBOLS || "BTC,ETH").split(",");
    wsManager.connectHyperliquid(hlSymbols);

    // MEXC: Memecoins spot
    const mexcSymbols = (process.env.MEXC_SYMBOLS || "BTCUSDT,ETHUSDT").split(",");
    wsManager.connectMEXC(mexcSymbols);

    // ALPACA: Acciones US
    const stockSymbols = (process.env.STOCK_SYMBOLS || "AAPL,TSLA,SPY").split(",");
    wsManager.connectAlpaca(stockSymbols);

    // Cargar ASSETS DE PIXEL AGENTS
    await loadPixelAssets(path.join(__dirname, "../frontend/pixel-agents/webview-ui/public"))
        .then(assets => {
            pixelAssetsCache = assets;
            io.emit("pixel_assets_loaded", assets);
            console.log(`  🎨 Pixel Assets Loaded: ${assets.wallTiles?.length||0} walls, ${assets.floorTiles?.length||0} floors, ${assets.characters?.length||0} characters`);
        })
        .catch(err => console.error("  ❌ Pixel Assets Error:", err.message));

    // Engine init is now deferred until first auth connection (via socket)
    // startSwarm() is called inside socket connection handler

    ProfileParser.bootstrap().then(() => {
        console.log(`  🧠 OpenClaw Profiles Loaded`);
    }).catch(err => console.error("  ❌ ProfileParser Error:", err.message));

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
    if (cronOrchestrator) cronOrchestrator.destroy();
    wsManager.disconnectAll();
    server.close();
});
