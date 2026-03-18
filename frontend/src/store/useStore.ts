import { create } from "zustand";
import { io, Socket } from "socket.io-client";

// ═══════════════════════════════════════════
// DESKS
// ═══════════════════════════════════════════

export type DeskId = "overview" | "crypto" | "memecoins" | "equities" | "forex" | "admin";

export interface DeskConfig {
    id: DeskId;
    label: string;
    exchange: string;
    symbols: string[];
    color: string;
    icon: string;
}

export const DESKS: DeskConfig[] = [
    { id: "overview", label: "GLOBAL", exchange: "ALL", symbols: ["BTC", "ETH", "SOL", "DOGE", "AAPL", "NVDA", "EURUSD"], color: "#4a6cf7", icon: "🌐" },
    { id: "crypto", label: "CRIPTOMONEDAS", exchange: "HYPERLIQUID", symbols: ["BTC", "ETH", "SOL", "LINK", "ARB", "AVAX", "WIF", "ONDO", "SUI"], color: "#a78bfa", icon: "₿" },
    { id: "memecoins", label: "SNIPER MEME", exchange: "MEXC", symbols: ["PEPEUSDT", "DOGEUSDT", "SHIBUSDT", "WIFUSDT", "BONKUSDT", "FLOKIUSDT", "BOMEUSDT", "POPCATUSDT"], color: "#f472b6", icon: "🐸" },
    { id: "equities", label: "ACCIONES US", exchange: "ALPACA", symbols: ["AAPL", "TSLA", "SPY", "NVDA", "MSFT", "GOOGL", "AMZN", "META"], color: "#22c55e", icon: "📊" },
    { id: "forex", label: "FOREX / DIVISAS", exchange: "AXI", symbols: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "GBPJPY", "AUDUSD", "USDCHF"], color: "#f59e0b", icon: "💱" },
    { id: "admin", label: "ADMINISTRACIÓN", exchange: "", symbols: [], color: "#ef4444", icon: "⚙️" },
];

// ═══════════════════════════════════════════
// AGENT STATE
// ═══════════════════════════════════════════

export interface AgentState {
    id: string;
    name: string;
    role: string;
    status: "idle" | "active" | "success" | "error";
    action: string;
    target?: string;
    payload?: any;
    tokens?: { prompt: number; completion: number };
    timestamp: number;
    mission?: string;
    personality?: string;
    color?: string;
}

// ═══════════════════════════════════════════
// DATA TYPES
// ═══════════════════════════════════════════

export interface MarketTick { type: "TICK"; source: string; symbol: string; price: number; volume: number; timestamp: number; }
export interface OHLCCandle { type: "KLINE"; source: string; symbol: string; interval: string; open: number; high: number; low: number; close: number; volume: number; timestamp: number; isClosed: boolean; }
export interface OrderBookLevel { price: number; size: number; total: number; }
export interface TapeEntry { id: string; symbol: string; price: number; size: number; side: "buy" | "sell"; source: string; timestamp: number; }
export interface PaperPosition { id: string; symbol: string; exchange: string; side: "LONG" | "SHORT"; entryPrice: number; quantity: number; notionalValue: number; unrealizedPnl: number; unrealizedPnlPct: number; stopLoss: number | null; takeProfit: number | null; trailingStop?: { activationPct: number; callbackPct: number; active: boolean; } | null; leverage: number; openedAt: number; rationale?: string; openedBy?: string; }
export interface EquityPoint { time: number; equity: number; }
export interface AgentLog { id: string; agent_id: string; text: string; level: "info" | "warn" | "error" | "success"; type?: string; message?: string; timestamp: number; }
export type AgentLogEntry = AgentLog;

// ═══════════════════════════════════════════
// STORE — OPTIMIZED FOR HIGH-FREQUENCY DATA
// ═══════════════════════════════════════════

interface AppStore {
    connected: boolean;
    pixelAssets: any;
    activeDesk: DeskId;
    marketData: Record<string, { price: number; prevPrice: number; source: string; timestamp: number }>;
    latestCandle: OHLCCandle | null;
    agents: Record<string, AgentState>;
    account: { balance: number; equity: number; dailyDrawdown: number; maxDrawdown: number; totalPnl: number; };
    activePositions: PaperPosition[];
    agentLogs: AgentLogEntry[];
    tape: TapeEntry[];
    orderBook: { bids: OrderBookLevel[]; asks: OrderBookLevel[]; symbol: string; };
    equityCurve: EquityPoint[];
    killSwitchActive: boolean;
    selectedSymbols: Record<string, string>;

    // Actions
    setPixelAssets: (assets: any) => void;
    setConnected: (v: boolean) => void;
    setActiveDesk: (id: DeskId) => void;
    updatePrice: (tick: MarketTick) => void;
    updateCandle: (c: OHLCCandle) => void;
    updateAgent: (id: string, patch: Partial<AgentState>) => void;
    updateAccount: (a: any) => void;
    addPosition: (p: PaperPosition) => void;
    removePosition: (id: string) => void;
    updateActivePositions: (p: PaperPosition[]) => void;
    addAgentLog: (log: AgentLogEntry) => void;
    addTape: (t: TapeEntry) => void;
    updateOrderBook: (data: { bids: OrderBookLevel[]; asks: OrderBookLevel[]; symbol: string }) => void;
    setKillSwitch: (v: boolean) => void;
    setSelectedSymbol: (deskId: string, symbol: string) => void;
    disconnectSocket: () => void;
}

export const useStore = create<AppStore>((set, get) => ({
    connected: false,
    pixelAssets: null,
    activeDesk: "overview",
    marketData: {},
    latestCandle: null,
    agents: {
        ceo: { 
            id: "ceo", 
            name: "CEO NEURONAL", 
            role: "DIRECCIÓN ESTRATÉGICA", 
            status: "idle", 
            action: "SISTEMA LISTO", 
            mission: "ORQUESTAR EL ENJAMBRE DE AGENTES, DEFINIR OBJETIVOS DE CAPITAL Y ASEGURAR LA RENTABILIDAD TOTAL DEL FONDO.",
            personality: "AUTORITARIO, ANALÍTICO Y ORIENTADO A RESULTADOS DE ALTO NIVEL.",
            color: "#a78bfa",
            timestamp: Date.now() 
        },
        l3_axi: { 
            id: "l3_axi", 
            name: "L3 AXI FOREX", 
            role: "DIRECTOR DE RIESGOS FOREX", 
            status: "idle", 
            action: "MONITORIZANDO", 
            mission: "GESTIONAR LA EXPOSICIÓN EN MERCADOS FX MAYORES (EURUSD, GBPUSD, JPY) SEGÚN PARÁMETROS MACRO.",
            personality: "FRÍO, CALCULADOR, FUNDAMENTAL",
            color: "#f59e0b",
            timestamp: Date.now() 
        },
        l3_crypto: { 
            id: "l3_crypto", 
            name: "L3 CRYPTO MAJORS", 
            role: "DIRECTOR DE RIESGOS CRIPTO", 
            status: "idle", 
            action: "MONITORIZANDO", 
            mission: "CONTROLAR EL FLUJO EN PERPETUOS DE BTC/ETH/SOL. OPTIMIZAR LIQUIDACIONES.",
            personality: "AGRESIVO, MATEMÁTICO, VELOZ",
            color: "#6366f1",
            timestamp: Date.now() 
        },
        l3_memes: { 
            id: "l3_memes", 
            name: "L3 MEMECOINS", 
            role: "DIRECTOR DE RIESGOS DGEN", 
            status: "idle", 
            action: "MONITORIZANDO", 
            mission: "ASIGNAR CAPITAL DE ALTO RIESGO A ACTIVOS HIPER-VOLÁTILES SIN COMPROMETER LA CUENTA PRINCIPAL.",
            personality: "OPORTUNISTA, CAÓTICO, IMPLACABLE",
            color: "#f472b6",
            timestamp: Date.now() 
        },
        l3_equities: { 
            id: "l3_equities", 
            name: "L3 EQUITIES", 
            role: "DIRECTOR DE RIESGOS ACCIONES", 
            status: "idle", 
            action: "STANDBY", 
            mission: "OPERATIVIDAD SOBRE ACCIONES REGULADAS US (LARGE CAPS). RESPETO ESTRICTO AL VWAP Y HORARIOS (RTH).",
            personality: "MÓDICO, INSTITUCIONAL, PACIENTE",
            color: "#10b981",
            timestamp: Date.now() 
        },
        l3_small_caps: { 
            id: "l3_small_caps", 
            name: "L3 SMALL CAPS", 
            role: "DIRECTOR DE RIESGOS SMALL CAPS", 
            status: "idle", 
            action: "MONITORIZANDO", 
            mission: "SCALPEAR EVENTOS DE EXPANSIÓN CON PRECAUCIÓN ANTE DILUCIÓN Y OFFERINGS. MANTENER DRAWDOWN AL MÍNIMO.",
            personality: "CAUTO, PARANOICO, EFICIENTE",
            color: "#ef4444",
            timestamp: Date.now() 
        }
    },
    account: { balance: 10000, equity: 10000, dailyDrawdown: 0, maxDrawdown: 0, totalPnl: 0 },
    activePositions: [],
    agentLogs: [],
    tape: [],
    orderBook: { bids: [], asks: [], symbol: "" },
    equityCurve: [{ time: Date.now(), equity: 10000 }],
    killSwitchActive: false,
    selectedSymbols: {
        crypto: "BTC",
        memecoins: "PEPEUSDT",
        equities: "AAPL",
        forex: "EURUSD"
    },

    setPixelAssets: (assets) => set({ pixelAssets: assets }),
    setConnected: (v) => set({ connected: v }),
    setActiveDesk: (id) => set({ activeDesk: id }),

    // ⚡ OPTIMIZED: mutate in-place, only create new ref for the single symbol entry
    updatePrice: (tick) => {
        const s = get();
        const prev = s.marketData[tick.symbol];
        // Skip if price hasn't changed
        if (prev && prev.price === tick.price) return;
        s.marketData[tick.symbol] = { price: tick.price, prevPrice: prev?.price || tick.price, source: tick.source, timestamp: tick.timestamp };
        // Signal React with a shallow-new ref only for the top-level object
        set({ marketData: { ...s.marketData } });
    },

    updateCandle: (c) => set({ latestCandle: c }),

    // ⚡ OPTIMIZED: skip if no actual change
    updateAgent: (id, patch) => {
        const s = get();
        const current = s.agents[id];
        if (current && current.status === patch.status && current.action === patch.action && current.target === patch.target) return;
        set({
            agents: { ...s.agents, [id]: { ...current, ...patch, timestamp: Date.now() } },
        });
    },

    updateAccount: (a) => set((s) => ({
        account: { ...s.account, ...a },
        equityCurve: [...s.equityCurve.slice(-200), { time: Date.now(), equity: a.equity || s.account.equity }],
    })),
    addPosition: (p) => set((s) => ({ activePositions: [...s.activePositions, p] })),
    removePosition: (id) => set((s) => ({ activePositions: s.activePositions.filter((p) => p.id !== id) })),
    updateActivePositions: (p) => set({ activePositions: p }),
    addAgentLog: (log) => set((s) => ({ agentLogs: [...s.agentLogs.slice(-80), log] })),
    addTape: (t) => set((s) => ({ tape: [...s.tape.slice(-30), t] })),
    updateOrderBook: (orderBook) => set({ orderBook }),
    setKillSwitch: (killSwitchActive) => set({ killSwitchActive }),
    setSelectedSymbol: (deskId, symbol) => set((s) => ({
        selectedSymbols: { ...s.selectedSymbols, [deskId]: symbol }
    })),
    disconnectSocket: () => disconnectSocket(),
}));

// ═══════════════════════════════════════════
// SOCKET — HIGH-PERFORMANCE EVENT PIPELINE
// ═══════════════════════════════════════════

export let socket: Socket | null = null;
export const getSocket = () => socket;

export function initSocket(token?: string) {
    if (socket) return socket;

    const url = import.meta.env.VITE_BACKEND_WSS_URL || import.meta.env.VITE_API_URL || "http://localhost:8080";

    socket = io(url, {
        auth: { token }
    });

    socket.on("connect", () => {
        useStore.setState({ connected: true });
        useStore.getState().addAgentLog({ id: crypto.randomUUID(), agent_id: "system", text: `✅ Connected to Mission Control (${url})`, level: "success", timestamp: Date.now() });

        // Fetch initial state
        fetch(`${url}/api/positions`)
            .then(res => res.json())
            .then(data => {
                useStore.getState().updateAccount(data);
                if (data.positions) {
                    useStore.getState().updateActivePositions(data.positions);
                }
            })
            .catch(err => console.error("Initial fetch error:", err));
    });
    
    socket.on("pixel_assets_loaded", (assets: any) => {
        useStore.getState().setPixelAssets(assets);
    });

    socket.on("disconnect", () => {
        useStore.setState({ connected: false });
        useStore.getState().addAgentLog({ id: crypto.randomUUID(), agent_id: "system", text: "❌ Connection Lost from Backend", level: "error", timestamp: Date.now() });
    });

    socket.on("connect_error", (err) => {
        console.error("Socket error:", err.message);
    });

    // ═══════════════════════════════════════════
    // ⚡ PERFORMANCE: Batched price updates via RAF
    // ═══════════════════════════════════════════
    const tickBuffer: Record<string, MarketTick> = {};
    let rafScheduled = false;

    const flushTicks = () => {
        rafScheduled = false;
        const symbols = Object.keys(tickBuffer);
        if (symbols.length === 0) return;

        const store = useStore.getState();
        let changed = false;
        for (const sym of symbols) {
            const tick = tickBuffer[sym];
            const prev = store.marketData[sym];
            if (!prev || prev.price !== tick.price) {
                store.marketData[sym] = { price: tick.price, prevPrice: prev?.price || tick.price, source: tick.source, timestamp: tick.timestamp };
                changed = true;
            }
        }
        // Clear buffer
        for (const sym of symbols) delete tickBuffer[sym];

        if (changed) {
            useStore.setState({ marketData: { ...store.marketData } });
        }
    };

    let lastTapeAdd = 0;
    socket.on("market_tick", (tick: MarketTick) => {
        if (!tick.symbol || !tick.price) return;

        // Buffer the tick (latest wins per symbol)
        tickBuffer[tick.symbol] = tick;

        // Schedule a single RAF flush
        if (!rafScheduled) {
            rafScheduled = true;
            requestAnimationFrame(flushTicks);
        }

        // Tape: max 1 entry every 3 seconds
        const now = Date.now();
        if (now - lastTapeAdd > 3000) {
            lastTapeAdd = now;
            useStore.getState().addTape({
                id: crypto.randomUUID(), symbol: tick.symbol, price: tick.price,
                size: tick.volume, side: Math.random() > 0.5 ? "buy" : "sell",
                source: tick.source, timestamp: tick.timestamp,
            });
        }
    });

    // Real candle data — already low-frequency
    socket.on("market_kline", (c: OHLCCandle) => useStore.getState().updateCandle(c));

    // ⚡ Agent state updates — throttled per agent (500ms)
    const agentThrottle: Record<string, number> = {};
    socket.on("agent_state", (state: any) => {
        const now = Date.now();
        const last = agentThrottle[state.agent_id] || 0;
        if (now - last < 500) return;
        agentThrottle[state.agent_id] = now;

        useStore.getState().updateAgent(state.agent_id, {
            status: state.status, action: state.action, target: state.target,
            payload: state.payload, tokens: state.tokens,
        });
    });

    // ⚡ Agent logs — throttled globally (300ms)
    let lastLogTime = 0;
    socket.on("new_log", (log: any) => {
        const now = Date.now();
        if (now - lastLogTime < 300) return;
        lastLogTime = now;
        useStore.getState().addAgentLog({
            id: crypto.randomUUID(),
            agent_id: log.agent_id || "system",
            text: log.text || (typeof log === "string" ? log : JSON.stringify(log)),
            level: log.level || "info",
            timestamp: log.timestamp || Date.now(),
        });
    });

    socket.on("portfolio_update", (positions: PaperPosition[]) => {
        useStore.getState().updateActivePositions(positions);
    });

    // ⚡ Agent log — throttled (300ms)
    let lastAgentLogTime = 0;
    socket.on("agent_log", (log: any) => {
        const now = Date.now();
        if (now - lastAgentLogTime < 300) return;
        lastAgentLogTime = now;
        useStore.getState().addAgentLog({
            id: crypto.randomUUID(),
            agent_id: log.agent_id || log.agent || "SYSTEM",
            text: log.text || log.message || JSON.stringify(log),
            level: log.level || "info",
            timestamp: log.timestamp || Date.now(),
        });
    });

    // Paper trading events — low frequency, no throttle needed
    socket.on("paper_account", (s: any) => useStore.getState().updateAccount(s));
    socket.on("paper_position_opened", (p: PaperPosition) => {
        useStore.getState().addPosition(p);
        useStore.getState().addAgentLog({ id: crypto.randomUUID(), agent_id: "ceo", text: `📈 Posición abierta: ${p.side} ${p.symbol} $${p.notionalValue}`, level: "success", timestamp: Date.now() });
    });
    socket.on("paper_position_closed", (p: any) => {
        useStore.getState().removePosition(p.id);
        useStore.getState().addAgentLog({ id: crypto.randomUUID(), agent_id: "ceo", text: `📉 Posición cerrada: ${p.symbol} PnL=$${p.realizedPnl?.toFixed(2)}`, level: p.realizedPnl >= 0 ? "success" : "error", timestamp: Date.now() });
    });

    // ⚡ PnL updates — throttled per position (1s)
    const pnlThrottle: Record<string, number> = {};
    socket.on("paper_pnl", (d: any) => {
        const now = Date.now();
        const last = pnlThrottle[d.positionId] || 0;
        if (now - last < 1000) return;
        pnlThrottle[d.positionId] = now;

        const positions = useStore.getState().activePositions;
        const idx = positions.findIndex(x => x.id === d.positionId);
        if (idx >= 0) {
            const updated = positions.map((p) => p.id === d.positionId ? { ...p, unrealizedPnl: d.unrealizedPnl, unrealizedPnlPct: d.unrealizedPnlPct || 0 } : p);
            useStore.setState({ activePositions: updated });
        }
    });

    // Omnichannel CEO bindings — low frequency
    socket.on("ceo_processing_command", (data: any) => {
        useStore.getState().updateAgent("ceo", { status: "active", action: "PENSANDO...", target: data.text });
    });

    socket.on("ceo_response", (data: any) => {
        useStore.getState().updateAgent("ceo", { status: "success", action: "HABLANDO", target: data.text });
        setTimeout(() => useStore.getState().updateAgent("ceo", { status: "idle", action: "MONITORIZANDO", target: "" }), 4000);
    });

    // ⚡ Swarm alerts — throttled (1s)
    let lastSwarmAlert = 0;
    socket.on("swarm_alert", (data: any) => {
        const now = Date.now();
        if (now - lastSwarmAlert < 1000) return;
        lastSwarmAlert = now;

        const agMapping: Record<string, string> = {
            "1_axi_forex": "l3_axi",
            "2_crypto_majors": "l3_crypto",
            "3_memecoins": "l3_memes",
            "4_equities_large": "l3_equities",
            "5_small_caps": "l3_small_caps"
        };
        const l3Id = agMapping[data.ecosystem];
        if (l3Id) {
            useStore.getState().updateAgent(l3Id, { status: "active", action: "EVALUANDO RIESGO", target: data.asset });
        }
        useStore.getState().addAgentLog({ id: crypto.randomUUID(), agent_id: l3Id || "system", text: `⚡ ALERTA L1 (${data.type}) en ${data.asset} [${data.ecosystem}]`, level: "warn", timestamp: Date.now() });
    });

    socket.on("trade_executed", (data: any) => {
        const agMapping: Record<string, string> = {
            "1_axi_forex": "l3_axi",
            "2_crypto_majors": "l3_crypto",
            "3_memecoins": "l3_memes",
            "4_equities_large": "l3_equities",
            "5_small_caps": "l3_small_caps"
        };
        const l3Id = agMapping[data.ecosystem];
        if (l3Id) {
            useStore.getState().updateAgent(l3Id, { status: "success", action: "APROBADO", target: data.asset });
            setTimeout(() => useStore.getState().updateAgent(l3Id, { status: "idle", action: "MONITORIZANDO", target: "" }), 5000);
        }
        useStore.getState().addAgentLog({ id: crypto.randomUUID(), agent_id: l3Id || "system", text: `✅ TRADE APROBADO L3 en ${data.asset} [${data.ecosystem}]`, level: "success", timestamp: Date.now() });
    });

    socket.on("swarm_status_changed", (data: any) => {
        useStore.getState().addAgentLog({ id: crypto.randomUUID(), agent_id: "system", text: `System Swarm status changed to ${data.status} by ${data.source}`, level: "warn", timestamp: Date.now() });
    });
    
    socket.on("panic_mode_activated", (data: any) => {
        useStore.getState().addAgentLog({ id: crypto.randomUUID(), agent_id: "system", text: `🚨 PANIC MODE TRIGGERED BY ${data.source}`, level: "error", timestamp: Date.now() });
        for (const ag of Object.values(useStore.getState().agents)) {
            useStore.getState().updateAgent(ag.id, { status: "error", action: "HALT" });
        }
        useStore.getState().setKillSwitch(true);
    });

    return socket;
}

export function disconnectSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
}
