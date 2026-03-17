export class MarketDataCache {
    // Estructuras en memoria para simular Redis en esta fase
    private static volumeHistory: Map<string, number[]> = new Map();
    private static prevClosePrices: Map<string, number> = new Map();

    /**
     * Registra el volumen de una vela nueva
     */
    static addVolume(symbol: string, volume: number) {
        if (!this.volumeHistory.has(symbol)) {
            this.volumeHistory.set(symbol, []);
        }
        const history = this.volumeHistory.get(symbol)!;
        history.push(volume);
        
        // Mantenemos solo las últimas 100 velas para no agotar la memoria
        if (history.length > 100) {
            history.shift();
        }
    }

    /**
     * Obtiene el volumen promedio histórico de los últimos N periodos
     */
    static getAverageVolume(symbol: string, periods: number = 20): number {
        const history = this.volumeHistory.get(symbol);
        if (!history || history.length === 0) return 0.01; // Evitar división por cero

        // Tomamos los últimos 'periods' elementos
        const recentHistory = history.slice(-periods);
        const sum = recentHistory.reduce((acc, val) => acc + val, 0);
        return sum / recentHistory.length;
    }

    /**
     * Registra el precio de cierre del día anterior (para cálculo de Gaps)
     */
    static setPrevClose(symbol: string, price: number) {
        this.prevClosePrices.set(symbol, price);
    }

    /**
     * Obtiene el previo cierre
     */
    static getPrevClose(symbol: string): number {
        return this.prevClosePrices.get(symbol) || 0;
    }

    /**
     * Devuelve una fotografía del mercado (Volumen actual vs media, prev close)
     * Utilizado primariamente por los L3 Directors durante su latido OpenClaw.
     */
    static getSnapshot(): Record<string, any> {
        const snapshot: Record<string, any> = {};
        this.volumeHistory.forEach((history, symbol) => {
            snapshot[symbol] = {
                latestVolume: history.length > 0 ? history[history.length - 1] : 0,
                avgVolume20: this.getAverageVolume(symbol, 20),
                prevClose: this.getPrevClose(symbol)
            };
        });
        return snapshot;
    }
}
