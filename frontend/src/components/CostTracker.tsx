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
                    .from('api_usage_logs')
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
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col gap-3 mt-4">
            <h3 className="text-slate-400 text-xs font-mono uppercase flex items-center gap-2">
                <Cpu size={14} className="text-blue-400" />
                Telemetría API Groq
            </h3>

            <div className="grid grid-cols-2 gap-4">
                {/* Métricas de Sesión */}
                <div className="bg-slate-950 p-3 rounded border border-slate-800/50">
                    <p className="text-slate-500 text-[10px] uppercase mb-1">Gasto de Sesión</p>
                    <div className="flex items-center text-emerald-400 font-mono text-lg">
                        <DollarSign size={16} />
                        {sessionCost.toFixed(6)}
                    </div>
                </div>

                <div className="bg-slate-950 p-3 rounded border border-slate-800/50">
                    <p className="text-slate-500 text-[10px] uppercase mb-1">Tokens Procesados</p>
                    <div className="flex items-center text-blue-400 font-mono text-lg">
                        <Zap size={16} className="mr-1" />
                        {sessionTokens.toLocaleString()}
                    </div>
                </div>

                {/* Métricas Históricas */}
                <div className="bg-slate-950 p-3 rounded border border-slate-800/50">
                    <p className="text-slate-500 text-[10px] uppercase mb-1 flex items-center gap-1">
                        <Calendar size={10} /> Gasto Diario
                    </p>
                    <div className="flex items-center text-emerald-500/80 font-mono text-sm">
                        <DollarSign size={14} />
                        {historyLoading ? "..." : dailyCost.toFixed(4)}
                    </div>
                </div>

                <div className="bg-slate-950 p-3 rounded border border-slate-800/50">
                    <p className="text-slate-500 text-[10px] uppercase mb-1 flex items-center gap-1">
                        <History size={10} /> Coste Total (Vida)
                    </p>
                    <div className="flex items-center text-emerald-600 font-mono text-sm">
                        <DollarSign size={14} />
                        {historyLoading ? "..." : totalCost.toFixed(4)}
                    </div>
                </div>
            </div>

            <div className="text-[10px] text-slate-600 font-mono text-right">
                *Calculado localmente vía telemetría de carga
            </div>
        </div>
    );
}
