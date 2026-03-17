export interface CryptoFlowData {
    symbol: string;
    timestamp: number;
    price: number;
    cvd_1m: number; // Cumulative Volume Delta
    funding_rate: number;
    open_interest_delta: number;
}

export interface FlowAnomalyAlert {
    symbol: string;
    timestamp: number;
    type: 'CRYPTO_FLOW_ANOMALY';
    data: CryptoFlowData;
}

export const CRYPTO_L1_FLOW_DEF = {
    type: "function" as const,
    function: {
        name: "scan_crypto_flows",
        description: "L1 Screener para Cripto Majors (Hyperliquid): Detecta anomalías en el CVD (Cumulative Volume Delta) y flujos institucionales sin usar LLM. Retorna la data anómala si existe divergencia.",
        parameters: {
            type: "object",
            properties: {
                symbol: {
                    type: "string",
                    description: "El ticker del perpetuo (Ej. BTC, ETH)."
                }
            },
            required: ["symbol"]
        }
    }
};

export function executeCryptoL1Screener(symbol: string, liveData?: CryptoFlowData): string {
    const data = liveData || {
        symbol,
        timestamp: Date.now(),
        price: 64500,
        cvd_1m: 1500000, // Alto delta positivo simulado
        funding_rate: 0.015,
        open_interest_delta: 5.2
    };

    // Lógica básica: Si el CVD es agresivo hacia un lado o hay picos de OI
    if (Math.abs(data.cvd_1m) > 10000 || data.open_interest_delta > 1.0) {
        const alert: FlowAnomalyAlert = {
            symbol: data.symbol,
            timestamp: data.timestamp,
            type: 'CRYPTO_FLOW_ANOMALY',
            data: data
        };
        return JSON.stringify({
            status: "CRYPTO_FLOW_ANOMALY",
            data: alert
        });
    }

    return JSON.stringify({
        status: "NO_ANOMALY",
        message: `El flujo de ${symbol} está neutral. Sin anomalías en CVD o OI.`
    });
}
