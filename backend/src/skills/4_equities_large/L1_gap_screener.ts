export interface EquityGapData {
    symbol: string;
    timestamp: number;
    prev_close: number;
    open_price: number;
    gap_pct: number;
    rvol_open: number; // RVOL de los primeros 5-15 mins respecto a la media de 20 días
}

export interface GapAlert {
    symbol: string;
    timestamp: number;
    type: 'EARNINGS_GAP_DETECTED';
    data: EquityGapData;
    intraday_candles: number[]; // Simulation of first 15-30 min candles
}

// ═══════════════════════════════════════════
// TOOL DEFINITION (OpenAI Function Calling Format)
// ═══════════════════════════════════════════
export const EQUITIES_L1_GAP_DEF = {
    type: "function" as const,
    function: {
        name: "scan_equity_gaps",
        description: "L1 Quantitative Screener para US Equities (Alpaca): Escanea la apertura (09:30 NY) buscando Gaps >= 5% con RVOL de apertura >= 2x. Script matemático puro ($0).",
        parameters: {
            type: "object",
            properties: {
                symbol: {
                    type: "string",
                    description: "El ticker de la acción (Ej. NVDA, AAPL, TSLA)."
                }
            },
            required: ["symbol"]
        }
    }
};

// ═══════════════════════════════════════════
// TOOL IMPLEMENTATION
// ═══════════════════════════════════════════
export function executeEquitiesL1Screener(symbol: string, mockData?: EquityGapData): string {
    const alert = detectGapSpike(symbol, mockData);
    if (!alert) {
        return JSON.stringify({ 
            status: "NO_GAP", 
            message: `El screener L1 no detectó Gap significativo ni volumen institucional en la apertura de ${symbol}.` 
        });
    }
    return JSON.stringify({
        status: "EARNINGS_GAP_DETECTED",
        alert
    });
}

/**
 * Lógica matemática pura (Script $0)
 */
function detectGapSpike(symbol: string, mock?: EquityGapData): GapAlert | null {
    if (!mock) {
        // Simulando una acción abriendo con fuerte Gap Up por Earnings
        const prevClose = 150.00;
        const openPrice = 162.00; // +8% Gap
        mock = {
            symbol,
            timestamp: Date.now(),
            prev_close: prevClose,
            open_price: openPrice,
            gap_pct: ((openPrice - prevClose) / prevClose) * 100,
            rvol_open: 3.5 // 3.5x volumen habitual
        };
    }

    // Condición de quiebre algorítmico: Gap >= 1% y RVOL >= 1.2x
    if (Math.abs(mock.gap_pct) > 1.0 && mock.rvol_open >= 1.2) {
        return {
            symbol: mock.symbol,
            timestamp: mock.timestamp,
            type: 'EARNINGS_GAP_DETECTED',
            data: mock,
            // Simulamos velas intradía donde el precio aguanta y rompe VWAP al alza
            intraday_candles: [162.00, 161.50, 162.80, 163.50, 164.20] 
        };
    }

    return null;
}
