export interface Candle {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    vwap?: number;
}
  
export interface AnomalyAlert {
    asset: string;
    timestamp: number;
    divergenceType: 'VWAP_ZSCORE' | 'MOMENTUM_EXTREME';
    severity: number;
    triggerPrice: number;
    rawData: Candle[];
}

// ═══════════════════════════════════════════
// TOOL DEFINITION (OpenAI Function Calling Format)
// ═══════════════════════════════════════════
export const AXI_L1_MACRO_DEF = {
    type: "function" as const,
    function: {
        name: "scan_axi_anomalies",
        description: "El Sabueso (Costo $0): Escanea el mercado Forex/Axi buscando anomalías estadísticas severas (VWAP Z-Score) sin usar LLM. Retorna datos de la anomalía si existe, o null si el mercado está normal. Úsalo como primer filtro en el ecosistema 1_axi_forex.",
        parameters: {
            type: "object",
            properties: {
                asset: {
                    type: "string",
                    description: "El activo a escanear (ej. EURUSD, GBPJPY)."
                },
                // En un entorno real, las velas se sacarían de la base de datos o feed en memoria.
                // Aquí permitimos pasar un limitador de velas.
                limit: {
                    type: "number",
                    description: "Cantidad de velas a evaluar (default: 100)."
                }
            },
            required: ["asset"]
        }
    }
};

// ═══════════════════════════════════════════
// TOOL IMPLEMENTATION
// ═══════════════════════════════════════════
export function executeAxiL1Screener(asset: string, candles: Candle[]): string {
    const anomaly = detectAnomalies(candles, asset);
    if (!anomaly) {
        return JSON.stringify({ 
            status: "NO_ANOMALY", 
            message: `Mercado asintótico para ${asset}. El Sabueso no detecta desviaciones severas. Continúa durmiendo.` 
        });
    }
    return JSON.stringify({
        status: "ANOMALY_DETECTED",
        data: anomaly
    });
}

/**
 * Lógica core matemática (No usa LLM)
 */
function detectAnomalies(candles: Candle[], asset: string): AnomalyAlert | null {
    if (!candles || candles.length < 10) return null;
  
    const latest = candles[candles.length - 1];
    let cumulativeVolume = 0;
    let cumulativeVolumePrice = 0;
  
    for (const c of candles) {
        const typicalPrice = (c.high + c.low + c.close) / 3;
        cumulativeVolume += c.volume;
        cumulativeVolumePrice += typicalPrice * c.volume;
    }
  
    const vwap = cumulativeVolume > 0 ? cumulativeVolumePrice / cumulativeVolume : latest.close;
    const deviation = Math.abs(latest.close - vwap);
  
    const meanClose = candles.reduce((sum, c) => sum + c.close, 0) / candles.length;
    const variance = candles.reduce((sum, c) => sum + Math.pow(c.close - meanClose, 2), 0) / candles.length;
    const stdDev = Math.sqrt(variance);
  
    if (stdDev === 0) return null;
  
    const zScore = deviation / stdDev;
  
    if (zScore > 2.0) {
        return {
            asset,
            timestamp: Date.now(),
            divergenceType: 'VWAP_ZSCORE',
            severity: Math.min(10, zScore * 2.5),
            triggerPrice: latest.close,
            rawData: candles.slice(-10)
        };
    }
  
    return null;
}
