import React, { useState } from "react";
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
    const latestPrices = useStore((s) => s.marketData);

    const [infoModal, setInfoModal] = useState<string | null>(null);

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
    const isPnlPositive = (account?.totalPnl || 0) >= 0;
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
                             <span className="text-[8px] text-[#3a4555]">MAX: 5%</span>
                        </div>
                    </div>
                    <div className="bg-[#0b0e14] p-3 flex flex-col gap-1">
                        <span className="text-[8px] font-black text-[#5a6577] uppercase tracking-widest">U-PnL Sesión</span>
                        <div className={`text-[12px] font-black tabular-nums ${isPnlPositive ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                            {isPnlPositive ? '▲' : '▼'} ${Math.abs(account?.totalPnl || 0).toFixed(2)}
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
                            <th className="px-4 py-3 text-right">Mercado</th>
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
                                const live = latestPrices[pos.symbol]?.price || pos.entryPrice;
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
                                                 pos.openedBy === 'equities_analyst' ? 'EQUITY' : 
                                                 pos.openedBy === 'forex_macro' ? 'FOREX' : 
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
                                        <td className="px-4 py-3 text-right font-mono text-[11px] text-white">
                                            ${(live || 0).toFixed((live || 0) < 1 ? 6 : 2)}
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
                                                    onClick={() => setInfoModal(pos.rationale || "No hay justificación registrada para esta operación.")}
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
                    <span className="text-[#3a4555]">PNL TOTAL: <span className={isPnlPositive ? 'text-[#22c55e]' : 'text-[#ef4444]'}>
                        {isPnlPositive ? '+' : ''}{account?.totalPnl?.toFixed(2) || '0.00'}
                    </span></span>
                </div>
            </div>

            {/* Info Modal */}
            {infoModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-[#0b0e14] border border-[#1a1f2e] rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[80vh] animate-slide-in">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a1f2e] bg-[#0d1117] rounded-t-xl">
                            <div className="flex items-center gap-3 text-[#4a6cf7]">
                                <div className="p-1.5 bg-[#4a6cf7]/10 rounded border border-[#4a6cf7]/20">
                                    <Info size={16} />
                                </div>
                                <div>
                                    <h3 className="font-black text-sm uppercase tracking-widest text-white leading-none">Justificación de Ejecución IA</h3>
                                    <span className="text-[10px] text-[#5a6577] font-mono">Análisis profundo capturado de la lógica del Enjambre</span>
                                </div>
                            </div>
                            <button onClick={() => setInfoModal(null)} className="text-[#5a6577] hover:text-white p-2 rounded-lg hover:bg-[#1a1f2e] transition-colors">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto font-mono text-[11px] text-[#c9d1d9] leading-relaxed whitespace-pre-wrap selection:bg-[#4a6cf7]/30 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGQ9Ik0wIDBoNDB2NDBIMHoiIGZpbGw9Im5vbmUiLz4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsIDI1NSwgMjU1LCAwLjAzKSIvPgo8L3N2Zz4=')]">
                            {infoModal.split('\n').map((line, i) => (
                                <React.Fragment key={i}>
                                    {line}<br />
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PortfolioManager;
