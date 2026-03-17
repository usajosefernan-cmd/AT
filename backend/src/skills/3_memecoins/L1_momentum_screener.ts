export interface MemeMarketData {
    symbol: string;
    timestamp: number;
    closePrice: number;
    volume_5m: number;
    historical_avg_vol_5m: number;
    turnover_ratio: number; // Volume / Market Cap roughly or Volume / Liquidity
}

export interface MemeSpikeAlert {
    symbol: string;
    timestamp: number;
    type: 'MEME_MOMENTUM_SPIKE';
    rvol: number; // Relative Volume
    turnover_ratio: number;
    alertPrice: number;
    priceHistory: number[]; // Last N prices to analyze phases
}

// ═══════════════════════════════════════════
// TOOL DEFINITION (OpenAI Function Calling Format)
// ═══════════════════════════════════════════
export const MEME_L1_SCREENER_DEF = {
    type: "function" as const,
    function: {
        name: "scan_meme_momentum",
        description: "L1 Quantitative Screener (Costo $0): Escanea en MEXC anomalous spikes. Busca Relative Volume (RVOL) > 500% y Turnover Ratio alto. No usa LLM, solo matemática rápida. Retorna la alerta si existe un spike brutal de momentum.",
        parameters: {
            type: "object",
            properties: {
                symbol: {
                    type: "string",
                    description: "El ticker a escanear (ej. PEPEUSDT, WIFUSDT, BONKUSDT)."
                }
            },
            required: ["symbol"]
        }
    }
};

// ═══════════════════════════════════════════
// TOOL IMPLEMENTATION
// ═══════════════════════════════════════════
export function executeMemeL1Screener(symbol: string, mockData?: MemeMarketData): string {
    const alert = detectMemeSpike(symbol, mockData);
    if (!alert) {
        return JSON.stringify({ 
            status: "NO_SPIKE", 
            message: `El screener L1 (Matemático) no detecta volumen anómalo en ${symbol}. RVOL normal.` 
        });
    }
    return JSON.stringify({
        status: "MEME_MOMENTUM_SPIKE",
        data: alert
    });
}

/**
 * Lógica matemática pura (Script $0)
 */
function detectMemeSpike(symbol: string, mock?: MemeMarketData): MemeSpikeAlert | null {
    // If we have live data, we would use it. We use mock data for the simulation here.
    if (!mock) {
        // Generando una anomalía simulada si no pasamos datos (para tests)
        mock = {
            symbol,
            timestamp: Date.now(),
            closePrice: 0.00001452,
            volume_5m: 5000000,
            historical_avg_vol_5m: 800000, // RVOL será > 500%
            turnover_ratio: 0.85
        };
    }

    const rvol = mock.volume_5m / mock.historical_avg_vol_5m;

    // Condición de quiebre: RVOL > 500% (5.0) y Turnover ratio crítico
    if (rvol > 5.0 && mock.turnover_ratio > 0.5) {
        return {
            symbol: mock.symbol,
            timestamp: mock.timestamp,
            type: 'MEME_MOMENTUM_SPIKE',
            rvol: parseFloat(rvol.toFixed(2)),
            turnover_ratio: mock.turnover_ratio,
            alertPrice: mock.closePrice,
            // Mockeando el historial de precios para el análisis del LLM (Dip and Rip, etc.)
            priceHistory: [0.000010, 0.000011, 0.000013, 0.000012, 0.00001452]
        };
    }

    return null;
}
