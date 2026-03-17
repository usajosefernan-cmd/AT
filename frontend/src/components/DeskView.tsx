import React, { useState } from "react";
import { DeskConfig, useStore } from "../store/useStore";
import MarketContext from "./MarketContext";
import HunterControl from "./HunterControl";
import LiveTerminal from "./LiveTerminal";
import PortfolioManager from "./PortfolioManager";
import CostTracker from "./CostTracker";
import { ErrorBoundary } from "./ErrorBoundary";
import { Zap, Loader2, Maximize2, Minimize2, Terminal as TerminalIcon, ChevronDown, Monitor, Share2, Activity } from "lucide-react";

interface Props { desk: DeskConfig; }

const DeskView: React.FC<Props> = ({ desk }) => {
    const [forceLoading, setForceLoading] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [dynamicSymbols, setDynamicSymbols] = useState<string[]>(desk.symbols);
    const selectedSymbol = useStore(s => s.selectedSymbols[desk.id]) || dynamicSymbols[0];
    const setSelectedSymbol = useStore(s => s.setSelectedSymbol);

    React.useEffect(() => {
        const fetchRadarSymbols = async () => {
            try {
                const url = import.meta.env.VITE_API_URL || "http://localhost:8080";
                const exchangeParam = desk.exchange === "ALL" ? "hyperliquid" : desk.exchange; // Default global to HL
                const res = await fetch(`${url}/api/radar/${exchangeParam}`);
                const data = await res.json();
                
                if (data.success && data.symbols && data.symbols.length > 0) {
                    setDynamicSymbols(data.symbols);
                }
            } catch (err) {
                console.error("Failed to fetch radar symbols:", err);
            }
        };
        fetchRadarSymbols();
    }, [desk.exchange]);

    const handleForceAnalysis = async () => {
        setForceLoading(true);
        try {
            const url = import.meta.env.VITE_API_URL || "http://localhost:8080";
            const res = await fetch(`${url}/api/force-analysis`, { method: "POST" });
            const data = await res.json();
            console.log("[FORCE ANALYSIS] Result:", data);
        } catch (e) {
            console.error("[FORCE ANALYSIS] Error:", e);
        } finally {
            setForceLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#060a10] overflow-hidden">
            {/* High-Performance TopBar */}
            <header className="h-16 border-b border-[#1a1f2e] bg-[#0b0e14] flex items-center justify-between px-8 flex-shrink-0 z-30 shadow-2xl relative">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#4a6cf7]/50 to-transparent opacity-20" />
                
                <div className="flex items-center gap-10">
                    <div className="flex items-center gap-4 group">
                        <div className="w-12 h-12 rounded-2xl bg-[#111622] flex items-center justify-center border border-[#1a1f2e] group-hover:border-[#4a6cf7]/50 transition-all shadow-inner relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-[#4a6cf7]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            <span className="text-2xl group-hover:scale-110 transition-transform duration-500 z-10">{desk.icon}</span>
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-[16px] font-black text-white uppercase tracking-[0.2em] leading-none mb-1">{desk.label}</h2>
                            <div className="flex items-center gap-2">
                                <span className="flex h-1.5 w-1.5 rounded-full bg-[#4a6cf7] animate-pulse" />
                                <span className="text-[9px] font-bold text-[#5a6577] uppercase tracking-widest">{desk.exchange} · INFRAESTRUCTURA ACTIVA</span>
                            </div>
                        </div>
                    </div>

                    <div className="w-px h-10 bg-[#1a1f2e]" />

                    {/* Highly Visible Pair Selector */}
                    <div className="flex flex-col gap-1.5 min-w-[180px]">
                        <div className="flex items-center gap-2">
                            <Activity size={10} className="text-[#4a6cf7]" />
                            <span className="text-[9px] font-black text-[#5a6577] uppercase tracking-[0.3em]">Activo en Monitor</span>
                        </div>
                        <div className="relative group">
                            <div className="absolute -inset-0.5 bg-[#4a6cf7]/20 rounded-lg blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
                            <div className="relative">
                                <select
                                    value={selectedSymbol}
                                    onChange={async (e) => {
                                        const symbol = e.target.value;
                                        setSelectedSymbol(desk.id, symbol);

                                        const { getSocket } = await import("../store/useStore");
                                        const socket = getSocket();
                                        if (socket) {
                                            socket.emit("subscribe_market", { exchange: desk.exchange, symbol });
                                        }
                                    }}
                                    className="w-full appearance-none bg-[#111622] border border-[#1a1f2e] text-white text-[12px] font-black font-mono pl-4 pr-10 py-2.5 rounded-xl outline-none focus:border-[#4a6cf7] transition-all cursor-pointer hover:bg-[#161c2b] shadow-lg"
                                >
                                    {dynamicSymbols.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#4a6cf7]">
                                    <ChevronDown size={14} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="hidden xl:flex flex-col items-end mr-4">
                        <span className="text-[8px] font-black text-[#3a4555] uppercase tracking-widest mb-1">Carga Operacional</span>
                        <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className={`w-3 h-1 rounded-full ${i <= 3 ? 'bg-[#4a6cf7]' : 'bg-[#1a1f2e]'}`} />
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={handleForceAnalysis}
                        disabled={forceLoading}
                        className="group relative flex items-center gap-3 px-8 h-10 rounded-xl font-black text-[11px] uppercase tracking-[0.2em] transition-all bg-[#4a6cf7] text-white hover:brightness-110 shadow-[0_10px_30px_-5px_#4a6cf755] disabled:opacity-30 overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-white/10 -translate-x-full group-hover:translate-x-0 transition-transform duration-500" />
                        {forceLoading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                        <span className="relative z-10">{forceLoading ? "PROCESANDO..." : "Ejecutar Análisis Swarm"}</span>
                    </button>

                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className={`p-2.5 rounded-xl border transition-all ${isExpanded ? 'bg-[#4a6cf7] text-white border-[#4a6cf7]' : 'text-[#5a6577] bg-[#111622] border-[#1a1f2e] hover:border-[#4a6cf7]/50 hover:text-white shadow-lg'}`}
                    >
                        {isExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                    </button>
                </div>
            </header>

            {/* Layout Grid optimized for Algorithmic Context */}
            <div className="flex-1 flex min-h-0">
                {/* Main section: Chart & Positions */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="flex-1 min-h-0 overflow-hidden relative">
                         <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(74,108,247,0.02)_0%,transparent_100%)] pointer-events-none" />
                        <ErrorBoundary name="MarketContext">
                            <MarketContext />
                        </ErrorBoundary>
                    </div>

                    <div className={`transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] border-t border-[#1a1f2e] bg-[#0b0e14] ${isExpanded ? 'h-0 opacity-0 overflow-hidden' : 'h-[320px]'}`}>
                        <ErrorBoundary name="PortfolioManager">
                            <PortfolioManager />
                        </ErrorBoundary>
                    </div>
                </div>

                {/* Vertical Terminal: For real-time algorithmic logs */}
                <div className="w-[340px] border-l border-[#1a1f2e] flex flex-col bg-[#060a10] shadow-2xl z-20">
                    <div className="px-5 py-4 border-b border-[#1a1f2e] bg-[#0d1117] flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-[#a78bfa] animate-pulse" />
                            <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Enlace Algorítmico</span>
                        </div>
                        <Monitor size={14} className="text-[#3a4555]" />
                    </div>
                    
                    <div className="flex-1 min-h-0 px-2 pt-2">
                        <ErrorBoundary name="LiveTerminal">
                            <LiveTerminal />
                        </ErrorBoundary>
                    </div>

                    <div className="mt-auto space-y-2 p-4 bg-[#0b0e14]/50 border-t border-[#1a1f2e]">
                        <ErrorBoundary name="HunterControl">
                            <HunterControl />
                        </ErrorBoundary>

                        {/* API Cost Tracker */}
                        <ErrorBoundary name="CostTracker">
                            <CostTracker />
                        </ErrorBoundary>

                        {/* Professional Telemetry */}
                        <div className="p-4 rounded-xl border border-[#1a1f2e] bg-[#0d1117]/50 text-[10px] font-mono space-y-2.5">
                            <div className="flex justify-between items-center group">
                                <span className="text-[#3a4555] group-hover:text-[#5a6577] transition-colors uppercase tracking-widest">TELEMETRÍA WSS</span>
                                <span className="text-[#22c55e] font-bold">24.2 MS</span>
                            </div>
                            <div className="flex justify-between items-center group">
                                <span className="text-[#3a4555] group-hover:text-[#5a6577] transition-colors uppercase tracking-widest">ESTADO API</span>
                                <span className="text-[#22c55e] font-bold">NOMINAL</span>
                            </div>
                            <div className="flex justify-between items-center group">
                                <span className="text-[#3a4555] group-hover:text-[#5a6577] transition-colors uppercase tracking-widest">EJECUCIÓN</span>
                                <span className="text-[#f59e0b] font-bold">PAPER_V1</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DeskView;
