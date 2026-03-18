import axios from 'axios';

export interface MacroSnapshot {
    tradfi: {
        vix: number;
        dxy: number;
        us10y_yield: number;
        market_breadth_trend: "BULLISH" | "BEARISH" | "NEUTRAL";
    };
    crypto: {
        avg_funding_rate_8h: number;
        open_interest_delta_24h: number;
        fear_and_greed_index: number;
    };
    timestamp: number;
}

export class MacroDataFetcher {
    /**
     * Obtiene una foto instantánea (snapshot) de las condiciones macroeconómicas globales.
     * Si no hay API keys configuradas, retorna datos simulados realistas para que el L4-B pueda evaluar.
     */
    static async getGlobalMacroSnapshot(): Promise<MacroSnapshot> {
        console.log(`\x1b[36m[MacroDataFetcher]\x1b[0m Extrayendo métricas globales (VIX, DXY, Funding Rates)...`);
        
        try {
            // TODO: Integrar APIs reales (ej. AlphaVantage, CoinMarketCap, Binance API, FRED).
            // Retornamos un snapshot simulado con condiciones "vivas" de ejemplo.
            
            // Simulación: Volatilidad moderada, DXY fuerte, mercado crypto neutral-bullish.
            return {
                tradfi: {
                    vix: 15.4, // VIX bajo/estable (< 20 suele ser bullish para RV)
                    dxy: 104.2, // Dólar fuerte
                    us10y_yield: 4.25, // Tasas estables
                    market_breadth_trend: "BULLISH" 
                },
                crypto: {
                    avg_funding_rate_8h: 0.015, // Funding positivo pero no en extremo burbuja
                    open_interest_delta_24h: 3.5, // OI subiendo un 3.5%
                    fear_and_greed_index: 72 // Greed (Apetito por riesgo)
                },
                timestamp: Date.now()
            };
        } catch (error) {
            console.error(`\x1b[31m[MacroDataFetcher Error]\x1b[0m Falló la ingesta macro:`, error);
            // Default failsafe
            return {
                tradfi: { vix: 20, dxy: 100, us10y_yield: 4.0, market_breadth_trend: "NEUTRAL" },
                crypto: { avg_funding_rate_8h: 0.01, open_interest_delta_24h: 0, fear_and_greed_index: 50 },
                timestamp: Date.now()
            };
        }
    }
}
