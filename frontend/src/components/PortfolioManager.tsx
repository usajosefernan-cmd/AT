import React, { useState, memo } from "react";
import { useStore, PaperPosition, getSocket } from "../store/useStore";
import {
    Table,
    X,
    TrendingUp,
    TrendingDown,
    DollarSign,
    ArrowUpRight,
    ArrowDownRight,
    Search,
    Filter,
    ShieldCheck,
    Info
} from "lucide-react";

const PortfolioManager: React.FC = () => {
    const positions = useStore((s) => s.activePositions) || [];
    const account = useStore((s) => s.account);
    const equityCurve = useStore((s) => s.equityCurve);
    // ⚡ REMOVED: latestPrices subscription was causing re-renders on every tick
    // If live prices are needed here, use a granular per-symbol selector instead

    const [infoModal, setInfoModal] = useState<PaperPosition | null>(null);

    const handleClose = (symbol: string) => {
        const socket = getSocket();
        if (socket) {
            socket.emit('force_close', { symbol });
        } else {
            console.error("Socket not connected");
        }
    };

    // Equity curve mini-viz
    const curveWidth = 240;
    const curveHeight = 40;
    const safeEquityCurve = equityCurve && equityCurve.length > 0 ? equityCurve : [{ equity: account?.equity || 10000 }];
    const currentEquity = account?.equity || 10000;
    const minEq = Math.min(...safeEquityCurve.map((p) => p.equity || 0), currentEquity);
    const maxEq = Math.max(...safeEquityCurve.map((p) => p.equity || 0), currentEquity);
    const range = maxEq - minEq || 1;
    const points = safeEquityCurve.map((p, i) => {
        const x = (i / Math.max(safeEquityCurve.length - 1, 1)) * curveWidth;
        const y = curveHeight - (((p.equity || 0) - minEq) / range) * curveHeight;
        return `${x},${y}`;
    }).join(" ");
    const totalUnrealizedPnl = positions.reduce((acc, p) => acc + (p.unrealizedPnl || 0), 0);
    const sessionTotalPnl = (account?.totalPnl || 0) + totalUnrealizedPnl;
    const isPnlPositive = sessionTotalPnl >= 0;
    const curveColor = isPnlPositive ? "#22c55e" : "#ef4444";

    return (
        <div className="h-full flex flex-col bg-[#0b0e14]">
            {/* Upper Control Bar */}
            <div className="flex-shrink-0 border-b border-[#1a1f2e] bg-[#0d1117]">
                <div className="h-11 flex items-center justify-between px-4 border-b border-[#131820]/40">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <Table size={14} className="text-[#4a6cf7]" />
                            <h2 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Exposición Activa</h2>
                            <div className="bg-[#4a6cf7]/10 text-[#4a6cf7] px-2 py-0.5 rounded text-[9px] font-bold border border-[#4a6cf7]/20">
                                {positions.length} POS
                            </div>
                        </div>
                    </div>

                    {/* Tiny Equity Chart */}
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col items-end">
                            <span className="text-[7px] text-[#3a4555] font-black uppercase tracking-widest">Trayectoria de Equidad</span>
                        </div>
                        <div className="relative group cursor-crosshair">
                            <svg width={180} height={30} className="opacity-60 group-hover:opacity-100 transition-opacity">
                                <defs>
                                    <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={curveColor} stopOpacity="0.2" />
                                        <stop offset="100%" stopColor={curveColor} stopOpacity="0" />
                                    </linearGradient>
                                </defs>
                                <path d={`M 0 30 L ${points} L 180 30 Z`} fill="url(#curveGradient)" />
                                <polyline points={points} fill="none" stroke={curveColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Executive Summary Cards (Intuitive Layer) */}
                <div className="grid grid-cols-4 gap-px bg-[#1a1f2e]">
                    <div className="bg-[#0b0e14] p-3 flex flex-col gap-1">
                        <span className="text-[8px] font-black text-[#5a6577] uppercase tracking-widest">Sesgo del Swarm</span>
                        <div className="flex items-center gap-3">
                            <div className="flex-1 h-2 bg-[#1a1f2e] rounded-full overflow-hidden flex">
                                <div className="h-full bg-[#22c55e]" style={{ width: `${(positions.filter(p => p.side === 'LONG').length / (positions.length || 1)) * 100}%` }} />
                                <div className="h-full bg-[#ef4444]" style={{ width: `${(positions.filter(p => p.side === 'SHORT').length / (positions.length || 1)) * 100}%` }} />
                            </div>
                            <span className="text-[10px] font-mono text-white">
                                {positions.filter(p => p.side === 'LONG').length}L / {positions.filter(p => p.side === 'SHORT').length}S
                            </span>
                        </div>
                    </div>
                    <div className="bg-[#0b0e14] p-3 flex flex-col gap-1">
                        <span className="text-[8px] font-black text-[#5a6577] uppercase tracking-widest">Exposición Total</span>
                        <div className="flex items-center gap-2">
                             <DollarSign size={10} className="text-[#4a6cf7]" />
                             <span className="text-[10px] font-mono text-white tracking-widest">
                                ${positions.reduce((acc, p) => acc + (p.notionalValue || 0), 0).toLocaleString()}
                             </span>
                        </div>
                    </div>
                    <div className="bg-[#0b0e14] p-3 flex flex-col gap-1">
                        <span className="text-[8px] font-black text-[#5a6577] uppercase tracking-widest">Drawdown Diario</span>
                        <div className="flex items-center gap-2">
                             <div className={`w-1.5 h-1.5 rounded-full ${account?.dailyDrawdown < 3 ? 'bg-[#22c55e]' : 'bg-[#ef4444]'}`} />
                             <span className="text-[10px] font-mono text-[#f59e0b]">{account?.dailyDrawdown?.toFixed(2) || '0.00'}%</span>
                             <span className="text-[8px] text-[#3a4555]">MAX: {account?.maxDrawdown?.toFixed(1)}%</span>
                        </div>
                    </div>
                    <div className="bg-[#0b0e14] p-3 flex flex-col gap-1">
                        <span className="text-[8px] font-black text-[#5a6577] uppercase tracking-widest">U-PnL Sesión</span>
                        <div className={`text-[12px] font-black tabular-nums ${totalUnrealizedPnl >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                            {totalUnrealizedPnl >= 0 ? '▲' : '▼'} ${Math.abs(totalUnrealizedPnl).toFixed(2)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Position Surface */}
            <div className="flex-1 overflow-auto min-h-0 bg-[#060a10]">
                <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead className="sticky top-0 bg-[#0d1117] z-20 shadow-xl">
                        <tr className="border-b border-[#1a1f2e] text-[#5a6577] uppercase text-[9px] font-black tracking-widest">
                            <th className="px-4 py-3">Exchange / Activo</th>
                            <th className="px-4 py-3 text-center">Lado</th>
                            <th className="px-4 py-3 text-center">Agente</th>
                            <th className="px-4 py-3 text-right">Tamaño (Notional)</th>
                            <th className="px-4 py-3 text-right">Apala.</th>
                            <th className="px-4 py-3 text-right">Entrada</th>
                            <th className="px-4 py-3 text-right">Stop Loss / Take Profit</th>
                            <th className="px-4 py-3 text-right">U-PnL (%)</th>
                            <th className="px-4 py-3 text-right">PnL ($)</th>
                            <th className="px-4 py-3 text-center">Ejecución</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#131820]">
                        {(!positions || positions.length === 0) ? (
                            <tr>
                                <td colSpan={9} className="py-12 text-center">
                                    <div className="flex flex-col items-center gap-3 opacity-20">
                                        <Filter size={32} />
                                        <span className="text-[10px] font-black uppercase tracking-[0.3em]">No hay posiciones activas</span>
                                        <span className="text-[9px] font-mono">El enjambre neural está escaneando los mercados...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            positions.map((pos) => {
                                const live = pos.entryPrice; // Live PnL comes from paper_pnl socket updates
                                const isProfit = pos.unrealizedPnl >= 0;
                                return (
                                    <tr key={pos.id} className="group hover:bg-[#111622] transition-colors duration-150">
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-white font-black text-sm tracking-tight">{pos.symbol}</span>
                                                    <span className="bg-[#1a1f2e] text-[#8a95a7] px-1.5 py-0.5 rounded text-[8px] font-bold border border-[#1a1f2e]">PERP</span>
                                                </div>
                                                <span className="text-[9px] text-[#4a6cf7] font-bold uppercase mt-0.5">{pos.exchange}</span>
                                                {pos.rationale && (
                                                    <div className="mt-1 max-w-[180px]">
                                                        <p className="text-[8px] text-[#5a6577] line-clamp-1 italic group-hover:text-[#8a95a7] transition-colors">
                                                            "{pos.rationale}"
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="inline-flex items-center justify-center">
                                                <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${pos.side === 'LONG'
                                                    ? 'bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/30'
                                                    : 'bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/30'
                                                    }`}>
                                                    {pos.side}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="text-[9px] font-black text-[#8a95a7] uppercase tracking-widest">
                                                {pos.openedBy === 'memecoin_sniper' ? 'SNIPER' : 
                                                 pos.openedBy === 'crypto_perp' ? 'PERP' : 
                                                 pos.openedBy === 'equities_analyst' ? 'TRAD FREE' : 
                                                 pos.openedBy === 'forex_macro' ? 'AXI SELECT' : 
                                                 pos.openedBy === 'ceo' ? 'CEO' : 'SCANNER'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-[11px] text-white">
                                            ${pos.notionalValue?.toLocaleString() || '0'}
                                        </td>
                                        <td className="px-4 py-3 text-right text-[10px] font-mono text-[#8a95a7]">
                                            {pos.leverage || 1}x
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-[11px] text-[#8a95a7]">
                                            ${(pos.entryPrice || 0).toFixed((pos.entryPrice || 0) < 1 ? 6 : 2)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-[10px] space-y-0.5">
                                            <div className="text-[#ef4444]">SL: ${pos.stopLoss?.toFixed(pos.stopLoss < 1 ? 6 : 2) || '---'}</div>
                                            <div className="text-[#22c55e]">TP: ${pos.takeProfit?.toFixed(pos.takeProfit < 1 ? 6 : 2) || '---'}</div>
                                            {pos.trailingStop?.active && (
                                                <div className="text-[#4a6cf7] text-[8px] font-black uppercase tracking-tighter animate-pulse">
                                                    Trailing: {pos.trailingStop.callbackPct}%
                                                </div>
                                            )}
                                        </td>
                                        <td className={`px-4 py-3 text-right font-mono text-[11px] font-bold ${isProfit ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                                            <div className="flex items-center justify-end gap-1">
                                                {isProfit ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                                                {isProfit ? '+' : ''}{pos.unrealizedPnlPct?.toFixed(2)}%
                                            </div>
                                        </td>
                                        <td className={`px-4 py-3 text-right font-mono text-[11px] font-bold ${isProfit ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                                            {isProfit ? '+' : ''}{pos?.unrealizedPnl?.toFixed(2) || '0.00'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button
                                                    onClick={() => setInfoModal(pos)}
                                                    className="px-2 py-1 bg-[#4a6cf7]/10 text-[#4a6cf7] border border-[#4a6cf7]/20 rounded text-[9px] font-black hover:bg-[#4a6cf7] hover:text-white transition-all uppercase flex items-center gap-1"
                                                >
                                                    <Info size={10} /> INFO
                                                </button>
                                                <button
                                                    onClick={() => handleClose(pos.symbol)}
                                                    className="px-2 py-1 bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/20 rounded text-[9px] font-black hover:bg-[#ef4444] hover:text-white transition-all uppercase flex items-center gap-1"
                                                >
                                                    <X size={10} /> CERRAR
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Footer Summary */}
            <div className="h-8 bg-[#0b0e14] border-t border-[#131820] flex items-center px-4 justify-between flex-shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1 text-[9px] text-[#5a6577] font-mono">
                        <ShieldCheck size={10} className="text-[#22c55e]" />
                        PROTECCIÓN ACTIVA: AUTOMATIZACIÓN SL/TP ACTIVADA
                    </div>
                </div>
                <div className="flex items-center gap-4 text-[11px] font-mono">
                    <span className="text-[#3a4555]">BALANCE CASH: <span className="text-white">${account?.balance?.toLocaleString() || '0'}</span></span>
                    <span className="text-[#3a4555]">PNL TOTAL (SESSION): <span className={isPnlPositive ? 'text-[#22c55e]' : 'text-[#ef4444]'}>
                        {isPnlPositive ? '+' : ''}{sessionTotalPnl?.toFixed(2) || '0.00'}
                    </span></span>
                </div>
            </div>

            {/* Info Modal */}
            {infoModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-[#0b0e14] border border-[#1a1f2e] rounded-xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] animate-slide-in">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a1f2e] bg-[#0d1117] rounded-t-xl">
                            <div className="flex items-center gap-3 text-[#4a6cf7]">
                                <div className="p-1.5 bg-[#4a6cf7]/10 rounded border border-[#4a6cf7]/20">
                                    <ShieldCheck size={16} />
                                </div>
                                <div>
                                    <h3 className="font-black text-xs uppercase tracking-[0.2em] text-white leading-none">Detalles del Trade: {infoModal.symbol}</h3>
                                    <span className="text-[9px] text-[#5a6577] font-mono uppercase">Lógica de Ejecución y Gestión de Riesgo</span>
                                </div>
                            </div>
                            <button onClick={() => setInfoModal(null)} className="text-[#5a6577] hover:text-white p-2 rounded-lg hover:bg-[#1a1f2e] transition-colors">
                                <X size={16} />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#0b0e14]">
                            {/* Technicals Grid */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-[#0d1117] border border-[#1a1f2e] p-3 rounded-lg">
                                    <span className="text-[8px] text-[#5a6577] font-black uppercase block mb-1">Precio Entrada</span>
                                    <span className="text-white font-mono text-sm">${infoModal.entryPrice.toLocaleString()}</span>
                                </div>
                                <div className="bg-[#0d1117] border border-[#1a1f2e] p-3 rounded-lg text-center">
                                    <span className="text-[8px] text-[#5a6577] font-black uppercase block mb-1">Dirección</span>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${infoModal.side === 'LONG' ? 'bg-[#22c55e]/10 text-[#22c55e]' : 'bg-[#ef4444]/10 text-[#ef4444]'}`}>
                                        {infoModal.side}
                                    </span>
                                </div>
                                <div className="bg-[#0d1117] border border-[#1a1f2e] p-3 rounded-lg text-right">
                                    <span className="text-[8px] text-[#5a6577] font-black uppercase block mb-1">Apalancamiento</span>
                                    <span className="text-[#4a6cf7] font-mono text-sm">{infoModal.leverage}x</span>
                                </div>
                            </div>

                            {/* Risk Setup */}
                            <div className="bg-[#0d1117] border border-[#1a1f2e] rounded-lg overflow-hidden">
                                <div className="px-4 py-2 border-b border-[#131820] bg-[#111622] flex items-center justify-between">
                                    <span className="text-[9px] font-black text-[#8a95a7] uppercase tracking-widest">Configuración de Riesgo</span>
                                    {infoModal.trailingStop?.active && (
                                        <span className="text-[8px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded font-black border border-blue-500/20 animate-pulse">TRAILING ACTIVE</span>
                                    )}
                                </div>
                                <div className="p-4 grid grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div>
                                            <span className="text-[8px] text-[#5a6577] font-black uppercase block mb-1">Stop Loss</span>
                                            <span className="text-[#ef4444] font-mono text-sm tracking-tight">
                                                ${infoModal.stopLoss?.toFixed(2) || 'NONE'}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-[8px] text-[#5a6577] font-black uppercase block mb-1">Take Profit</span>
                                            <span className="text-[#22c55e] font-mono text-sm tracking-tight">
                                                ${infoModal.takeProfit?.toFixed(2) || 'NONE'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="border-l border-[#1a1f2e] pl-6 space-y-4">
                                        <div>
                                            <span className="text-[8px] text-[#5a6577] font-black uppercase block mb-1">Trailing Percent</span>
                                            <span className="text-[#4a6cf7] font-mono text-sm tracking-tight">
                                                {infoModal.trailingStop?.callbackPct ? `${infoModal.trailingStop.callbackPct}%` : 'OFF'}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-[8px] text-[#5a6577] font-black uppercase block mb-1">Ejecutado por Agent</span>
                                            <span className="text-white font-mono text-[10px] uppercase truncate block">
                                                {infoModal.openedBy}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Rationale Section */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <div className="h-[1px] flex-1 bg-gradient-to-r from-[#4a6cf7]/50 to-transparent"></div>
                                    <span className="text-[10px] font-black text-[#4a6cf7] uppercase tracking-[0.2em] whitespace-nowrap">Auditoría de IA</span>
                                    <div className="h-[1px] flex-1 bg-gradient-to-l from-[#4a6cf7]/50 to-transparent"></div>
                                </div>
                                <div className="bg-[#0d1117] border border-[#1a1f2e] p-6 rounded-xl shadow-inner relative overflow-hidden group">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-[#4a6cf7]"></div>
                                    <p className="font-mono text-[12px] text-[#e6edf3] leading-[1.8] whitespace-pre-wrap">
                                        {infoModal.rationale || "Sin detalles adicionales del razonamiento."}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default memo(PortfolioManager);
