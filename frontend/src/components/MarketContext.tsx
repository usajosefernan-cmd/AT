import React, { useEffect, useRef, useState } from "react";
import { createChart, IChartApi, ISeriesApi, Time, CandlestickData, HistogramData } from "lightweight-charts";
import { useStore, DESKS, OHLCCandle } from "../store/useStore";
import { BarChart2, Loader2 } from "lucide-react";

export const MarketContext: React.FC = () => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

    const activeDeskId = useStore((s) => s.activeDesk);
    const deskConfig = DESKS.find(d => d.id === activeDeskId) || DESKS[0];
    const latestCandle = useStore((s) => s.latestCandle);
    const latestPrices = useStore((s) => s.marketData);

    const activeSymbol = useStore(s => s.selectedSymbols[activeDeskId]) || (deskConfig.symbols[0] || "BTC");
    const [availableSymbols, setAvailableSymbols] = useState<string[]>(deskConfig.symbols);
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState<OHLCCandle[]>([]);

    const priceData = latestPrices[activeSymbol];

    // Initialize chart
    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { color: "#060a10" },
                textColor: "#c9d1d9",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
            },
            grid: {
                vertLines: { color: "#1a1f2e" },
                horzLines: { color: "#1a1f2e" },
            },
            crosshair: {
                mode: 0,
                vertLine: {
                    width: 1,
                    color: "#4a6cf7",
                    style: 2,
                },
                horzLine: {
                    width: 1,
                    color: "#4a6cf7",
                    style: 2,
                },
            },
            rightPriceScale: {
                borderColor: "#1a1f2e",
                autoScale: true,
            },
            timeScale: {
                borderColor: "#1a1f2e",
                timeVisible: true,
                secondsVisible: false,
            },
        });

        const candlestickSeries = chart.addCandlestickSeries({
            upColor: "#22c55e",
            downColor: "#ef4444",
            borderVisible: false,
            wickUpColor: "#22c55e",
            wickDownColor: "#ef4444",
        });

        const volumeSeries = chart.addHistogramSeries({
            priceFormat: { type: "volume" },
            priceScaleId: "",
        });

        chart.priceScale("").applyOptions({
            scaleMargins: { top: 0.85, bottom: 0 },
        });

        chartRef.current = chart;
        candlestickSeriesRef.current = candlestickSeries;
        volumeSeriesRef.current = volumeSeries;

        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                    height: chartContainerRef.current.clientHeight,
                });
            }
        };

        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
            chart.remove();
        };
    }, []);

    // Fetch dynamic symbols from MarketRadar for this exchange
    useEffect(() => {
        const fetchRadarSymbols = async () => {
            if (deskConfig.exchange === "ALL" || deskConfig.exchange === "") {
                setAvailableSymbols(deskConfig.symbols);
                if (!deskConfig.symbols.includes(activeSymbol)) {
                    useStore.getState().setSelectedSymbol(activeDeskId, deskConfig.symbols[0] || "BTC");
                }
                return;
            }

            try {
                const url = import.meta.env.VITE_API_URL || "http://localhost:8080";
                const res = await fetch(`${url}/api/radar/${deskConfig.exchange}`);
                const data = await res.json();

                if (data.success && data.symbols && data.symbols.length > 0) {
                    setAvailableSymbols(data.symbols);
                    if (!data.symbols.includes(activeSymbol)) {
                        useStore.getState().setSelectedSymbol(activeDeskId, data.symbols[0]);
                    }
                } else {
                    setAvailableSymbols(deskConfig.symbols);
                    if (!deskConfig.symbols.includes(activeSymbol)) {
                        useStore.getState().setSelectedSymbol(activeDeskId, deskConfig.symbols[0] || "BTC");
                    }
                }
            } catch (err) {
                console.error("[MarketContext] Failed to fetch radar symbols:", err);
                setAvailableSymbols(deskConfig.symbols);
            }
        };

        fetchRadarSymbols();
    }, [deskConfig]);

    // Fetch historical data for symbol
    useEffect(() => {
        const fetchHistory = async () => {
            setLoading(true);
            try {
                const url = import.meta.env.VITE_API_URL || "http://localhost:8080";
                const res = await fetch(`${url}/api/history?symbol=${activeSymbol}&exchange=${deskConfig.exchange}`);
                const data = await res.json();
                if (data.success && data.candles) {
                    setHistory(data.candles);
                } else {
                    throw new Error("No historical data available");
                }
            } catch (err) {
                console.error("Historical data fetch failed", err);
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, [activeSymbol, deskConfig.exchange]);

    // Apply historical data to chart
    useEffect(() => {
        if (!candlestickSeriesRef.current || !volumeSeriesRef.current || history.length === 0) return;

        const candleData: CandlestickData[] = history.map(h => ({
            time: Math.floor(h.timestamp / 1000) as Time,
            open: h.open,
            high: h.high,
            low: h.low,
            close: h.close
        }));

        const volData: HistogramData[] = history.map(h => ({
            time: Math.floor(h.timestamp / 1000) as Time,
            value: h.volume,
            color: h.close >= h.open ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"
        }));

        candlestickSeriesRef.current.setData(candleData);
        volumeSeriesRef.current.setData(volData);

        // Auto-fit to screen
        chartRef.current?.timeScale().fitContent();
    }, [history]);

    // Keep real-time track of the latest candle state to avoid timestamp backwards crash
    const lastCandleRef = useRef<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number } | null>(null);

    // Sync ref when history loads
    useEffect(() => {
        if (history.length > 0) {
            lastCandleRef.current = { ...history[history.length - 1] };
        }
    }, [history]);

    // Update with real-time candles from WebSocket
    useEffect(() => {
        if (!latestCandle || !candlestickSeriesRef.current || !volumeSeriesRef.current) return;

        // Ensure the candle belongs to the active symbol
        if (latestCandle.symbol !== activeSymbol) return;

        const t = Math.floor(latestCandle.timestamp / 1000) as Time;
        lastCandleRef.current = {
            timestamp: latestCandle.timestamp,
            open: latestCandle.open,
            high: latestCandle.high,
            low: latestCandle.low,
            close: latestCandle.close,
            volume: latestCandle.volume
        };

        try {
            candlestickSeriesRef.current.update({
                time: t,
                open: latestCandle.open,
                high: latestCandle.high,
                low: latestCandle.low,
                close: latestCandle.close,
            });

            volumeSeriesRef.current.update({
                time: t,
                value: latestCandle.volume,
                color: latestCandle.close >= latestCandle.open ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
            });
        } catch (e) {
            console.error("Candle update error:", e);
        }
    }, [latestCandle, activeSymbol]);

    // Update with real-time TICKS from WebSocket to make chart 100% live
    useEffect(() => {
        if (!priceData || priceData.price === undefined || !candlestickSeriesRef.current || priceData.symbol !== activeSymbol) return;

        const currentPrice = priceData.price;
        let c = lastCandleRef.current;
        
        if (!c) {
            c = { timestamp: Date.now(), open: currentPrice, high: currentPrice, low: currentPrice, close: currentPrice, volume: 0 };
            lastCandleRef.current = c;
        }

        // Ignore ticks that are too old (e.g. from a delayed WS message)
        if (priceData.timestamp < c.timestamp - 60000) return;

        c.high = Math.max(c.high, currentPrice);
        c.low = Math.min(c.low, currentPrice);
        c.close = currentPrice;

        const t = Math.floor(c.timestamp / 1000) as Time;

        try {
            candlestickSeriesRef.current.update({
                time: t,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
            });
        } catch (e) {
            console.error("Tick update error:", e);
        }
    }, [priceData, activeSymbol]);

    return (
        <div className="flex flex-col h-full bg-[#0b0e14] overflow-hidden">
            {/* Chart Toolbar / Header */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1a1f2e] bg-[#060a10] flex-shrink-0">
                <div className="flex items-center gap-3">
                    <BarChart2 size={12} className="text-[#4a6cf7]" />

                    {/* Symbol Selector */}
                    <div className="flex flex-col">
                        <span className="text-[11px] font-black text-white font-mono tracking-tight">{activeSymbol}</span>
                        <span className="text-[7px] text-[#4a6cf7] font-black uppercase tracking-tighter -mt-0.5">Activo Principal</span>
                    </div>

                    <span className="text-[10px] font-mono font-bold text-[#8a95a7]">1m</span>

                    {/* Live Ticket Display */}
                    {priceData && priceData.price !== undefined && (
                        <span className={`text-[11px] font-mono font-bold tabular-nums ml-2 ${priceData.price >= priceData.prevPrice ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                            {priceData.price < 1
                                ? priceData.price.toFixed(6)
                                : `$${(priceData.price || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2 text-[9px] font-mono text-[#5a6577]">
                    {loading && <Loader2 size={10} className="animate-spin text-[#4a6cf7]" />}
                    {!loading && <span className="flex gap-1 items-center"><span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse"></span> LIVE</span>}
                    <span>{deskConfig?.exchange || "N/A"}</span>
                </div>
            </div>

            {/* Lightweight Charts Mount Point */}
            <div ref={chartContainerRef} className="flex-1 w-full relative">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#060a10]/50 z-10 backdrop-blur-[1px]">
                        <Loader2 size={24} className="animate-spin text-[#4a6cf7]" />
                    </div>
                )}
            </div>
        </div>
    );
};

export default MarketContext;
