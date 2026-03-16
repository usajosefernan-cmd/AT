import React, { useRef, useEffect } from "react";
import { useStore } from "../store/useStore";
import { Radio, ArrowUpRight, ArrowDownRight } from "lucide-react";

const TimeAndSales: React.FC = () => {
    const tape = useStore((s) => s.tape);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [tape]);

    return (
        <div className="flex flex-col h-full bg-[#0b0e14] overflow-hidden">
            <div className="flex items-center gap-1.5 px-2 py-1 border-b border-[#1a1f2e] flex-shrink-0">
                <Radio size={9} className="text-[#f59e0b]" />
                <span className="text-[9px] font-semibold text-[#5a6577] uppercase">T&S</span>
                <span className="text-[8px] text-[#3a4555] ml-auto font-mono">{tape.length}</span>
            </div>
            <div className="flex px-2 py-0.5 text-[7px] text-[#3a4555] uppercase border-b border-[#131820]">
                <span className="w-8">Time</span>
                <span className="flex-1">Sym</span>
                <span className="w-16 text-right">Price</span>
                <span className="w-12 text-right">Size</span>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
                {tape.slice(-80).map((t) => (
                    <div
                        key={t.id}
                        className={`flex items-center px-2 py-[1px] font-mono text-[9px] border-b border-[#0d1117] ${t.side === "buy" ? "bg-[#22c55e]/3" : "bg-[#ef4444]/3"
                            }`}
                    >
                        <span className="w-8 text-[#3a4555] flex-shrink-0 tabular-nums">
                            {new Date(t.timestamp).toLocaleTimeString("en-US", { hour12: false, minute: "2-digit", second: "2-digit" })}
                        </span>
                        <span className="flex-1 text-[#8a95a7] truncate">{t.symbol}</span>
                        <span className={`w-16 text-right font-bold tabular-nums ${t.side === "buy" ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                            {t.price < 1 ? t.price.toFixed(6) : t.price.toFixed(2)}
                        </span>
                        <span className="w-3 flex-shrink-0 ml-0.5">
                            {t.side === "buy" ? <ArrowUpRight size={7} className="text-[#22c55e]" /> : <ArrowDownRight size={7} className="text-[#ef4444]" />}
                        </span>
                        <span className="w-12 text-right text-[#3a4555] tabular-nums">{t.size.toFixed(4)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TimeAndSales;
