import React, { useEffect, useState } from "react";
import { useStore, AgentState, AgentLog } from "../store/useStore";
import { Info, Terminal, Activity, Zap, Shield, Cpu, ExternalLink, ChevronRight, BarChart3, Database, Settings, Layers, Globe, Users, Briefcase, TrendingUp } from "lucide-react";

const ANIMATION_CSS = `
@keyframes breathe { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes blink { 0%, 90%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }
@keyframes scan { 0% { transform: translateX(-6px); } 50% { transform: translateX(6px); } 100% { transform: translateX(-6px); } }
@keyframes pulse-glow { 0%, 100% { filter: drop-shadow(0 0 5px currentColor); } 50% { filter: drop-shadow(0 0 15px currentColor); } }
@keyframes float { 0% { transform: translate(0, 0); } 25% { transform: translate(2px, -2px); } 50% { transform: translate(-2px, 1px); } 75% { transform: translate(1px, 2px); } 100% { transform: translate(0, 0); } }
@keyframes grid-move { 0% { background-position: 0 0; } 100% { background-position: 40px 40px; } }

.pixel-breathe { animation: breathe 4s infinite ease-in-out; }
.pixel-eye-blink { animation: blink 4s infinite; }
.pixel-agent-glow { animation: pulse-glow 2s infinite ease-in-out; }
.pixel-float { animation: float 6s infinite ease-in-out; }
.animate-grid-move { animation: grid-move 20s linear infinite; }
`;

// ═══════════════════════════════════════════
// PIXEL AVATARS (Premium Design)
// ═══════════════════════════════════════════

const PixelCEO = ({ active }: { active: boolean }) => (
    <div className={`relative w-28 h-28 flex items-center justify-center pixel-breathe ${active ? 'pixel-agent-glow text-[#a78bfa]' : 'text-[#3a4555]'}`}>
        <svg viewBox="0 0 32 32" className="w-full h-full fill-none stroke-current" strokeWidth="1">
            <path d="M8 12 H24 V24 H8 Z" className="fill-[#0d1117]" />
            <path d="M10 12 L12 8 L16 12 L20 8 L22 12" className="stroke-[#f59e0b] fill-[#f59e0b]/20" />
            <rect x="11" y="15" width="10" height="4" className="fill-black" />
            <rect x="12" y="16" width="3" height="2" className={`fill-current ${active ? 'animate-pulse' : 'opacity-20'}`} />
            <rect x="17" y="16" width="3" height="2" className={`fill-current ${active ? 'animate-pulse' : 'opacity-20'}`} />
            <path d="M16 20 V22" className="stroke-[#a78bfa] opacity-60" />
            {active && <circle cx="16" cy="14" r="1.5" className="fill-[#a78bfa] animate-ping" />}
        </svg>
    </div>
);

const PixelSentinel = ({ active }: { active: boolean }) => (
    <div className={`relative w-24 h-24 flex items-center justify-center pixel-float ${active ? 'pixel-agent-glow text-[#4a6cf7]' : 'text-[#3a4555]'}`}>
        <svg viewBox="0 0 32 32" className="w-full h-full fill-none stroke-current" strokeWidth="1">
            <circle cx="16" cy="16" r="6" className="fill-[#0d1117]" />
            <circle cx="16" cy="16" r="3" className={`fill-current opacity-40 ${active ? 'animate-pulse' : ''}`} />
            <path d="M10 10 L6 6 M22 10 L26 6 M10 22 L6 26 M22 22 L26 26" className="opacity-50" />
            <circle cx="6" cy="6" r="2" className="fill-current opacity-20" />
            <circle cx="26" cy="6" r="2" className="fill-current opacity-20" />
        </svg>
    </div>
);

const PixelRisk = ({ active }: { active: boolean }) => (
    <div className={`relative w-24 h-24 flex items-center justify-center pixel-breathe ${active ? 'pixel-agent-glow text-[#22c55e]' : 'text-[#3a4555]'}`}>
        <svg viewBox="0 0 32 32" className="w-full h-full fill-none stroke-current" strokeWidth="1">
            <path d="M16 4 L6 8 V16 C6 22 10 26 16 28 C22 26 26 22 26 16 V8 L16 4 Z" className="fill-[#0d1117]" />
            <path d="M11 12H21 M11 16H21 M11 20H16" className="opacity-20" />
            <rect x="14" y="10" width="4" height="2" className={`fill-current ${active ? 'animate-pulse' : 'opacity-20'}`} />
        </svg>
    </div>
);

const PixelSpecialist = ({ active, color, id }: { active: boolean, color: string, id: string }) => (
    <div className={`relative w-24 h-24 flex items-center justify-center pixel-float`} style={{ color, filter: active ? `drop-shadow(0 0 10px ${color}44)` : 'none' }}>
        <svg viewBox="0 0 32 32" className="w-full h-full fill-none stroke-current" strokeWidth="1">
            <path d="M10 10 H22 V22 H10 Z" className="fill-[#0d1117]" />
            <rect x="12" y="13" width="2" height="2" className="fill-current pixel-eye-blink" />
            <rect x="18" y="13" width="2" height="2" className="fill-current pixel-eye-blink" />
            <rect x="14" y="17" width="4" height="2" className="fill-current opacity-20" />
            <path d="M12 24 L20 24" className="stroke-current opacity-30" strokeWidth="0.5" />
        </svg>
    </div>
);

const AgentCard = ({ agent, selected, onClick }: any) => {
    if (!agent) return null;
    let Avatar = PixelSpecialist;
    if (agent.id === 'ceo') Avatar = PixelCEO as any;

    const isActive = agent.status === 'active' || agent.status === 'success';

    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-all duration-300 group relative
                ${selected ? 'scale-110 z-10' : 'opacity-70 hover:opacity-100 hover:scale-105'}`}
        >
            {/* Status Border Glow */}
            <div className={`absolute inset-0 rounded-xl border-2 transition-all duration-500 ${
                selected ? 'border-[#4a6cf7] bg-[#4a6cf7]/5 shadow-[0_0_30px_rgba(74,108,247,0.1)]' : 'border-[#1a1f2e] group-hover:border-[#4a6cf7]/30'
            }`} />

            <div className="relative z-10">
                <Avatar active={isActive} color={agent.color || "#4a6cf7"} id={agent.id} />
                {isActive && (
                    <div className="absolute -top-1 -right-1 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22d3ee] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22d3ee]"></span>
                    </div>
                )}
            </div>

            <div className="relative z-10 flex flex-col items-center text-center">
                <span className="text-[10px] font-black font-mono text-white uppercase tracking-wider">{agent.name}</span>
                <span className="text-[7px] font-bold text-[#5a6577] uppercase tracking-[0.2em] mt-0.5">{agent.role}</span>
            </div>
            
            {/* Action Bar (Real-time feedback) */}
            {selected && (
                <div className="absolute -bottom-6 w-32 px-2 py-1 bg-[#1a1f2e] rounded border border-[#4a6cf7]/30 text-center animate-in slide-in-from-top-2 duration-300">
                     <p className="text-[6px] font-black text-[#4a6cf7] uppercase tracking-[0.2em] truncate">
                        {agent.action || 'STANDBY'}
                     </p>
                </div>
            )}
        </button>
    );
};

const AgentInspector = ({ agent, logs }: { agent: AgentState, logs: AgentLog[] }) => {
    const [command, setCommand] = useState("");
    const [sending, setSending] = useState(false);

    const sendCommand = async () => {
        if (!command.trim()) return;
        setSending(true);
        try {
            const API = import.meta.env.VITE_API_URL || "http://localhost:8080";
            await fetch(`${API}/api/specialist-command`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ agentId: agent.id, message: command })
            });
            setCommand("");
        } catch (e) { console.error(e); } finally { setSending(false); }
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-[#060a10] border-l border-[#1a1f2e] shadow-2xl">
            {/* Header Inspector */}
            <div className="p-6 border-b border-[#1a1f2e] bg-[#0b0e14]/80 backdrop-blur-xl">
                <div className="flex items-center gap-5">
                    <div className={`w-20 h-20 rounded-2xl bg-[#060a10] border-2 border-[#1a1f2e] flex items-center justify-center p-2 relative overflow-hidden group`}>
                        <div className="absolute inset-0 bg-gradient-to-br from-[#4a6cf7]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        {agent.id === 'ceo' ? <PixelCEO active /> : 
                         <PixelSpecialist active color={agent.color || "#4a6cf7"} id={agent.id} />}
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                             <h2 className="text-xl font-black text-white uppercase tracking-wider">{agent.name}</h2>
                             <div className="px-2 py-0.5 rounded bg-[#4a6cf7]/10 border border-[#4a6cf7]/20 text-[8px] font-black text-[#4a6cf7] uppercase">V4.2.0</div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                                <span className={`flex h-1.5 w-1.5 rounded-full ${agent.status === 'active' ? 'bg-[#22d3ee] animate-pulse' : 'bg-[#5a6577]'}`} />
                                <span className="text-[9px] font-black text-[#8a95a7] uppercase tracking-widest">{agent.role}</span>
                            </div>
                            <span className="text-[9px] font-mono text-[#3a4555]">|</span>
                            <span className="text-[9px] font-mono text-[#4a6cf7] uppercase">Latencia: {(Math.random() * 50 + 10).toFixed(0)}MS</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-6">
                    <div className="p-3 bg-[#0d1117] border border-[#1a1f2e] rounded-xl group hover:border-[#4a6cf7]/30 transition-colors">
                        <div className="flex items-center gap-2 mb-2">
                             <Briefcase size={10} className="text-[#4a6cf7]" />
                             <p className="text-[8px] font-black text-[#5a6577] uppercase tracking-widest">Misión Estratégica</p>
                        </div>
                        <p className="text-[10px] text-[#c9d1d9] font-mono leading-relaxed uppercase">{agent.mission || 'Operación Autónoma en Curso'}</p>
                    </div>
                    <div className="p-3 bg-[#0d1117] border border-[#1a1f2e] rounded-xl group hover:border-[#f59e0b]/30 transition-colors">
                        <div className="flex items-center gap-2 mb-2">
                             <Zap size={10} className="text-[#f59e0b]" />
                             <p className="text-[8px] font-black text-[#5a6577] uppercase tracking-widest">Perfil Conductual</p>
                        </div>
                        <p className="text-[10px] text-[#f59e0b] font-mono leading-relaxed uppercase">{agent.personality || 'Neutral / Protocolario'}</p>
                    </div>
                </div>
            </div>

            {/* Neural Stream */}
            <div className="flex-1 min-h-0 p-6 flex flex-col">
                <div className="flex items-center justify-between mb-3 px-2">
                    <div className="flex items-center gap-2">
                        <Terminal size={14} className="text-[#a78bfa]" />
                        <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Stream de Pensamiento</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="px-2 py-0.5 rounded bg-black/40 text-[7px] font-bold text-[#5a6577] border border-[#1a1f2e]">ENCRIPTACIÓN GRADO MILITAR</div>
                    </div>
                </div>
                
                <div className="flex-1 bg-[#03060a] rounded-2xl border border-[#1a1f2e] overflow-y-auto p-5 font-mono text-[10px] space-y-3 no-scrollbar shadow-inner relative">
                    <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
                        <Cpu size={120} />
                    </div>
                    {logs.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center opacity-30">
                            <Activity size={32} className="animate-pulse text-[#4a6cf7]" />
                            <p className="mt-4 uppercase tracking-[0.4em] text-[8px] font-black text-[#4a6cf7]">Escuchando núcleo neural...</p>
                        </div>
                    ) : (
                        logs.slice().reverse().map((log, i) => (
                            <div key={i} className="group flex gap-4 text-[#5a6577] animate-in fade-in slide-in-from-left-2 duration-300">
                                <span className="text-[#3a4555] flex-shrink-0 tabular-nums">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}]</span>
                                <div className="flex-1">
                                    <span className={log.level === 'error' ? 'text-[#ef4444]' : 'text-[#c9d1d9] font-medium'}>
                                        <span className={`mr-2 font-bold ${log.level === 'success' ? 'text-[#22c55e]' : log.level === 'warn' ? 'text-[#f59e0b]' : 'text-[#4a6cf7]'}`}>
                                            {log.level === 'error' ? 'ERR' : log.level === 'success' ? 'OK' : 'LOG'} {">>"}
                                        </span>
                                        {log.message || log.text}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Directive Input */}
                <div className="mt-6">
                    <div className="relative group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-[#4a6cf7]/20 to-[#a78bfa]/20 rounded-xl blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
                        <div className="relative flex items-center">
                            <input 
                                value={command}
                                onChange={e => setCommand(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && sendCommand()}
                                placeholder={`Enviar directiva directa a ${agent.name}...`}
                                className="w-full bg-[#0b0e14] border border-[#1a1f2e] rounded-xl px-4 py-4 text-[11px] font-mono text-white placeholder-[#2a3545] focus:outline-none focus:border-[#4a6cf7]/50 focus:ring-1 focus:ring-[#4a6cf7]/20 transition-all" 
                            />
                            <button 
                                onClick={sendCommand} 
                                disabled={sending || !command.trim()}
                                className="absolute right-2 px-6 py-2 bg-[#4a6cf7] text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:brightness-110 disabled:opacity-30 transition-all shadow-lg overflow-hidden group/btn"
                            >
                                <span className="relative z-10">{sending ? 'PROCESANDO' : 'COMANDAR'}</span>
                                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300"></div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const AgentFarm: React.FC = () => {
    const agents = useStore((s) => s.agents);
    const agentLogs = useStore((s) => s.agentLogs);
    const [selectedId, setSelectedId] = useState<string | null>("ceo");

    const hierarchy = {
        ceo: agents['ceo'],
        directors: Object.entries(agents).filter(([id]) => id !== 'ceo').map(([_, a]) => a)
    };

    const selectedAgent = selectedId ? agents[selectedId] : null;
    const selectedLogs = selectedId ? agentLogs.filter(log => log.agent_id === selectedId) : [];

    return (
        <div className="h-full flex flex-col bg-[#060a10] overflow-hidden">
            <style>{ANIMATION_CSS}</style>
            
            <div className="flex-1 flex min-h-0">
                {/* Organizational Structure View */}
                <div className="flex-1 p-10 overflow-y-auto no-scrollbar relative">
                    {/* Background Grid Decoration */}
                    <div className="absolute inset-0 opacity-[0.02] pointer-events-none animate-grid-move bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGQ9Ik00MCAwSDB2NDBoNDBWMHptLTEgMzlIMVYxaDM4djM4eiIgZmlsbD0id2hpdGUiLz4KPC9zdmc+')]"></div>
                    
                    <div className="max-w-4xl mx-auto flex flex-col items-center">
                        
                        {/* 1. ECHELON: LEADERSHIP */}
                        <div className="mb-20 text-center flex flex-col items-center relative">
                            <div className="px-6 py-2 rounded-full border border-[#4a6cf7]/20 bg-[#4a6cf7]/5 text-[10px] font-black text-[#4a6cf7] uppercase tracking-[0.5em] mb-10 shadow-[0_0_20px_rgba(74,108,247,0.1)]">Dirección General (Tier 1)</div>
                            {hierarchy.ceo && (
                                <AgentCard 
                                    agent={hierarchy.ceo} 
                                    selected={selectedId === 'ceo'} 
                                    onClick={() => setSelectedId('ceo')}
                                />
                            )}
                            {/* Connector Lines */}
                            <div className="absolute top-[160px] w-0.5 h-16 bg-gradient-to-b from-[#4a6cf7] to-[#f59e0b]" />
                        </div>

                        {/* 2. ECHELON: DIRECTORS */}
                        <div className="w-full flex flex-col items-center mt-10">
                            <div className="px-6 py-2 rounded-full border border-[#f59e0b]/20 bg-[#f59e0b]/5 text-[10px] font-black text-[#f59e0b] uppercase tracking-[0.5em] mb-10">Directores de Ecosistema (Tier 3)</div>
                            
                            <div className="flex flex-wrap justify-center gap-10 max-w-[800px]">
                                {hierarchy.directors.map(agent => (
                                    <AgentCard 
                                        key={agent.id} 
                                        agent={agent} 
                                        selected={selectedId === agent.id} 
                                        onClick={() => setSelectedId(agent.id)}
                                    />
                                ))}
                                {hierarchy.directors.length === 0 && (
                                    <div className="p-10 text-center border-2 border-dashed border-[#1a1f2e] rounded-3xl opacity-20">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-[#5a6577]">Alineando Directores...</p>
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                </div>

                {/* Inspector Sidebar */}
                <div className="w-[480px] flex flex-col flex-shrink-0 z-30">
                    {selectedAgent ? (
                        <AgentInspector agent={selectedAgent} logs={selectedLogs} />
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-10 text-center space-y-6 bg-[#060a10] border-l border-[#1a1f2e]">
                            <div className="relative">
                                <Cpu size={80} className="text-[#1a1f2e] animate-pulse" />
                                <div className="absolute inset-0 bg-[#4a6cf7]/5 blur-3xl rounded-full" />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-white uppercase tracking-[0.3em] mb-2">Selección de Nodo Neural</h3>
                                <p className="text-[10px] text-[#5a6577] uppercase font-mono tracking-widest max-w-[200px] mx-auto">Selecciona un agente en el enjambre para auditar su stream y enviar directivas.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AgentFarm;
