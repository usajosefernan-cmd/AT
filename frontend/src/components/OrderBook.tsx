import React from "react";
import { useStore } from "../store/useStore";
import { BookOpen } from "lucide-react";

const OrderBook: React.FC = () => {
    const orderBook = useStore((s) => s.orderBook) || { bids: [], asks: [], symbol: "" };
    const latestPrices = useStore((s) => s.marketData) || {};

    // If no real L2 data yet, generate synthetic levels from latest price
    const primarySymbol = Object.keys(latestPrices)[0];
    const basePrice = primarySymbol ? (latestPrices[primarySymbol]?.price || 70000) : 70000;

    const bids = orderBook.bids && orderBook.bids.length > 0
        ? orderBook.bids.slice(0, 15)
        : Array.from({ length: 15 }, (_, i) => {
            const price = basePrice - (i + 1) * (basePrice * 0.0002);
            const size = Math.random() * 5 + 0.1;
            return { price, size, total: size * (i + 1) * 0.3 };
        });

    const asks = orderBook.asks && orderBook.asks.length > 0
        ? orderBook.asks.slice(0, 15)
        : Array.from({ length: 15 }, (_, i) => {
            const price = basePrice + (i + 1) * (basePrice * 0.0002);
            const size = Math.random() * 5 + 0.1;
            return { price, size, total: size * (i + 1) * 0.3 };
        });

    const maxBidTotal = Math.max(...bids.map((b) => b.total));
    const maxAskTotal = Math.max(...asks.map((a) => a.total));

    return (
        <div className="flex flex-col h-full bg-[#0b0e14] overflow-hidden">
            <div className="flex items-center gap-1.5 px-2 py-1 border-b border-[#1a1f2e] flex-shrink-0">
                <BookOpen size={9} className="text-[#f59e0b]" />
                <span className="text-[9px] font-semibold text-[#5a6577] uppercase">L2 Depth</span>
                <span className="ml-auto text-[8px] text-[#3a4555] font-mono">{primarySymbol || "—"}</span>
            </div>

            {/* Headers */}
            <div className="flex px-2 py-0.5 text-[7px] text-[#3a4555] uppercase border-b border-[#131820]">
                <span className="flex-1">Price</span>
                <span className="w-14 text-right">Size</span>
                <span className="w-14 text-right">Total</span>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                {/* Asks (reversed — lowest ask at bottom) */}
                <div className="flex-1 flex flex-col justify-end overflow-hidden">
                    {asks.slice().reverse().map((a, i) => (
                        <div key={`a${i}`} className="relative flex items-center px-2 py-[1px] font-mono text-[9px]">
                            <div className="absolute inset-y-0 right-0 bg-[#ef4444]/8 transition-all" style={{ width: `${(a.total / maxAskTotal) * 100}%` }} />
                            <span className="relative flex-1 text-[#ef4444] tabular-nums">{a.price.toFixed(2)}</span>
                            <span className="relative w-14 text-right text-[#8a95a7] tabular-nums">{a.size.toFixed(4)}</span>
                            <span className="relative w-14 text-right text-[#5a6577] tabular-nums">{a.total.toFixed(2)}</span>
                        </div>
                    ))}
                </div>

                {/* Spread */}
                <div className="flex items-center justify-center py-1 border-y border-[#1a1f2e]">
                    <span className="text-[10px] font-mono font-bold text-white tabular-nums">
                        ${(basePrice || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {asks.length > 0 && bids.length > 0 && (
                        <span className="text-[8px] text-[#3a4555] ml-2 font-mono">
                            spr: {(asks[0].price - bids[0].price).toFixed(2)}
                        </span>
                    )}
                </div>

                {/* Bids */}
                <div className="flex-1 overflow-hidden">
                    {bids.map((b, i) => (
                        <div key={`b${i}`} className="relative flex items-center px-2 py-[1px] font-mono text-[9px]">
                            <div className="absolute inset-y-0 right-0 bg-[#22c55e]/8 transition-all" style={{ width: `${(b.total / maxBidTotal) * 100}%` }} />
                            <span className="relative flex-1 text-[#22c55e] tabular-nums">{b.price.toFixed(2)}</span>
                            <span className="relative w-14 text-right text-[#8a95a7] tabular-nums">{b.size.toFixed(4)}</span>
                            <span className="relative w-14 text-right text-[#5a6577] tabular-nums">{b.total.toFixed(2)}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default OrderBook;
