import { useEffect, useState } from 'react';
import { useStore, getSocket } from '../store/useStore';
import { DollarSign, Cpu, Zap, History, Calendar } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';

export default function CostTracker() {
    const [sessionCost, setSessionCost] = useState(0);
    const [sessionTokens, setSessionTokens] = useState(0);

    // Historico y diario
    const [dailyCost, setDailyCost] = useState(0);
    const [totalCost, setTotalCost] = useState(0);
    const [historyLoading, setHistoryLoading] = useState(true);

    const connected = useStore((state) => state.connected);

    useEffect(() => {
        // Cargar historial inicial desde Supabase
        const fetchHistory = async () => {
            try {
                setHistoryLoading(true);
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const { data, error } = await supabase
                    .from('api_telemetry')
                    .select('cost_usd, timestamp');

                if (error) throw error;

                let total = 0;
                let daily = 0;

                data?.forEach(log => {
                    total += log.cost_usd || 0;
                    if (new Date(log.timestamp) >= today) {
                        daily += log.cost_usd || 0;
                    }
                });

                setTotalCost(total);
                setDailyCost(daily);
            } catch (error) {
                console.error("Error fetching cost history:", error);
            } finally {
                setHistoryLoading(false);
            }
        };

        fetchHistory();
    }, []);

    useEffect(() => {
        const socket = getSocket();
        if (!socket || !connected) return;

        // Escuchar el taxímetro del backend
        const handleUpdate = (metrics: any) => {
            setSessionCost((prev) => prev + metrics.cost_usd);
            setSessionTokens((prev) => prev + metrics.input_tokens + metrics.output_tokens);

            // Actualizar también los acumulados si llegan en vivo
            setDailyCost((prev) => prev + metrics.cost_usd);
            setTotalCost((prev) => prev + metrics.cost_usd);
        };

        socket.on('api_cost_update', handleUpdate);

        return () => {
            socket.off('api_cost_update', handleUpdate);
        };
    }, [connected]);

    return (
        <div className="bg-[#0b0e14] border border-[#1a1f2e] rounded-xl p-4 flex flex-col gap-4 shadow-2xl relative overflow-hidden group">
            {/* Ambient Background Gradient */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#4a6cf7]/5 blur-[60px] pointer-events-none group-hover:bg-[#4a6cf7]/10 transition-colors" />
            
            <div className="flex items-center justify-between">
                <h3 className="text-[#5a6577] text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-[#4a6cf7]/10 border border-[#4a6cf7]/20">
                        <Cpu size={12} className="text-[#4a6cf7]" />
                    </div>
                    Telemetría Neural (API)
                </h3>
                {!historyLoading && (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#22c55e]/5 border border-[#22c55e]/20">
                        <span className="w-1 h-1 rounded-full bg-[#22c55e] animate-pulse" />
                        <span className="text-[8px] font-bold text-[#22c55e]">SYNC</span>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 gap-3">
                {/* Métricas de Sesión */}
                <div className="bg-[#111622]/50 p-3 rounded-xl border border-[#1a1f2e] hover:border-[#4a6cf7]/30 transition-all">
                    <div className="flex items-center gap-1.5 mb-1.5">
                        <Zap size={10} className="text-[#4a6cf7]" />
                        <p className="text-[#3a4555] text-[8px] font-black uppercase tracking-tighter">Session Tokens</p>
                    </div>
                    <div className="text-white font-mono text-sm font-bold tabular-nums">
                        {sessionTokens.toLocaleString()}
                    </div>
                </div>

                <div className="bg-[#111622]/50 p-3 rounded-xl border border-[#1a1f2e] hover:border-[#22c55e]/30 transition-all">
                    <div className="flex items-center gap-1.5 mb-1.5">
                        <DollarSign size={10} className="text-[#22c55e]" />
                        <p className="text-[#3a4555] text-[8px] font-black uppercase tracking-tighter">Session Cost</p>
                    </div>
                    <div className="text-[#22c55e] font-mono text-sm font-bold tabular-nums">
                        ${sessionCost.toFixed(5)}
                    </div>
                </div>

                {/* Métricas Históricas */}
                <div className="bg-[#0d1117] p-3 rounded-xl border border-[#1a1f2e] flex flex-col justify-center">
                    <div className="flex items-center gap-1.5 mb-1 text-[#3a4555]">
                        <Calendar size={10} />
                        <span className="text-[8px] font-black uppercase tracking-tighter">Diario</span>
                    </div>
                    <div className="text-[#8a95a7] font-mono text-[11px] font-bold">
                        ${historyLoading ? "..." : dailyCost.toFixed(4)}
                    </div>
                </div>

                <div className="bg-[#0d1117] p-3 rounded-xl border border-[#1a1f2e] flex flex-col justify-center">
                    <div className="flex items-center gap-1.5 mb-1 text-[#3a4555]">
                        <History size={10} />
                        <span className="text-[8px] font-black uppercase tracking-tighter">Total</span>
                    </div>
                    <div className="text-[#f59e0b] font-mono text-[11px] font-bold">
                        ${historyLoading ? "..." : totalCost.toFixed(4)}
                    </div>
                </div>
            </div>

            <div className="text-[8px] text-[#2a3545] font-black uppercase tracking-[0.1em] text-right mt-1">
                * Real-time audit (Supabase Sync)
            </div>
        </div>
    );
}
