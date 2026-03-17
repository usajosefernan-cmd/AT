import React, { useEffect, useRef, useState, useCallback } from "react";
import { useStore, AgentLogEntry } from "../store/useStore";
import { Shield, Activity, Zap, Eye, AlertTriangle, CheckCircle2, XCircle, Clock, TrendingUp, Users, MessageSquare, Send, Settings, ChevronDown, ChevronRight } from "lucide-react";

// ═══════════════════════════════════════════
// AGENT ROOMS — 5 Salas por Mercado + Chat
// ═══════════════════════════════════════════

interface MarketRoom {
    id: string;
    label: string;
    icon: string;
    color: string;
    exchange: string;
    marketKey: string; // key in MARKET_RULES
    l1: string;
    l2: string;
    l3: string;
}

const ROOMS: MarketRoom[] = [
    { id: "crypto", label: "CRIPTOMONEDAS", icon: "₿", color: "#a78bfa", exchange: "HYPERLIQUID", marketKey: "crypto", l1: "Sentinel Flow", l2: "Orderbook Analyst", l3: "Crypto Director" },
    { id: "memecoins", label: "MEMECOINS", icon: "🐸", color: "#f472b6", exchange: "MEXC", marketKey: "memecoins", l1: "Momentum Screener", l2: "Narrative Analyst", l3: "Meme Director" },
    { id: "equities", label: "ACCIONES US", icon: "📊", color: "#22c55e", exchange: "ALPACA", marketKey: "equities", l1: "Volume Scanner", l2: "Catalyst Analyst", l3: "Equities Director" },
    { id: "forex", label: "FOREX / ORO", icon: "💱", color: "#f59e0b", exchange: "AXI", marketKey: "forex", l1: "Macro Screener", l2: "Geometry Analyst", l3: "Forex Director" },
    { id: "smallcaps", label: "SMALL CAPS", icon: "🔬", color: "#06b6d4", exchange: "ALPACA", marketKey: "small_caps", l1: "Halt Screener", l2: "Catalyst Analyst", l3: "Dilution Mgr" },
];

const statusColors: Record<string, string> = {
    idle: "#3a4555", active: "#f59e0b", success: "#22c55e", error: "#ef4444",
};

// ─── Chat Message Type ─────────────────────
interface ChatMsg {
    id: string;
    role: "user" | "agent";
    text: string;
    timestamp: number;
    agentName?: string;
}

// ─── Sidebar Room Tab ──────────────────────
const RoomTab: React.FC<{ room: MarketRoom; active: boolean; logCount: number; onClick: () => void }> = ({ room, active, logCount, onClick }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left group ${active ? "bg-white/[0.06] shadow-lg" : "hover:bg-white/[0.03]"}`}
        style={{ borderLeft: active ? `3px solid ${room.color}` : "3px solid transparent" }}
    >
        <span className="text-lg">{room.icon}</span>
        <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black text-white uppercase tracking-[0.15em] truncate">{room.label}</div>
            <div className="text-[8px] font-mono text-[#3a4555] uppercase tracking-wider">{room.exchange}</div>
        </div>
        {logCount > 0 && (
            <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full" style={{ background: room.color + "20", color: room.color }}>
                {logCount}
            </span>
        )}
    </button>
);

// ─── Agent Pipeline Mini Card ──────────────
const MiniAgent: React.FC<{ label: string; level: string; color: string }> = ({ label, level, color }) => (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0d1117] border border-[#1a1f2e]">
        <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: color + "15", color }}>{level}</span>
        <span className="text-[9px] font-mono text-[#5a6577] truncate">{label}</span>
    </div>
);

// ─── Log Entry ─────────────────────────────
const LogLine: React.FC<{ log: AgentLogEntry }> = ({ log }) => {
    const color = { info: "#5a6577", warn: "#f59e0b", error: "#ef4444", success: "#22c55e" }[log.level] || "#5a6577";
    const time = new Date(log.timestamp).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return (
        <div className="flex gap-2 py-1 px-2 hover:bg-white/[0.02] rounded transition-colors">
            <span className="text-[8px] font-mono text-[#2a3545] shrink-0">{time}</span>
            <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-1" style={{ background: color }} />
            <span className="text-[9px] font-mono leading-relaxed break-words" style={{ color }}>{log.text}</span>
        </div>
    );
};

// ─── Chat Bubble ───────────────────────────
const ChatBubble: React.FC<{ msg: ChatMsg; color: string }> = ({ msg, color }) => {
    const isUser = msg.role === "user";
    const time = new Date(msg.timestamp).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    return (
        <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-2`}>
            <div className={`max-w-[80%] px-3 py-2 rounded-xl ${isUser ? "bg-[#4a6cf7]/20 border border-[#4a6cf7]/30" : "bg-[#0d1117] border border-[#1a1f2e]"}`}>
                {!isUser && msg.agentName && (
                    <div className="text-[8px] font-black uppercase tracking-wider mb-1" style={{ color }}>{msg.agentName}</div>
                )}
                <div className="text-[10px] font-mono text-[#b0b8c5] leading-relaxed">{msg.text}</div>
                <div className="text-[7px] font-mono text-[#2a3545] mt-1 text-right">{time}</div>
            </div>
        </div>
    );
};

// ─── Market Rules Display ──────────────────
const MarketRulesCard: React.FC<{ room: MarketRoom; rules: any }> = ({ room, rules }) => {
    if (!rules) return null;
    return (
        <div className="grid grid-cols-5 gap-2 px-4 py-3 bg-[#0d1117] rounded-xl border border-[#1a1f2e]">
            <div className="text-center">
                <div className="text-[7px] font-black text-[#3a4555] uppercase tracking-wider">Leverage</div>
                <div className="text-[12px] font-black font-mono" style={{ color: room.color }}>{rules.maxLeverage}x</div>
            </div>
            <div className="text-center">
                <div className="text-[7px] font-black text-[#3a4555] uppercase tracking-wider">Position</div>
                <div className="text-[12px] font-black font-mono text-white">{rules.maxPositionPct}%</div>
            </div>
            <div className="text-center">
                <div className="text-[7px] font-black text-[#3a4555] uppercase tracking-wider">Risk/Trade</div>
                <div className="text-[12px] font-black font-mono text-white">{rules.maxRiskPerTradePct}%</div>
            </div>
            <div className="text-center">
                <div className="text-[7px] font-black text-[#3a4555] uppercase tracking-wider">Estilo</div>
                <div className="text-[10px] font-black font-mono text-[#5a6577] uppercase">{rules.style}</div>
            </div>
            <div className="text-center">
                <div className="text-[7px] font-black text-[#3a4555] uppercase tracking-wider">Max Hold</div>
                <div className="text-[10px] font-black font-mono text-[#5a6577]">{rules.maxHoldMinutes ? `${rules.maxHoldMinutes}m` : "∞"}</div>
            </div>
        </div>
    );
};

// ─── Main Component ────────────────────────
const AgentRooms: React.FC = () => {
    const [activeRoom, setActiveRoom] = useState<string>("crypto");
    const [chatMessages, setChatMessages] = useState<Record<string, ChatMsg[]>>({});
    const [chatInput, setChatInput] = useState("");
    const [marketRules, setMarketRules] = useState<Record<string, any>>({});
    const chatEndRef = useRef<HTMLDivElement>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);
    
    const connected = useStore(s => s.connected);
    const allLogs = useStore(s => s.agentLogs);
    const account = useStore(s => s.account);
    const positions = useStore(s => s.activePositions);
    const killSwitch = useStore(s => s.killSwitchActive);

    const room = ROOMS.find(r => r.id === activeRoom) || ROOMS[0];

    // Load market rules from backend
    useEffect(() => {
        const API = (import.meta as any).env?.VITE_API_URL || "http://localhost:8080";
        fetch(`${API}/api/config/risk`).then(r => r.json()).then(data => {
            if (data.markets) setMarketRules(data.markets);
        }).catch(() => {});
    }, []);

    // Filter logs for active room
    const roomLogs = allLogs.filter(log => {
        const text = (log.text || "").toLowerCase();
        const aid = (log.agent_id || "").toLowerCase();
        if (text.includes(room.exchange.toLowerCase())) return true;
        if (text.includes(room.id)) return true;
        if (room.id === "crypto" && (text.includes("btc") || text.includes("eth") || text.includes("sol") || text.includes("crypto") || text.includes("perp") || aid.includes("l2_crypto") || aid.includes("l3_crypto"))) return true;
        if (room.id === "memecoins" && (text.includes("meme") || text.includes("pepe") || text.includes("doge") || text.includes("bonk") || aid.includes("l2_meme") || aid.includes("l3_meme"))) return true;
        if (room.id === "equities" && (text.includes("aapl") || text.includes("tsla") || text.includes("spy") || text.includes("equit") || aid.includes("l2_equit"))) return true;
        if (room.id === "forex" && (text.includes("eurusd") || text.includes("xauusd") || text.includes("forex") || text.includes("macro") || aid.includes("l2_forex"))) return true;
        if (room.id === "smallcaps" && (text.includes("small") || text.includes("halt") || text.includes("dilut") || aid.includes("l2_small"))) return true;
        return false;
    }).slice(-50);

    // Auto-scroll logs
    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [roomLogs.length]);

    // Auto-scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatMessages[activeRoom]?.length]);

    // Count logs per room for badges
    const logCounts = ROOMS.reduce((acc, r) => {
        acc[r.id] = allLogs.filter(l => {
            const t = (l.text || "").toLowerCase();
            return t.includes(r.exchange.toLowerCase()) || t.includes(r.id);
        }).length;
        return acc;
    }, {} as Record<string, number>);

    // Send chat message to market's agents
    const handleSendChat = useCallback(async () => {
        if (!chatInput.trim()) return;
        const userMsg: ChatMsg = {
            id: `u_${Date.now()}`,
            role: "user",
            text: chatInput,
            timestamp: Date.now(),
        };
        setChatMessages(prev => ({
            ...prev,
            [activeRoom]: [...(prev[activeRoom] || []), userMsg],
        }));
        const input = chatInput;
        setChatInput("");

        try {
            const API = (import.meta as any).env?.VITE_API_URL || "http://localhost:8080";
            const res = await fetch(`${API}/api/ceo/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: `[${room.label}] ${input}`, market: room.marketKey }),
            });
            const data = await res.json();
            const agentMsg: ChatMsg = {
                id: `a_${Date.now()}`,
                role: "agent",
                text: data.reply || data.response || "Sin respuesta del agente.",
                timestamp: Date.now(),
                agentName: `CEO · ${room.label}`,
            };
            setChatMessages(prev => ({
                ...prev,
                [activeRoom]: [...(prev[activeRoom] || []), agentMsg],
            }));
        } catch {
            const errMsg: ChatMsg = {
                id: `e_${Date.now()}`,
                role: "agent",
                text: "Error de conexión con el agente CEO.",
                timestamp: Date.now(),
                agentName: "SISTEMA",
            };
            setChatMessages(prev => ({
                ...prev,
                [activeRoom]: [...(prev[activeRoom] || []), errMsg],
            }));
        }
    }, [chatInput, activeRoom, room]);

    const roomChats = chatMessages[activeRoom] || [];
    const currentRules = marketRules[room.marketKey];

    return (
        <div className="h-full flex bg-[#060a10] overflow-hidden">
            {/* ─── Left Sidebar: Room Selector ─── */}
            <div className="w-56 flex flex-col border-r border-[#1a1f2e] bg-[#0b0e14]/50 shrink-0">
                {/* CEO Stats Header */}
                <div className="px-4 py-4 border-b border-[#1a1f2e]">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">👨‍💼</span>
                        <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">CEO Overview</span>
                        <span className={`w-2 h-2 rounded-full ml-auto ${connected ? "bg-[#22c55e] animate-pulse" : "bg-[#ef4444]"}`} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-[#0d1117] rounded-lg px-2 py-1.5 text-center">
                            <div className="text-[7px] font-black text-[#3a4555] uppercase">Equity</div>
                            <div className="text-[11px] font-black text-white font-mono">${(account.equity || 10000).toLocaleString()}</div>
                        </div>
                        <div className="bg-[#0d1117] rounded-lg px-2 py-1.5 text-center">
                            <div className="text-[7px] font-black text-[#3a4555] uppercase">PnL</div>
                            <div className={`text-[11px] font-black font-mono ${(account.totalPnl || 0) >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                                ${(account.totalPnl || 0).toFixed(2)}
                            </div>
                        </div>
                        <div className="bg-[#0d1117] rounded-lg px-2 py-1.5 text-center">
                            <div className="text-[7px] font-black text-[#3a4555] uppercase">Pos</div>
                            <div className="text-[11px] font-black text-[#f59e0b] font-mono">{positions.length}</div>
                        </div>
                        <div className="bg-[#0d1117] rounded-lg px-2 py-1.5 text-center">
                            <div className="text-[7px] font-black text-[#3a4555] uppercase">DD</div>
                            <div className={`text-[11px] font-black font-mono ${(account.dailyDrawdown || 0) > 3 ? "text-[#ef4444]" : "text-[#22c55e]"}`}>
                                {(account.dailyDrawdown || 0).toFixed(1)}%
                            </div>
                        </div>
                    </div>
                </div>

                {/* Room Tabs */}
                <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1 no-scrollbar">
                    <div className="text-[7px] font-black text-[#3a4555] uppercase tracking-[0.3em] px-3 py-2">Salas de Mercado</div>
                    {ROOMS.map(r => (
                        <RoomTab key={r.id} room={r} active={activeRoom === r.id} logCount={logCounts[r.id] || 0} onClick={() => setActiveRoom(r.id)} />
                    ))}
                </div>

                {killSwitch && (
                    <div className="px-3 py-2 bg-[#ef4444]/10 border-t border-[#ef4444]/30 text-center">
                        <span className="text-[8px] font-black text-[#ef4444] uppercase tracking-wider">⚠ KILL SWITCH</span>
                    </div>
                )}
            </div>

            {/* ─── Center: Room Activity Feed ─── */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Room Header */}
                <div className="px-6 py-4 border-b border-[#1a1f2e] bg-[#0b0e14]/50 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: room.color + "10", border: `1px solid ${room.color}25` }}>
                        {room.icon}
                    </div>
                    <div className="flex-1">
                        <div className="text-[13px] font-black text-white uppercase tracking-[0.2em]">{room.label}</div>
                        <div className="text-[8px] font-mono text-[#3a4555] uppercase tracking-widest mt-0.5">{room.exchange} · L1→L2→L3 Pipeline</div>
                    </div>
                    <div className="flex items-center gap-2 text-[9px] font-mono text-[#3a4555]">
                        <Activity size={12} style={{ color: room.color }} />
                        <span>{roomLogs.length} eventos</span>
                    </div>
                </div>

                {/* Agent Pipeline */}
                <div className="px-4 py-3 border-b border-[#1a1f2e]/50 flex items-center gap-2">
                    <MiniAgent label={room.l1} level="L1" color={room.color} />
                    <span className="text-[#2a3545] text-xs">→</span>
                    <MiniAgent label={room.l2} level="L2" color={room.color} />
                    <span className="text-[#2a3545] text-xs">→</span>
                    <MiniAgent label={room.l3} level="L3" color={room.color} />
                    <div className="flex-1" />
                    {currentRules && <MarketRulesCard room={room} rules={currentRules} />}
                </div>

                {/* Decision Log */}
                <div className="flex-1 overflow-y-auto px-4 py-2 no-scrollbar">
                    {roomLogs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <span className="text-3xl mb-3">{room.icon}</span>
                            <div className="text-[10px] font-mono text-[#2a3545]">Esperando señales del mercado...</div>
                            <div className="text-[8px] font-mono text-[#1a1f2e] mt-1">Los agentes analizarán datos en tiempo real</div>
                        </div>
                    ) : (
                        <div className="space-y-0.5">
                            {roomLogs.map((log, i) => <LogLine key={log.id || i} log={log} />)}
                            <div ref={logsEndRef} />
                        </div>
                    )}
                </div>
            </div>

            {/* ─── Right Panel: Chat with Market Agents ─── */}
            <div className="w-80 flex flex-col border-l border-[#1a1f2e] bg-[#0b0e14]/50 shrink-0">
                {/* Chat Header */}
                <div className="px-4 py-3 border-b border-[#1a1f2e] flex items-center gap-3">
                    <MessageSquare size={14} style={{ color: room.color }} />
                    <div className="flex-1">
                        <div className="text-[10px] font-black text-white uppercase tracking-[0.15em]">Chat · {room.label}</div>
                        <div className="text-[7px] font-mono text-[#3a4555]">Habla con el CEO sobre este mercado</div>
                    </div>
                </div>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto px-3 py-3 no-scrollbar">
                    {roomChats.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center px-6">
                            <MessageSquare size={24} className="text-[#1a1f2e] mb-3" />
                            <div className="text-[10px] font-mono text-[#2a3545] mb-1">Sin mensajes aún</div>
                            <div className="text-[8px] font-mono text-[#1a1f2e] leading-relaxed">
                                Pregunta al CEO sobre la estrategia de {room.label.toLowerCase()}, pide abrir operaciones, o consulta el estado del mercado.
                            </div>
                        </div>
                    ) : (
                        roomChats.map(msg => <ChatBubble key={msg.id} msg={msg} color={room.color} />)
                    )}
                    <div ref={chatEndRef} />
                </div>

                {/* Chat Input */}
                <div className="px-3 py-3 border-t border-[#1a1f2e]">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={chatInput}
                            onChange={e => setChatInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleSendChat()}
                            placeholder={`Hablar con ${room.label}...`}
                            className="flex-1 bg-[#0d1117] border border-[#1a1f2e] rounded-xl px-3 py-2 text-[10px] font-mono text-white placeholder-[#2a3545] focus:outline-none focus:border-[#4a6cf7]/50"
                        />
                        <button
                            onClick={handleSendChat}
                            disabled={!chatInput.trim()}
                            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-30"
                            style={{ background: room.color + "20", color: room.color }}
                        >
                            <Send size={14} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AgentRooms;
