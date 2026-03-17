import React, { useEffect, useState, useRef } from "react";
import { useStore, AgentState, AgentLog } from "../store/useStore";
import { Terminal, Activity, Zap, Cpu, Briefcase } from "lucide-react";

// ═══════════════════════════════════════════
// CSS PARA LOS SPRITES ANIMADOS
// ═══════════════════════════════════════════
const ANIMATION_CSS = `
@keyframes grid-move { 0% { background-position: 0 0; } 100% { background-position: 40px 40px; } }
.animate-grid-move { animation: grid-move 20s linear infinite; }

/* El contenedor del sprite */
.sprite-container {
    background-repeat: no-repeat;
    image-rendering: pixelated; /* Crucial para Pixel Art */
    transition: filter 0.3s ease;
}
`;

// ═══════════════════════════════════════════
// MOTOR DE SPRITES (Lógica Real)
// ═══════════════════════════════════════════
interface SpriteProps {
    status: string;         // 'idle' | 'active' | 'thinking' | 'speaking' | 'success' | 'error'
    color: string;
    spriteUrl: string;      // URL real de tu .png de sprites
    frameSize: number;      // ej: 64 px
    scale?: number;         // x1.5, x2
}

const PixelSprite: React.FC<SpriteProps> = ({ status, color, spriteUrl, frameSize, scale = 1 }) => {
    const [bgPos, setBgPos] = useState(`0px 0px`);
    const frameRef = useRef(0);

    useEffect(() => {
        // Mapeo exhaustivo de estados a filas en un sprite sheet estándar
        // Asumiendo: Fila 0 (IDLE), Fila 1 (THINKING), Fila 2 (SPEAKING/ACTIVE), Fila 3 (ERROR)
        let rowY = 0;
        let numFrames = 4;
        let speed = 200; // ms por frame

        switch (status) {
            case 'idle':
            case 'undefined':
                rowY = 0;              // Fila 0
                numFrames = 4;
                speed = 300;
                break;
            case 'processing':
            case 'thinking':
                rowY = frameSize;      // Fila 1
                numFrames = 6;
                speed = 100;
                break;
            case 'active':
            case 'sending':
            case 'success':
            case 'speaking':
                rowY = frameSize * 2;  // Fila 2
                numFrames = 4;
                speed = 150;
                break;
            case 'error':
            case 'failed':
                rowY = frameSize * 3;  // Fila 3
                numFrames = 2;
                speed = 500;
                break;
            default:
                rowY = 0;
                break;
        }

        const interval = setInterval(() => {
            frameRef.current = (frameRef.current + 1) % numFrames;
            const x = -(frameRef.current * frameSize);
            const y = -rowY;
            setBgPos(`${x}px ${y}px`);
        }, speed);

        return () => clearInterval(interval);
    }, [status, frameSize]);

    const isGlowing = status !== 'idle' && status !== 'error' && status !== undefined;

    return (
        <div 
            className="sprite-container"
            style={{
                width: `${frameSize}px`,
                height: `${frameSize}px`,
                backgroundImage: `url(${spriteUrl})`,
                backgroundPosition: bgPos,
                transform: `scale(${scale})`,
                filter: isGlowing ? `drop-shadow(0 0 10px ${color})` : 'none',
            }}
        />
    );
};

// ═══════════════════════════════════════════
// TARJETA DE AGENTE
// ═══════════════════════════════════════════
const AgentCard = ({ agent, selected, onClick, isCeo }: any) => {
    if (!agent) return null;

    // En un entorno de producción, estos .png deben estar en la carpeta public/
    const spriteUrl = isCeo ? "/sprites/ceo.png" : "/sprites/director.png";

    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-center justify-center gap-4 p-4 rounded-xl transition-all duration-300 group relative w-32 h-40
                ${selected ? 'scale-110 z-10' : 'opacity-70 hover:opacity-100 hover:scale-105'}`}
        >
            {/* Status Border Glow */}
            <div className={`absolute inset-0 rounded-xl border-2 transition-all duration-500 ${
                selected ? 'border-[#4a6cf7] bg-[#4a6cf7]/5 shadow-[0_0_30px_rgba(74,108,247,0.1)]' : 'border-[#1a1f2e] group-hover:border-[#4a6cf7]/30'
            }`} />

            <div className="relative z-10 w-full flex items-center justify-center">
                <PixelSprite 
                    status={agent.status || 'idle'} 
                    color={agent.color || "#4a6cf7"} 
                    spriteUrl={spriteUrl}
                    frameSize={64} // Configura esto según tu archivo .png real
                    scale={isCeo ? 1.5 : 1.2}
                />
            </div>

            <div className="relative z-10 flex flex-col items-center text-center mt-2">
                <span className="text-[10px] font-black font-mono text-white uppercase tracking-wider leading-tight">{agent.name}</span>
                <span className="text-[7px] font-bold text-[#5a6577] uppercase tracking-[0.2em] mt-1">{agent.role}</span>
            </div>
            
            {/* Action Bar */}
            {selected && (
                <div className="absolute -bottom-6 w-38 px-2 py-1 bg-[#1a1f2e] rounded border border-[#4a6cf7]/30 text-center animate-in slide-in-from-top-2 duration-300">
                     <p className="text-[7px] font-black text-[#4a6cf7] uppercase tracking-[0.2em] truncate">
                        {agent.action || 'STANDBY'}
                     </p>
                </div>
            )}
        </button>
    );
};

// ═══════════════════════════════════════════
// INSPECTOR LATERAL
// ═══════════════════════════════════════════
const AgentInspector = ({ agent, logs }: { agent: AgentState, logs: AgentLog[] }) => {
    const [command, setCommand] = useState("");
    const [sending, setSending] = useState(false);

    const isCeo = agent.id === 'ceo';
    const spriteUrl = isCeo ? "/sprites/ceo.png" : "/sprites/director.png";

    const sendCommand = async () => {
        if (!command.trim()) return;
        setSending(true);
        try {
            const API = import.meta.env.VITE_API_URL || "http://localhost:8080";
            // Notar que el endpoint o socket puede variar, aquí simulamos el llamado REST al comando de Telegram/CEO
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
                    <div className="w-24 h-24 rounded-2xl bg-[#060a10] border-2 border-[#1a1f2e] flex items-center justify-center relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-[#4a6cf7]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <PixelSprite 
                            status={agent.status || 'idle'} 
                            color={agent.color || "#4a6cf7"} 
                            spriteUrl={spriteUrl}
                            frameSize={64}
                            scale={1.5}
                        />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                             <h2 className="text-xl font-black text-white uppercase tracking-wider">{agent.name}</h2>
                        </div>
                        <div className="flex items-center gap-3 mt-2">
                            <div className="flex items-center gap-1.5">
                                <span className={`flex h-1.5 w-1.5 rounded-full ${agent.status !== 'idle' ? 'bg-[#22d3ee] animate-pulse' : 'bg-[#5a6577]'}`} />
                                <span className="text-[9px] font-black text-[#8a95a7] uppercase tracking-widest">{agent.role}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-6">
                    <div className="p-3 bg-[#0d1117] border border-[#1a1f2e] rounded-xl group hover:border-[#4a6cf7]/30 transition-colors">
                        <div className="flex items-center gap-2 mb-2">
                             <Briefcase size={10} className="text-[#4a6cf7]" />
                             <p className="text-[8px] font-black text-[#5a6577] uppercase tracking-widest">Misión Estratégica</p>
                        </div>
                        <p className="text-[10px] text-[#c9d1d9] font-mono leading-relaxed uppercase">{agent.mission || 'Operación Autónoma'}</p>
                    </div>
                    <div className="p-3 bg-[#0d1117] border border-[#1a1f2e] rounded-xl group hover:border-[#f59e0b]/30 transition-colors">
                        <div className="flex items-center gap-2 mb-2">
                             <Zap size={10} className="text-[#f59e0b]" />
                             <p className="text-[8px] font-black text-[#5a6577] uppercase tracking-widest">Perfil Conductual</p>
                        </div>
                        <p className="text-[10px] text-[#f59e0b] font-mono leading-relaxed uppercase">{agent.personality || 'Protocolario'}</p>
                    </div>
                </div>
            </div>

            {/* Neural Stream (Logs) */}
            <div className="flex-1 min-h-0 p-6 flex flex-col">
                <div className="flex items-center justify-between mb-3 px-2">
                    <div className="flex items-center gap-2">
                        <Terminal size={14} className="text-[#a78bfa]" />
                        <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Stream Neural en Vivo</span>
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

                {/* Input Manual para Órdenes */}
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

// ═══════════════════════════════════════════
// COMPONENTE PRINCIPAL: AGENT FARM
// ═══════════════════════════════════════════
const AgentFarm: React.FC = () => {
    const agents = useStore((s) => s.agents);
    const agentLogs = useStore((s) => s.agentLogs);
    const [selectedId, setSelectedId] = useState<string | null>("ceo");

    // Construcción de los Tiers L1/L3
    const ceo = agents['ceo'];
    const directors = Object.entries(agents).filter(([id]) => id !== 'ceo').map(([_, a]) => a);

    const selectedAgent = selectedId ? agents[selectedId] : null;
    const selectedLogs = selectedId ? agentLogs.filter(log => log.agent_id === selectedId) : [];

    return (
        <div className="h-full flex flex-col bg-[#060a10] overflow-hidden">
            <style>{ANIMATION_CSS}</style>
            
            <div className="flex-1 flex min-h-0">
                {/* Organizational Structure View */}
                <div className="flex-1 p-10 overflow-y-auto no-scrollbar relative">
                    <div className="absolute inset-0 opacity-[0.02] pointer-events-none animate-grid-move bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGQ9Ik00MCAwSDB2NDBoNDBWMHptLTEgMzlIMVYxaDM4djM4eiIgZmlsbD0id2hpdGUiLz4KPC9zdmc+')]"></div>
                    
                    <div className="max-w-5xl mx-auto flex flex-col items-center pt-8">
                        
                        {/* 1. TIER 1: CEO AGENT */}
                        <div className="mb-24 text-center flex flex-col items-center relative z-20">
                            <div className="px-6 py-2 rounded-full border border-[#4a6cf7]/20 bg-[#4a6cf7]/5 text-[10px] font-black text-[#4a6cf7] uppercase tracking-[0.5em] mb-6 shadow-[0_0_20px_rgba(74,108,247,0.1)]">
                                Dirección General (Tier 1)
                            </div>
                            {ceo && (
                                <AgentCard 
                                    agent={ceo} 
                                    selected={selectedId === 'ceo'} 
                                    onClick={() => setSelectedId('ceo')}
                                    isCeo={true}
                                />
                            )}
                            {/* Cable conector hacia los directores */}
                            <div className="absolute top-[220px] w-0.5 h-20 bg-gradient-to-b from-[#4a6cf7] to-[#f59e0b] shadow-[0_0_10px_#4a6cf7]" />
                        </div>

                        {/* 2. TIER 3: L3 DIRECTORS */}
                        <div className="w-full flex flex-col items-center relative z-20">
                            <div className="px-6 py-2 rounded-full border border-[#f59e0b]/20 bg-[#f59e0b]/5 text-[10px] font-black text-[#f59e0b] uppercase tracking-[0.5em] mb-12">
                                Directores de Ecosistema (Tier 3)
                            </div>
                            
                            {/* Barra conectora horizontal */}
                            <div className="absolute top-[48px] w-[60%] h-0.5 bg-gradient-to-r from-transparent via-[#f59e0b] to-transparent shadow-[0_0_10px_#f59e0b]" />
                            
                            <div className="flex flex-wrap justify-center gap-x-12 gap-y-16 w-full">
                                {directors.map(agent => (
                                    <div key={agent.id} className="relative flex flex-col items-center">
                                        {/* Nodo vertical conectando a la barra */}
                                        <div className="absolute -top-[48px] w-0.5 h-[48px] bg-gradient-to-b from-[#f59e0b] to-transparent" />
                                        <AgentCard 
                                            agent={agent} 
                                            selected={selectedId === agent.id} 
                                            onClick={() => setSelectedId(agent.id)}
                                            isCeo={false}
                                        />
                                    </div>
                                ))}
                                {directors.length === 0 && (
                                    <div className="p-10 text-center border-2 border-dashed border-[#1a1f2e] rounded-3xl opacity-20 w-full">
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
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-white uppercase tracking-[0.3em] mb-2">Terminal Desconectada</h3>
                                <p className="text-[10px] text-[#5a6577] uppercase font-mono tracking-widest max-w-[200px] mx-auto">Selecciona una entidad neural para inspeccionar su hardware interno.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AgentFarm;
