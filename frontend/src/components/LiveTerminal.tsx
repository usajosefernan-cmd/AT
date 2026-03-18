import React, { useEffect, useRef, memo } from "react";
import { useStore } from "../store/useStore";
import { Terminal } from "lucide-react";

const levelColor: Record<string, string> = {
    info: "text-[#8a95a7]",
    warn: "text-[#f59e0b]",
    error: "text-[#ef4444]",
    success: "text-[#22c55e]",
};

const agentColor: Record<string, string> = {
    hunter: "text-[#ef4444]",
    sentinel: "text-[#a78bfa]",
    risk: "text-[#f59e0b]",
    ceo: "text-[#38bdf8]",
    system: "text-[#5a6577]",
};

// ⚡ Memoized individual log line
const LogEntry = memo(({ log }: { log: { id: string; agent_id: string; text: string; level: string; timestamp: number } }) => (
    <div className="flex gap-1.5 px-1 py-[1px] rounded hover:bg-[#111622]">
        <span className="text-[#3a4555] flex-shrink-0 w-[50px] tabular-nums">
            {new Date(log.timestamp).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
        <span className={`flex-shrink-0 w-[60px] text-right ${agentColor[log.agent_id] || "text-[#5a6577]"}`}>
            {log.agent_id}
        </span>
        <span className={levelColor[log.level] || "text-[#8a95a7]"}>
            {log.text}
        </span>
    </div>
));

const LiveTerminal: React.FC = memo(() => {
    const agentLogs = useStore((s) => s.agentLogs) || [];
    const scrollRef = useRef<HTMLDivElement>(null);

    // ⚡ Only show last 40 logs (not all 80+ in the buffer)
    const visibleLogs = agentLogs.slice(-40);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [agentLogs.length]);

    return (
        <div className="flex flex-col h-full bg-[#0b0e14] overflow-hidden">
            <div className="flex items-center gap-1.5 px-2 py-1 border-b border-[#1a1f2e] flex-shrink-0">
                <Terminal size={9} className="text-[#22c55e]" />
                <span className="text-[9px] font-semibold text-[#5a6577] uppercase">Agent Stream</span>
                <span className="text-[8px] text-[#3a4555] ml-auto font-mono">{agentLogs.length}</span>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-1.5 py-1 font-mono min-h-0" style={{ fontSize: "9px", lineHeight: "16px" }}>
                {visibleLogs.map((log) => (
                    <LogEntry key={log.id} log={log} />
                ))}
                <span className="text-[#22c55e] animate-pulse">█</span>
            </div>
        </div>
    );
});

export default LiveTerminal;
