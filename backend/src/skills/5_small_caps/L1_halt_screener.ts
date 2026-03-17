export interface HaltSpikeData {
    symbol: string;
    timestamp: number;
    price: number;
    halt_type: 'LULD_UP' | 'LULD_DOWN' | 'NEWS_PENDING';
    float_size: number;
    rvol: number; // Volume relative to 10-day average
}

export interface SmallCapAlert {
    symbol: string;
    timestamp: number;
    type: 'SMALL_CAP_HALT_DETECTED';
    data: HaltSpikeData;
    tape_velocity: number; // Trades per second just before the halt
}

// ═══════════════════════════════════════════
// TOOL DEFINITION (OpenAI Function Calling Format)
// ═══════════════════════════════════════════
export const SMALL_CAPS_L1_HALT_DEF = {
    type: "function" as const,
    function: {
        name: "scan_small_cap_halts",
        description: "L1 Quantitative Screener para US Small Caps (Alpaca): Escanea la cinta buscando paradas LULD (Limit Up Limit Down) debidas a volatilidad extrema en acciones de bajo flotante (Low Float). Script puro ($0).",
        parameters: {
            type: "object",
            properties: {
                symbol: {
                    type: "string",
                    description: "El ticker de la acción Small Cap (Ej. GME, AMC, HOLO)."
                }
            },
            required: ["symbol"]
        }
    }
};

// ═══════════════════════════════════════════
// TOOL IMPLEMENTATION
// ═══════════════════════════════════════════
export function executeSmallCapsL1Screener(symbol: string, mockData?: HaltSpikeData): string {
    const alert = detectHaltSpike(symbol, mockData);
    if (!alert) {
        return JSON.stringify({ 
            status: "NO_HALT", 
            message: `El screener L1 no detectó actividad anómala ni paradas LULD recientes en ${symbol}.` 
        });
    }
    return JSON.stringify({
        status: "SMALL_CAP_HALT_DETECTED",
        alert
    });
}

/**
 * Lógica matemática pura (Script $0)
 */
function detectHaltSpike(symbol: string, mock?: HaltSpikeData): SmallCapAlert | null {
    if (!mock) {
        // Simulando una acción Small Cap que experimenta un Short Squeeze y es parada (Halted)
        mock = {
            symbol,
            timestamp: Date.now(),
            price: 7.50,
            halt_type: 'LULD_UP', // Limit Up (parada por subida excesiva)
            float_size: 2500000, // 2.5 Millones de acciones (Low Float extremo)
            rvol: 15.0 // 15x volumen habitual
        };
    }

    // Condición de quiebre algorítmico súper sensible
    if (mock.rvol > 1.5 || (mock as any).relative_volume > 1.5) {
        return {
            symbol: mock.symbol,
            timestamp: mock.timestamp,
            type: 'SMALL_CAP_HALT_DETECTED',
            data: mock,
            // Simulamos una velocidad de cinta brutal antes del Halt (150 ejecuciones por segundo)
            tape_velocity: 150 
        };
    }

    return null;
}
