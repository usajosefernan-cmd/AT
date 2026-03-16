import React, { useState, useRef, useEffect } from "react";
import { useStore, getSocket } from "../store/useStore";
import { MessageSquare, Send, Bot, User, Activity, TrendingUp, Shield, Cpu, ChevronDown, Terminal } from "lucide-react";

interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: number;
}

const CommandChat: React.FC = () => {
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: "initial",
            role: "assistant",
            content: "CENTRAL DE COMANDO · NÚCLEO CEO\n\nEnlace neural establecido. El enjambre está operando bajo parámetros óptimos.\n\nSoy el CEO NEURONAL. ¿Cuál es su directiva estratégica para el fondo?",
            timestamp: Date.now(),
        },
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const connected = useStore(s => s.connected);

    const quickCommands = [
        { label: "REPORTE SWARM", cmd: "Dame un reporte de situación de todos los especialistas", icon: <Activity size={10} /> },
        { label: "AUDIT RIESGO", cmd: "¿Estamos cumpliendo con los límites de Axi Select?", icon: <Shield size={10} /> },
        { label: "LISTA SEÑALES", cmd: "Muestra las últimas señales detectadas por Sentinel", icon: <TrendingUp size={10} /> },
    ];

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, [messages]);

    useEffect(() => {
        const socket = getSocket();
        if (!socket) return;

        const handleResponse = (data: any) => {
            setMessages((p) => [...p, { 
                id: crypto.randomUUID(), 
                role: "assistant", 
                content: data.text || data.response || (typeof data === 'string' ? data : JSON.stringify(data)), 
                timestamp: Date.now() 
            }]);
            setLoading(false);
        };

        socket.on("ceo_response", handleResponse);
        
        // Also listen for general agent logs that might be relevant to the CEO
        socket.on("agent_reply", (data: any) => {
             if (data.agent_id === 'ceo') {
                handleResponse(data);
             }
        });

        return () => {
            socket.off("ceo_response", handleResponse);
            socket.off("agent_reply");
        };
    }, [connected]); // Re-bind if connection changes

    const send = async (overrideText?: string) => {
        const textToSend = overrideText || input;
        if (!textToSend.trim() || loading) return;

        const msg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: textToSend.trim(), timestamp: Date.now() };
        setMessages((p) => [...p, msg]);
        if (!overrideText) setInput("");
        setLoading(true);

        const socket = getSocket();
        if (socket && socket.connected) {
            socket.emit("user_command", { text: msg.content });
        } else {
            // Fallback to HTTP for initial setup or if socket is down
            try {
                const url = import.meta.env.VITE_API_URL || "http://localhost:8080";
                const res = await fetch(`${url}/api/command`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ command: msg.content }),
                });
                const data = await res.json();
                setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", content: data.response || data.error || "El CEO no responde en este momento.", timestamp: Date.now() }]);
            } catch (e: any) {
                setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", content: `ERROR DE ENLACE: ${e.message}`, timestamp: Date.now() }]);
            } finally {
                setLoading(false);
            }
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#060a10] border-l border-[#1a1f2e] shadow-2xl overflow-hidden relative">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a1f2e] bg-[#0b0e14] relative z-20">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#4a6cf7] to-[#8b5cf6] flex items-center justify-center shadow-lg">
                        <Cpu size={20} className="text-white" />
                    </div>
                    <div>
                        <h2 className="text-[12px] font-black text-white uppercase tracking-[0.2em] mb-0.5">NÚCLEO CEO</h2>
                        <div className="flex items-center gap-2">
                             <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-[#22c55e] animate-pulse' : 'bg-[#ef4444]'}`} />
                             <span className="text-[8px] font-bold text-[#5a6577] uppercase tracking-widest">{connected ? 'Sincronizado' : 'Offline'}</span>
                        </div>
                    </div>
                </div>
                {loading && (
                    <div className="flex gap-1.5">
                        {[0, 1, 2].map(i => (
                            <div key={i} className="w-1.5 h-1.5 bg-[#4a6cf7] rounded-full animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
                        ))}
                    </div>
                )}
            </div>

            {/* Chat Area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-8 scroll-smooth no-scrollbar relative">
                {/* Background watermark */}
                <div className="absolute inset-0 flex items-center justify-center opacity-[0.02] pointer-events-none">
                    <Bot size={300} />
                </div>

                {messages.map((m) => (
                    <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                        <div className={`flex items-start gap-4 max-w-[90%] ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                            <div className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center mt-1 border shadow-lg ${
                                m.role === "assistant" 
                                    ? "bg-[#111622] border-[#1a1f2e] text-[#4a6cf7]" 
                                    : "bg-[#4a6cf7] border-[#4a6cf7]/20 text-white"
                            }`}>
                                {m.role === "assistant" ? <Bot size={18} /> : <User size={18} />}
                            </div>
                            
                            <div className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                                <div className={`relative px-5 py-4 text-[11px] leading-relaxed shadow-xl ${
                                    m.role === "user"
                                        ? "bg-[#4a6cf7] text-white rounded-2xl rounded-tr-none shadow-[#4a6cf755]/10"
                                        : "bg-[#0b0e14] text-[#c9d1d9] border border-[#1a1f2e] rounded-2xl rounded-tl-none"
                                }`}>
                                    <div className="whitespace-pre-wrap font-mono uppercase tracking-tight selection:bg-white/20">
                                        {m.content}
                                    </div>
                                    <span className="block mt-2 text-[7px] font-black text-[#3a4555] uppercase tracking-widest opacity-60">
                                        {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            
            {/* Input Area */}
            <div className="p-6 border-t border-[#1a1f2e] bg-[#0b0e14]/90 backdrop-blur-2xl space-y-5">
                <div className="flex flex-wrap gap-2">
                    {quickCommands.map(qc => (
                        <button 
                            key={qc.label}
                            onClick={() => send(qc.cmd)}
                            className="group flex items-center gap-2 px-3 py-2 rounded-full bg-[#111622] border border-[#1a1f2e] hover:border-[#4a6cf7]/50 hover:bg-[#4a6cf7]/10 transition-all shadow-sm"
                        >
                            <span className="text-[#4a6cf7] group-hover:scale-110 transition-transform">{qc.icon}</span>
                            <span className="text-[8px] font-black text-[#5a6577] group-hover:text-white uppercase tracking-tighter transition-colors">{qc.label}</span>
                        </button>
                    ))}
                </div>

                <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-[#4a6cf7]/50 to-[#8b5cf6]/50 rounded-xl blur opacity-20 group-focus-within:opacity-40 transition duration-500"></div>
                    <div className="relative">
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && send()}
                            placeholder="TRANSMITIR DIRECTIVA ESTRATÉGICA..."
                            disabled={loading}
                            className="w-full bg-[#060a10] border border-[#1a1f2e] rounded-xl pl-5 pr-14 py-4 text-[11px] font-mono text-white placeholder-[#2a3545] focus:outline-none focus:border-[#4a6cf7]/50 transition-all uppercase"
                        />
                        <button 
                            onClick={() => send()} 
                            disabled={loading || !input.trim()} 
                            className="absolute right-2 top-2 w-10 h-10 rounded-lg bg-[#4a6cf7] text-white flex items-center justify-center shadow-lg hover:brightness-110 disabled:opacity-20 transition-all group/send"
                        >
                            <Send size={18} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                        </button>
                    </div>
                </div>
                <div className="flex items-center justify-between px-2">
                     <p className="text-[7px] text-[#3a4555] font-black uppercase tracking-[0.3em]">Cifrado Neural AES-256</p>
                     <div className="flex items-center gap-1.5">
                        <Terminal size={8} className="text-[#3a4555]" />
                        <span className="text-[7px] text-[#3a4555] font-black uppercase">Socket Estéril</span>
                     </div>
                </div>
            </div>
        </div>
    );
};

export default CommandChat;
