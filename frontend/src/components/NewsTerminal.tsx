import React, { useState, useEffect, useRef } from "react";
import { Rss, ExternalLink, Globe, Zap } from "lucide-react";

interface NewsItem {
    id: string;
    source: string;
    title: string;
    sentiment: "bullish" | "bearish" | "neutral";
    timestamp: number;
    category: "macro" | "crypto" | "equities" | "onchain";
}

// Simulated feed — in production, this would come from a WebSocket/RSS endpoint
const SEED_NEWS: NewsItem[] = [
    { id: "1", source: "Bloomberg", title: "Fed holds rates steady, signals potential cut in Q3", sentiment: "bullish", timestamp: Date.now() - 120000, category: "macro" },
    { id: "2", source: "On-chain", title: "Whale moved 12,400 BTC to exchange — sell pressure?", sentiment: "bearish", timestamp: Date.now() - 300000, category: "onchain" },
    { id: "3", source: "Reuters", title: "TSLA Q1 deliveries beat estimates by 8%", sentiment: "bullish", timestamp: Date.now() - 600000, category: "equities" },
    { id: "4", source: "CoinDesk", title: "ETH staking yield drops to 3.1%, lowest in 2025", sentiment: "bearish", timestamp: Date.now() - 900000, category: "crypto" },
    { id: "5", source: "WSJ", title: "US CPI data release Friday — consensus 2.4%", sentiment: "neutral", timestamp: Date.now() - 1200000, category: "macro" },
    { id: "6", source: "Glassnode", title: "BTC MVRV ratio at 1.8 — historically mid-cycle", sentiment: "neutral", timestamp: Date.now() - 1500000, category: "onchain" },
    { id: "7", source: "X/Crypto", title: "PEPE volume spike 340% on MEXC — memecoin rotation", sentiment: "bullish", timestamp: Date.now() - 1800000, category: "crypto" },
    { id: "8", source: "FT", title: "China stimulus package larger than expected", sentiment: "bullish", timestamp: Date.now() - 2400000, category: "macro" },
];

const sentimentColor: Record<string, string> = {
    bullish: "text-[#22c55e]",
    bearish: "text-[#ef4444]",
    neutral: "text-[#5a6577]",
};

const sentimentBg: Record<string, string> = {
    bullish: "bg-[#22c55e]/10",
    bearish: "bg-[#ef4444]/10",
    neutral: "bg-[#5a6577]/10",
};

const catIcon: Record<string, string> = {
    macro: "🌍",
    crypto: "₿",
    equities: "📊",
    onchain: "⛓",
};

const NewsTerminal: React.FC = () => {
    const [news, setNews] = useState<NewsItem[]>(SEED_NEWS);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 0;
        }
    }, [news]);

    const ago = (ts: number) => {
        const mins = Math.floor((Date.now() - ts) / 60000);
        if (mins < 1) return "now";
        if (mins < 60) return `${mins}m`;
        return `${Math.floor(mins / 60)}h`;
    };

    return (
        <div className="flex flex-col h-full bg-[#0b0e14] border-l border-[#1a1f2e] overflow-hidden">
            <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[#1a1f2e] flex-shrink-0">
                <Rss size={9} className="text-[#f59e0b]" />
                <span className="text-[9px] font-semibold text-[#5a6577] uppercase">News Feed</span>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
                {news.map((item) => (
                    <div key={item.id} className="px-2 py-1.5 border-b border-[#131820] hover:bg-[#111622] transition-colors cursor-pointer">
                        <div className="flex items-start gap-1.5">
                            <span className="text-[8px] flex-shrink-0 mt-0.5">{catIcon[item.category]}</span>
                            <div className="min-w-0">
                                <div className="text-[9px] text-[#c9d1d9] leading-tight line-clamp-2">{item.title}</div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="text-[8px] text-[#3a4555] font-mono">{item.source}</span>
                                    <span className={`text-[8px] font-bold uppercase px-1 rounded ${sentimentBg[item.sentiment]} ${sentimentColor[item.sentiment]}`}>
                                        {item.sentiment.slice(0, 4)}
                                    </span>
                                    <span className="text-[8px] text-[#3a4555] ml-auto">{ago(item.timestamp)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default NewsTerminal;
