import React, { useEffect, useState } from "react";
import { Routes, Route, useNavigate, useLocation, Navigate, Link } from "react-router-dom";
import { initSocket, useStore, DESKS } from "./store/useStore";
import { Login } from "./components/Login";
import DeskView from "./components/DeskView";
import AgentFarm from "./components/AgentFarm";
import AgentRooms from "./components/AgentRooms";
import AdminConsole from "./components/AdminConsole";
import {
    LayoutDashboard,
    Cpu,
    Settings,
    LogOut,
    Wifi,
    WifiOff,
    Clock,
    OctagonX,
    TrendingUp,
    MessageSquare,
    ChevronLeft,
    ChevronRight,
    Activity,
    ShieldCheck
} from "lucide-react";
import CommandChat from "./components/CommandChat";
import { supabase } from "./utils/supabaseClient";

const App: React.FC = () => {
    const connected = useStore((s) => s.connected);
    const account = useStore((s) => s.account);
    const killSwitchActive = useStore((s) => s.killSwitchActive);
    const agents = useStore((s) => s.agents);
    const latestPrices = useStore((s) => s.marketData);

    const [time, setTime] = useState(new Date());
    const [session, setSession] = useState<any>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [chatOpen, setChatOpen] = useState(false);

    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        // Auth Initial check
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setAuthLoading(false);
            // Always connect socket — with token if logged in, without if dev mode
            initSocket(session?.access_token);
        });

        // Auth Listener
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session) {
                initSocket(session.access_token);
            } else {
                import("./store/useStore").then(({ disconnectSocket }) => disconnectSocket());
            }
        });

        const t = setInterval(() => setTime(new Date()), 1000);
        return () => {
            clearInterval(t);
            subscription.unsubscribe();
        };
    }, []);

    if (authLoading) {
        return (
            <div className="h-screen w-screen bg-[#060a10] flex flex-col items-center justify-center gap-4">
                <div className="w-12 h-12 border-4 border-[#4a6cf7]/20 border-t-[#4a6cf7] rounded-full animate-spin" />
                <span className="text-[#4a6cf7] font-mono text-[10px] tracking-[0.2em] uppercase animate-pulse">
                    Inicializando Enlace Neural...
                </span>
            </div>
        );
    }

    if (!session) return <Login />;

    const handleKill = async () => {
        const url = import.meta.env.VITE_API_URL || "http://localhost:8080";
        await fetch(`${url}/api/killswitch`, { method: "POST" });
        useStore.getState().setKillSwitch(true);
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        setSession(null);
        useStore.getState().disconnectSocket();
        navigate("/");
    };

    const isActive = (path: string) => location.pathname.startsWith(path);

    return (
        <div className="h-screen w-screen bg-[#060a10] text-[#c9d1d9] flex overflow-hidden font-sans selection:bg-[#4a6cf7]/30">

            {/* ═══════════════════════════════════════════ */}
            {/* SIDEBAR NAVIGATION — Paginated Structure */}
            {/* ═══════════════════════════════════════════ */}
            <nav className="w-16 flex-shrink-0 bg-[#0b0e14] border-r border-[#1a1f2e] flex flex-col items-center py-4 gap-4 z-50">
                {/* Brand Logo */}
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#4a6cf7] to-[#a78bfa] flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(74,108,247,0.2)]">
                    <Cpu size={18} className="text-white" />
                </div>

                <div className="flex flex-col gap-3 w-full px-2">
                    <Link to="/trade" className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all group ${isActive('/trade') ? 'bg-[#4a6cf7]/10 text-[#4a6cf7]' : 'text-[#5a6577] hover:bg-[#111622] hover:text-[#c9d1d9]'}`}>
                        <TrendingUp size={20} className={isActive('/trade') ? "drop-shadow-[0_0_8px_rgba(74,108,247,0.5)]" : ""} />
                        <span className="text-[8px] font-black uppercase mt-1 tracking-tighter">Trading</span>
                    </Link>

                    <Link to="/agents" className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all group ${isActive('/agents') ? 'bg-[#a78bfa]/10 text-[#a78bfa]' : 'text-[#5a6577] hover:bg-[#111622] hover:text-[#c9d1d9]'}`}>
                        <Cpu size={20} className={isActive('/agents') ? "drop-shadow-[0_0_8px_rgba(167,139,250,0.5)]" : ""} />
                        <span className="text-[8px] font-black uppercase mt-1 tracking-tighter">Agentes</span>
                        {Object.values(agents).some(a => a.status === 'active') && (
                            <div className="absolute top-1 right-1 w-2 h-2 bg-[#22d3ee] rounded-full animate-ping" />
                        )}
                    </Link>

                    <Link to="/settings" className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all group ${isActive('/settings') ? 'bg-[#f59e0b]/10 text-[#f59e0b]' : 'text-[#5a6577] hover:bg-[#111622] hover:text-[#c9d1d9]'}`}>
                        <Settings size={20} className={isActive('/settings') ? "drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" : ""} />
                        <span className="text-[8px] font-black uppercase mt-1 tracking-tighter">Ajustes</span>
                    </Link>
                </div>

                <div className="mt-auto flex flex-col items-center gap-4 pb-2 w-full px-2">
                    {/* Connection Status */}
                    <div className="flex flex-col items-center gap-1 group relative cursor-help">
                        {connected ? (
                            <Wifi size={14} className="text-[#22c55e] drop-shadow-[0_0_5px_rgba(34,197,94,0.5)]" />
                        ) : (
                            <WifiOff size={14} className="text-[#ef4444]" />
                        )}
                        <div className="absolute left-10 bg-[#0d1117] border border-[#1a1f2e] px-2 py-1 rounded text-[8px] font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            {connected ? "ENLACE WSS ESTABLE" : "ENLACE CORTADO"}
                        </div>
                    </div>

                    <button
                        onClick={handleLogout}
                        className="w-full flex flex-col items-center justify-center p-2 text-[#5a6577] hover:text-[#ef4444] hover:bg-[#ef4444]/5 rounded-lg transition-all"
                    >
                        <LogOut size={18} />
                        <span className="text-[7px] font-black uppercase mt-1">Salir</span>
                    </button>
                </div>

                {/* Global CEO Chat Toggle (Quick Access) */}
                <div className="mt-4 pt-4 border-t border-[#1a1f2e] w-full flex justify-center pb-4">
                    <button 
                        onClick={() => setChatOpen(!chatOpen)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${chatOpen ? 'bg-[#4a6cf7] text-white shadow-[0_0_15px_#4a6cf755]' : 'bg-[#1a1f2e] text-[#5a6577] hover:text-[#4a6cf7]'}`}
                    >
                        <MessageSquare size={18} />
                    </button>
                </div>
            </nav>

            {/* ═══════════════════════════════════════════ */}
            {/* MAIN WORKSPACE */}
            {/* ═══════════════════════════════════════════ */}
            <main className="flex-1 flex flex-col min-h-0 bg-[#060a10] relative">

                {/* Status Indicator (Compact) */}
                <div className={`absolute top-0 left-0 right-0 z-[60] h-0.5 transition-all ${connected ? 'bg-[#22c55e]' : 'bg-[#ef4444] animate-pulse'}`} />

                {/* Global Status Ribbon (Professional Header) */}
                <header className="h-12 border-b border-[#1a1f2e] bg-[#0b0e14] flex items-center justify-between px-6 flex-shrink-0 z-40">
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-[#5a6577] uppercase tracking-widest mb-0.5">Estado del Gremio</span>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2 text-[10px] font-mono">
                                    <span className="text-[#3a4555]">EQUIDAD:</span>
                                    <span className="text-white font-bold tabular-nums">${account.equity.toLocaleString()}</span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] font-mono">
                                    <span className="text-[#3a4555]">PROLONGADO:</span>
                                    <span className={`font-bold tabular-nums ${account.totalPnl >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                                        {account.totalPnl >= 0 ? "▲" : "▼"} ${Math.abs(account.totalPnl).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="w-px h-6 bg-[#1a1f2e]" />

                        <div className="flex items-center gap-3">
                            <span className="text-[8px] font-black text-[#5a6577] uppercase tracking-widest">Enlace Swarm</span>
                            <div className="flex gap-1.5">
                                {Object.entries(agents).map(([id, a]) => (
                                    <div 
                                        key={id} 
                                        title={`${id.toUpperCase()}: ${a.status}`}
                                        className={`w-1.5 h-1.5 rounded-full transition-all ${a.status === 'active' ? 'bg-[#22d3ee] shadow-[0_0_8px_#22d3ee]' : 'bg-[#1a1f2e]'}`} 
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-[9px] font-mono bg-[#111622] px-3 py-1.5 rounded border border-[#1a1f2e]">
                            <Clock size={10} className="text-[#4a6cf7]" />
                            <span className="text-[#c9d1d9] tracking-widest uppercase">{time.toLocaleTimeString('en-US', { hour12: false })}</span>
                        </div>

                        <button
                            onClick={handleKill}
                            className={`flex items-center gap-2 h-8 px-4 rounded font-black text-[9px] transition-all uppercase tracking-widest border ${killSwitchActive
                                ? "bg-[#ef4444] text-white border-[#ef4444] shadow-[0_0_15px_rgba(239,68,68,0.4)]"
                                : "bg-[#ef4444]/5 text-[#ef4444] border-[#ef4444]/20 hover:bg-[#ef4444] hover:text-white"
                                }`}
                        >
                            <ShieldCheck size={12} /> Desactivar Todo
                        </button>

                        <div className="w-px h-6 bg-[#1a1f2e]" />

                        <div className="flex items-center gap-2">
                             <div className={`w-2 h-2 rounded-full ${connected ? 'bg-[#22c55e] animate-pulse' : 'bg-[#ef4444]'}`} />
                             <span className="text-[10px] font-black text-white uppercase tracking-tighter">Motor v1.0</span>
                        </div>
                    </div>
                </header>

                {/* Sub-navigation for Trading Desks (only on /trade) */}
                {isActive('/trade') && (
                    <div className="h-9 border-b border-[#1a1f2e] bg-[#0b0e14] flex items-center px-4 gap-1 flex-shrink-0 overflow-x-auto no-scrollbar">
                        {DESKS.filter(d => d.id !== 'admin').map((desk) => (
                            <Link
                                key={desk.id}
                                to={`/trade/${desk.id}`}
                                className={`px-4 h-full flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider transition-all border-b-2 ${location.pathname.includes(desk.id) || (location.pathname === '/trade' && desk.id === 'overview')
                                    ? `text-white border-[${desk.color}]`
                                    : "text-[#5a6577] border-transparent hover:text-[#8a95a7]"
                                    }`}
                                style={location.pathname.includes(desk.id) || (location.pathname === '/trade' && desk.id === 'overview') ? { borderColor: desk.color } : {}}
                            >
                                <span>{desk.icon}</span>
                                <span>{desk.label}</span>
                            </Link>
                        ))}
                    </div>
                )}

                {/* Route Surface & Global CEO Chat Panel */}
                <div className="flex-1 flex min-h-0 relative overflow-hidden">
                    {/* Main Content Area */}
                    <div className="flex-1 relative overflow-hidden">
                        <Routes>
                            <Route path="/" element={<Navigate to="/trade/overview" replace />} />
                            <Route path="/trade" element={<Navigate to="/trade/overview" replace />} />
                            {DESKS.filter(d => d.id !== 'admin').map(desk => (
                                <Route key={desk.id} path={`/trade/${desk.id}`} element={<DeskView desk={desk} />} />
                            ))}
                            <Route path="/agents" element={<AgentFarm />} />
                            <Route path="/rooms" element={<AgentRooms />} />
                            <Route path="/settings" element={<AdminConsole />} />
                            <Route path="*" element={<Navigate to="/trade/overview" replace />} />
                        </Routes>
                    </div>

                    {/* CEO NEURAL LINK (Global Chat Drawer) */}
                    <div className={`transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] border-l border-[#1a1f2e] bg-[#0b0e14] flex flex-col z-[45] ${chatOpen ? 'w-[350px]' : 'w-0 overflow-hidden'}`}>
                        <div className="h-12 flex items-center justify-between px-4 border-b border-[#1a1f2e] flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-[#4a6cf7] animate-pulse" />
                                <span className="text-[10px] font-black text-white uppercase tracking-widest">Enlace Neural CEO</span>
                            </div>
                            <button onClick={() => setChatOpen(false)} className="text-[#3a4555] hover:text-white transition-colors">
                                <ChevronRight size={16} />
                            </button>
                        </div>
                        <div className="flex-1 min-h-0">
                            <CommandChat />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default App;
