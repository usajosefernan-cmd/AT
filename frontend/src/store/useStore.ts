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
export interface PaperPosition { id: string; symbol: string; exchange: string; side: "LONG" | "SHORT"; entryPrice: number; quantity: number; notionalValue: number; unrealizedPnl: number; unrealizedPnlPct: number; stopLoss: number | null; takeProfit: number | null; leverage: number; openedAt: number; rationale?: string; openedBy?: string; }
export interface EquityPoint { time: number; equity: number; }
export interface AgentLog { id: string; agent_id: string; text: string; level: "info" | "warn" | "error" | "success"; type?: string; message?: string; timestamp: number; }
export type AgentLogEntry = AgentLog;

// ═══════════════════════════════════════════
// STORE
// ═══════════════════════════════════════════

interface AppStore {
    connected: boolean;
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
    selectedSymbols: Record<string, string>; // deskId -> symbol

    // Actions
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

export const useStore = create<AppStore>((set) => ({
    connected: false,
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
        risk_manager: { 
            id: "risk_manager", 
            name: "DIRECTOR DE RIESGOS", 
            role: "COMPLIANCE & SEGURIDAD", 
            status: "idle", 
            action: "AUDITANDO", 
            mission: "VETAR OPERACIONES QUE NO CUMPLAN CON LAS REGLAS DE AXI SELECT Y PROTEGER EL DRAWDOWN DIARIO.",
            personality: "ESTRICTO, CAUTELOSO Y CERO TOLERANCIA A LA EXPOSICIÓN NO JUSTIFICADA.",
            color: "#22c55e",
            timestamp: Date.now() 
        },
        sentinel: { 
            id: "sentinel", 
            name: "JEFE DE INTELIGENCIA", 
            role: "RADAR DE MERCADO", 
            status: "idle", 
            action: "ESCANEO ACTIVO", 
            mission: "MONITORIZAR TODOS LOS EXCHANGES EN BUSCA DE ANOMALÍAS DE VOLUMEN Y SETUPS DE ALTA PROBABILIDAD.",
            personality: "VIGILANTE, PRECISO Y ANALÍTICO. NO DUERME.",
            color: "#4a6cf7",
            timestamp: Date.now() 
        },
        memecoin_sniper: { 
            id: "memecoin_sniper", 
            name: "OPERADOR DE GEMAS", 
            role: "DEPARTAMENTO MEME (MEXC)", 
            status: "idle", 
            action: "BUSCANDO SEÑALES", 
            mission: "IDENTIFICAR Y SNIPEAR ACTIVOS DE BAJA CAPITALIZACIÓN CON RIESGO ASIMÉTRICO POSITIVO.",
            personality: "AGRESIVO, VELOZ Y OPORTUNISTA. ESPECIALISTA EN VOLATILIDAD EXTREMA.",
            color: "#f472b6",
            timestamp: Date.now() 
        },
        crypto_perp: { 
            id: "crypto_perp", 
            name: "OPERADOR DE FUTUROS", 
            role: "DERIVADOS CRIPTO (HL)", 
            status: "idle", 
            action: "ANALIZANDO FLUJO", 
            mission: "EJECUTAR POSICIONES EN PERPETUOS BASADO EN DERIVACIÓN DE PRECIO Y LIQUIDEZ MASIVA.",
            personality: "CALCULADOR, FRÍO Y MATEMÁTICO. ENFOQUE EN MICRO-OPORTUNIDADES DE MERCADO.",
            color: "#6366f1",
            timestamp: Date.now() 
        },
        equities_analyst: { 
            id: "equities_analyst", 
            name: "ANALISTA DE ACCIONES", 
            role: "MERCADOS US (ALPACA)", 
            status: "idle", 
            action: "STANDBY", 
            mission: "OPERAR EL MERCADO DE ACCIONES US Y ETFS SEGÚN TENDENCIAS MACROECONÓMICAS Y TECNOLÓGICAS.",
            personality: "PROFESIONAL, PACIENTE Y FUNDAMENTALISTA.",
            color: "#10b981",
            timestamp: Date.now() 
        },
        forex_macro: { 
            id: "forex_macro", 
            name: "ESTRATEGA FOREX", 
            role: "DIVISAS & COMMODITIES", 
            status: "idle", 
            action: "MONITORIZANDO MACRO", 
            mission: "CAPTURA DE MOVIMIENTOS EN PARES MAYORES Y ORO BASADO EN DIFERENCIALES DE TASAS Y FLUJOS CAPITALES.",
            personality: "SOFISTICADO, SABIO Y ESTRATÉGICO.",
            color: "#f59e0b",
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

    setConnected: (v) => set({ connected: v }),
    setActiveDesk: (id) => set({ activeDesk: id }),
    updatePrice: (tick) => set((s) => ({
        marketData: { ...s.marketData, [tick.symbol]: { price: tick.price, prevPrice: s.marketData[tick.symbol]?.price || tick.price, source: tick.source, timestamp: tick.timestamp } },
    })),
    updateCandle: (c) => set({ latestCandle: c }),
    updateAgent: (id, patch) => set((s) => ({
        agents: { ...s.agents, [id]: { ...s.agents[id], ...patch, timestamp: Date.now() } },
    })),
    updateAccount: (a) => set((s) => ({
        account: { ...s.account, ...a },
        equityCurve: [...s.equityCurve.slice(-500), { time: Date.now(), equity: a.equity || s.account.equity }],
    })),
    addPosition: (p) => set((s) => ({ activePositions: [...s.activePositions, p] })),
    removePosition: (id) => set((s) => ({ activePositions: s.activePositions.filter((p) => p.id !== id) })),
    updateActivePositions: (p) => set({ activePositions: p }),
    addAgentLog: (log) => set((s) => ({ agentLogs: [...s.agentLogs.slice(-100), log] })),
    addTape: (t) => set((s) => ({ tape: [...s.tape.slice(-50), t] })),
    updateOrderBook: (orderBook) => set({ orderBook }),
    setKillSwitch: (killSwitchActive) => set({ killSwitchActive }),
    setSelectedSymbol: (deskId, symbol) => set((s) => ({
        selectedSymbols: { ...s.selectedSymbols, [deskId]: symbol }
    })),
    disconnectSocket: () => disconnectSocket(),
}));

// ═══════════════════════════════════════════
// SOCKET — connects to the REAL backend
// ═══════════════════════════════════════════

export let socket: Socket | null = null;
export const getSocket = () => socket;

export function initSocket(token?: string) {
    if (socket) return socket;

    // Dynamic Cloud / Local connection URL
    const url = import.meta.env.VITE_BACKEND_WSS_URL || import.meta.env.VITE_API_URL || "http://localhost:8080";

    socket = io(url, {
        auth: { token } // Passport for backend
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
                    data.positions.forEach((p: any) => useStore.getState().addPosition(p));
                }
            })
            .catch(err => console.error("Initial fetch error:", err));
    });
    socket.on("disconnect", () => {
        useStore.setState({ connected: false });
        useStore.getState().addAgentLog({ id: crypto.randomUUID(), agent_id: "system", text: "❌ Connection Lost from Backend", level: "error", timestamp: Date.now() });
    });

    // Auth errors from Backend
    socket.on("connect_error", (err) => {
        console.error("Socket error:", err.message);
        useStore.getState().addAgentLog({ id: crypto.randomUUID(), agent_id: "system", text: `❌ SOCKET ERROR: ${err.message}`, level: "error", timestamp: Date.now() });
    });

    // Real market ticks — THROTTLED to prevent UI freeze
    const tickThrottle: Record<string, number> = {};
    let lastTapeAdd = 0;
    socket.on("market_tick", (tick: MarketTick) => {
        if (!tick.symbol || !tick.price) return;
        
        // Throttle: max 1 update per symbol per 500ms
        const now = Date.now();
        const last = tickThrottle[tick.symbol] || 0;
        if (now - last < 500) return;
        tickThrottle[tick.symbol] = now;
        
        useStore.getState().updatePrice(tick);
        
        // Tape: max 1 entry per second total (not per tick)
        if (now - lastTapeAdd > 1000) {
            lastTapeAdd = now;
            useStore.getState().addTape({
                id: crypto.randomUUID(), symbol: tick.symbol, price: tick.price,
                size: tick.volume, side: Math.random() > 0.5 ? "buy" : "sell",
                source: tick.source, timestamp: tick.timestamp,
            });
        }
    });

    // Real candle data
    socket.on("market_kline", (c: OHLCCandle) => useStore.getState().updateCandle(c));

    // Agent updates
    socket.on("agent_state", (state: any) => {
        useStore.getState().updateAgent(state.agent_id, {
            status: state.status, action: state.action, target: state.target,
            payload: state.payload, tokens: state.tokens,
        });
    });

    socket.on("new_log", (log: any) => {
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

    socket.on("agent_log", (log: any) => {
        useStore.getState().addAgentLog({
            id: crypto.randomUUID(),
            agent_id: log.agent_id || log.agent || "SYSTEM",
            text: log.text || log.message || JSON.stringify(log),
            level: log.level || "info",
            timestamp: log.timestamp || Date.now(),
        });
    });

    // Paper trading events
    socket.on("paper_account", (s: any) => useStore.getState().updateAccount(s));
    socket.on("paper_position_opened", (p: PaperPosition) => {
        useStore.getState().addPosition(p);
        useStore.getState().addAgentLog({ id: crypto.randomUUID(), agent_id: "ceo", text: `📈 Posición abierta: ${p.side} ${p.symbol} $${p.notionalValue}`, level: "success", timestamp: Date.now() });
    });
    socket.on("paper_position_closed", (p: any) => {
        useStore.getState().removePosition(p.id);
        useStore.getState().addAgentLog({ id: crypto.randomUUID(), agent_id: "ceo", text: `📉 Posición cerrada: ${p.symbol} PnL=$${p.realizedPnl?.toFixed(2)}`, level: p.realizedPnl >= 0 ? "success" : "error", timestamp: Date.now() });
    });
    socket.on("paper_pnl", (d: any) => {
        const p = useStore.getState().activePositions.find(x => x.id === d.positionId);
        if (p) {
             const updated = useStore.getState().activePositions.map((p) => p.id === d.positionId ? { ...p, unrealizedPnl: d.unrealizedPnl, unrealizedPnlPct: d.unrealizedPnlPct || 0 } : p);
             useStore.setState({ activePositions: updated });
        }
    });

    return socket;
}

export function disconnectSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
}
