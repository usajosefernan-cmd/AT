/**
 * TVScreener.ts
 * 
 * Interacts with TradingView's unofficial Screener API to fetch real-time
 * market data across thousands of assets without hitting rate limits.
 */

import { RadarAsset } from "./MarketRadar";

interface TVScanResult {
    totalCount: number;
    data: {
        d: (string | number | null)[]; // Array of column values requested
        s: string; // Symbol (e.g., "NASDAQ:AAPL")
    }[];
}

/**
 * Executes a POST request to a TradingView Scanner endpoint.
 */
async function fetchTVScreener(
    marketUrl: string,
    markets: string[],
    filters: any[],
    columns: string[],
    limit: number = 100
): Promise<TVScanResult | null> {
    try {
        const payload = {
            filter: filters,
            options: { lang: "en" },
            markets: markets,
            symbols: { query: { types: [] }, tickers: [] },
            columns: columns,
            sort: { sortBy: "volume", sortOrder: "desc" },
            range: [0, limit]
        };

        const response = await fetch(marketUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Origin": "https://www.tradingview.com",
                "Referer": "https://www.tradingview.com/"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error(`[TVScreener] Error ${response.status} fetching from ${marketUrl}`);
            return null;
        }

        return await response.json() as TVScanResult;
    } catch (err) {
        console.error(`[TVScreener] Failed to fetch:`, err);
        return null;
    }
}

/**
 * Escanea TODAS las acciones de EE.UU. y devuelve las de mayor volumen/actividad.
 */
export async function getTopUSEquities(limit: number = 150): Promise<RadarAsset[]> {
    // Escáner de acciones USA
    const url = "https://scanner.tradingview.com/america/scan";
    const columns = ["name", "close", "change", "volume", "high", "low"];
    const filters = [
        { left: "type", operation: "in_range", right: ["stock", "dr", "fund"] },
        { left: "volume", operation: "nempty" },
        { left: "close", operation: "nempty" },
        // Pre-filtro: Acciones con más de 1M de volumen y precio mayor a $2
        { left: "volume", operation: "greater", right: 1000000 },
        { left: "close", operation: "greater", right: 2 }
    ];

    const result = await fetchTVScreener(url, ["america"], filters, columns, limit);
    if (!result || !result.data) return [];

    return result.data.map(item => {
        const [name, close, change, volume, high, low] = item.d;
        return {
            symbol: String(name), // "AAPL"
            exchange: "alpaca", // we route US stocks to alpaca
            price: Number(close || 0),
            change_pct_24h: Number(change || 0),
            volume_24h: Number(volume || 0),
            high_24h: Number(high || 0),
            low_24h: Number(low || 0),
            quoteVolume: Number(close || 0) * Number(volume || 0)
        };
    }).filter(a => a.price > 0 && a.volume_24h > 0);
}

/**
 * Escanea acciones Small Caps (Baja capitalización) con anomalías de volumen o gaps.
 * Este es el motor para "cazar" runners y gappers en tiempo real.
 */
export async function getTopSmallCapGappers(limit: number = 50): Promise<RadarAsset[]> {
    const url = "https://scanner.tradingview.com/america/scan";
    const columns = ["name", "close", "change", "volume", "high", "low"];
    const filters = [
        { left: "type", operation: "in_range", right: ["stock", "dr"] },
        // Acciones entre $0.50 y $30
        { left: "close", operation: "in_range", right: [0.5, 30] },
        // Filtro de mercado: Micro/Small Cap (< 2 billones USD)
        { left: "market_cap_basic", operation: "less", right: 2000000000 },
        // Gappers: O han subido más del 4% hoy
        { left: "change", operation: "greater", right: 4 },
        // Volumen relevante para no atrapar basura ilíquida
        { left: "volume", operation: "greater", right: 100000 }
    ];

    // Ordenar por cambio de precio relativo o volumen relativo
    const payload = {
        filter: filters,
        options: { lang: "en" },
        markets: ["america"],
        symbols: { query: { types: [] }, tickers: [] },
        columns: columns,
        sort: { sortBy: "change", sortOrder: "desc" },
        range: [0, limit]
    };

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Mozilla/5.0",
                "Origin": "https://www.tradingview.com",
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) return [];

        const result = await response.json() as TVScanResult;
        if (!result || !result.data) return [];

        return result.data.map(item => {
            const [name, close, change, volume, high, low] = item.d;
            return {
                symbol: String(name),
                exchange: "alpaca", // Equities are traded via Alpaca (virtual for now)
                price: Number(close || 0),
                change_pct_24h: Number(change || 0),
                volume_24h: Number(volume || 0),
                high_24h: Number(high || 0),
                low_24h: Number(low || 0),
                quoteVolume: Number(close || 0) * Number(volume || 0)
            };
        }).filter(a => a.price > 0 && a.volume_24h > 0);
    } catch {
        return [];
    }
}

/**
 * Escanea pares de Forex internacionales.
 */
export async function getTopForexPairs(limit: number = 50): Promise<RadarAsset[]> {
    const url = "https://scanner.tradingview.com/forex/scan";
    const columns = ["name", "close", "change", "volume", "high", "low"];
    const filters = [
        { left: "name", operation: "match", right: "USD|EUR|GBP|JPY|AUD|CAD|CHF|NZD" }, // Major/Minor pairs
        { left: "volume", operation: "nempty" }
    ];

    const result = await fetchTVScreener(url, ["forex"], filters, columns, limit);
    if (!result || !result.data) return [];

    return result.data.map(item => {
        const [name, close, change, volume, high, low] = item.d;
        // Fix syntax inside the array for Forex map
        return {
            symbol: String(name), // "EURUSD"
            exchange: "axi",
            price: Number(close || 0),
            change_pct_24h: Number(change || 0),
            volume_24h: Number(volume || 0),
            high_24h: Number(high || 0),
            low_24h: Number(low || 0),
            quoteVolume: Number(volume || 0) // Forex volume is tricky but TV provides a relative number
        };
    }).filter(a => a.price > 0);
}
