import React, { useState, useEffect } from "react";
import { Crosshair, Pause, Play, Loader2, DollarSign } from "lucide-react";

interface HunterStats {
    totalCycles: number;
    llmCalls: number;
    anomaliesFound: number;
    tradeProposals: number;
    running: boolean;
}

const HunterControl: React.FC = () => {
    const [running, setRunning] = useState(true);
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState<HunterStats | null>(null);

    // Poll stats every 5 seconds
    useEffect(() => {
        const fetchStats = async () => {
            try {
                const url = import.meta.env.VITE_API_URL || "http://localhost:8080";
                const res = await fetch(`${url}/api/hunter/stats`);
                if (res.ok) {
                    const data = await res.json();
                    setStats(data);
                    setRunning(data.running);
                }
            } catch { }
        };
        fetchStats();
        const id = setInterval(fetchStats, 5000);
        return () => clearInterval(id);
    }, []);

    const toggle = async () => {
        setLoading(true);
        try {
            const url = import.meta.env.VITE_API_URL || "http://localhost:8080";
            const endpoint = running ? "/api/hunter/pause" : "/api/hunter/resume";
            await fetch(`${url}${endpoint}`, { method: "POST" });
            setRunning(!running);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 backdrop-blur-sm overflow-hidden">
            <div className="p-3 space-y-2">
                {/* API Call Counter — THE KEY METRIC */}
                <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#0d1117] border border-slate-800">
                    <div className="flex items-center gap-1.5">
                        <DollarSign size={12} className={stats?.llmCalls === 0 ? "text-emerald-400" : "text-amber-400"} />
                        <span className="text-[9px] font-bold uppercase text-slate-400">Llamadas API</span>
                    </div>
                    <span className={`text-sm font-black font-mono ${stats?.llmCalls === 0 ? "text-emerald-400" : "text-amber-400"}`}>
                        {stats?.llmCalls ?? 0}
                    </span>
                </div>

                {/* Mini stats row */}
                <div className="flex gap-2 text-[8px] font-mono text-slate-500 px-1">
                    <span>⟳ {stats?.totalCycles ?? 0} scans</span>
                    <span>⚡ {stats?.anomaliesFound ?? 0} anom</span>
                    <span>📊 {stats?.tradeProposals ?? 0} trades</span>
                </div>

                {/* Pause/Resume Button */}
                <button
                    onClick={toggle}
                    disabled={loading}
                    className={`
                        w-full relative rounded-lg font-bold uppercase tracking-wider text-[10px] py-2.5 transition-all duration-300
                        ${running
                            ? "bg-gradient-to-r from-emerald-500/15 to-emerald-600/15 text-emerald-400 border border-emerald-500/25 hover:from-red-500/15 hover:to-red-600/15 hover:text-red-400 hover:border-red-500/25"
                            : "bg-gradient-to-r from-slate-700/20 to-slate-800/20 text-slate-400 border border-slate-600/25 hover:from-emerald-500/15 hover:to-emerald-600/15 hover:text-emerald-400"
                        }
                    `}
                >
                    {loading ? (
                        <span className="flex items-center justify-center gap-1.5">
                            <Loader2 size={12} className="animate-spin" />
                            {running ? "Pausando..." : "Reanudando..."}
                        </span>
                    ) : running ? (
                        <span className="flex items-center justify-center gap-1.5">
                            <Pause size={12} />
                            PAUSAR RADAR
                        </span>
                    ) : (
                        <span className="flex items-center justify-center gap-1.5">
                            <Play size={12} />
                            REANUDAR RADAR
                        </span>
                    )}
                </button>
                <p className="text-center text-[8px] text-slate-600">
                    {running
                        ? "📡 Radar matemático (GRATIS) | LLM = modo sniper"
                        : "⏸️ Pausado — coste cero"
                    }
                </p>
            </div>
        </div>
    );
};

export default HunterControl;
