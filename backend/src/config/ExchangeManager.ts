/**
 * ExchangeManager.ts
 * 
 * Configuración operativa real de cada exchange autorizado.
 * Reglas: Hyperliquid (cripto principal), MEXC (memecoins), Alpaca (acciones), Axi Select (forex/prop).
 * NINGÚN OTRO EXCHANGE.
 */

export interface ExchangePairConfig {
    symbol: string;
    minOrderSize: number;      // Tamaño mínimo de orden (en unidades del activo)
    maxOrderSize: number;      // Tamaño máximo de orden por trade
    stepSize: number;          // Incremento mínimo (lot step)
    pricePrecision: number;    // Decimales del precio
    quantityPrecision: number; // Decimales de la cantidad
    makerFee: number;          // Comisión maker (%)
    takerFee: number;          // Comisión taker (%)
}

export interface ExchangeConfig {
    id: string;
    name: string;
    type: "CRYPTO_PERPS" | "CRYPTO_SPOT" | "EQUITIES" | "FOREX_PROP";
    enabled: boolean;
    maxLeverage: number;
    defaultLeverage: number;
    crossMargin: boolean;

    // Horario de operación (UTC)
    marketHours: {
        alwaysOpen: boolean;
        openHourUTC?: number;
        closeHourUTC?: number;
        tradingDays?: number[];   // 0=Dom, 1=Lun, ... 5=Vie
    };

    pairs: ExchangePairConfig[];

    // Limits globales del exchange
    maxDailyTrades: number;
    maxOpenPositions: number;
    maxNotionalPerTrade: number;  // Máximo USD por trade
}

// ═══════════════════════════════════════════
// HYPERLIQUID — Cripto Principal (Perpetuals)
// Cross-margin, alto apalancamiento, mercado 24/7
// ═══════════════════════════════════════════
export const HYPERLIQUID_CONFIG: ExchangeConfig = {
    id: "hyperliquid",
    name: "Hyperliquid",
    type: "CRYPTO_PERPS",
    enabled: true,
    maxLeverage: 50,
    defaultLeverage: 5,
    crossMargin: true,

    marketHours: {
        alwaysOpen: true,  // Cripto: 24/7/365
    },

    pairs: [
        { symbol: "BTC", minOrderSize: 0.0001, maxOrderSize: 10, stepSize: 0.0001, pricePrecision: 1, quantityPrecision: 5, makerFee: 0.0001, takerFee: 0.0003 },
        { symbol: "ETH", minOrderSize: 0.001, maxOrderSize: 100, stepSize: 0.001, pricePrecision: 2, quantityPrecision: 4, makerFee: 0.0001, takerFee: 0.0003 },
        { symbol: "SOL", minOrderSize: 0.1, maxOrderSize: 5000, stepSize: 0.1, pricePrecision: 3, quantityPrecision: 2, makerFee: 0.0001, takerFee: 0.0003 },
        { symbol: "DOGE", minOrderSize: 10, maxOrderSize: 1000000, stepSize: 1, pricePrecision: 5, quantityPrecision: 0, makerFee: 0.0001, takerFee: 0.0003 },
        { symbol: "ARB", minOrderSize: 1, maxOrderSize: 100000, stepSize: 1, pricePrecision: 4, quantityPrecision: 1, makerFee: 0.0001, takerFee: 0.0003 },
        { symbol: "AVAX", minOrderSize: 0.1, maxOrderSize: 10000, stepSize: 0.1, pricePrecision: 2, quantityPrecision: 2, makerFee: 0.0001, takerFee: 0.0003 },
        { symbol: "LINK", minOrderSize: 0.1, maxOrderSize: 10000, stepSize: 0.1, pricePrecision: 3, quantityPrecision: 2, makerFee: 0.0001, takerFee: 0.0003 },
        { symbol: "WIF", minOrderSize: 1, maxOrderSize: 100000, stepSize: 1, pricePrecision: 4, quantityPrecision: 0, makerFee: 0.0001, takerFee: 0.0003 },
        { symbol: "ONDO", minOrderSize: 1, maxOrderSize: 100000, stepSize: 1, pricePrecision: 4, quantityPrecision: 0, makerFee: 0.0001, takerFee: 0.0003 },
        { symbol: "SUI", minOrderSize: 1, maxOrderSize: 100000, stepSize: 1, pricePrecision: 4, quantityPrecision: 0, makerFee: 0.0001, takerFee: 0.0003 },
    ],

    maxDailyTrades: 50,
    maxOpenPositions: 10,
    maxNotionalPerTrade: 5000,
};

// ═══════════════════════════════════════════
// MEXC — Memecoins (Spot)
// Alta volatilidad, sin apalancamiento spot, lot sizes diminutos
// ═══════════════════════════════════════════
export const MEXC_CONFIG: ExchangeConfig = {
    id: "mexc",
    name: "MEXC (Memecoins)",
    type: "CRYPTO_SPOT",
    enabled: true,
    maxLeverage: 1,           // Spot = sin apalancamiento
    defaultLeverage: 1,
    crossMargin: false,

    marketHours: {
        alwaysOpen: true,
    },

    pairs: [
        { symbol: "PEPEUSDT", minOrderSize: 1000000, maxOrderSize: 100000000000, stepSize: 1000, pricePrecision: 10, quantityPrecision: 0, makerFee: 0.001, takerFee: 0.001 },
        { symbol: "DOGEUSDT", minOrderSize: 10, maxOrderSize: 10000000, stepSize: 1, pricePrecision: 6, quantityPrecision: 0, makerFee: 0.001, takerFee: 0.001 },
        { symbol: "SHIBUSDT", minOrderSize: 100000, maxOrderSize: 1000000000, stepSize: 100, pricePrecision: 8, quantityPrecision: 0, makerFee: 0.001, takerFee: 0.001 },
        { symbol: "WIFUSDT", minOrderSize: 1, maxOrderSize: 100000, stepSize: 0.1, pricePrecision: 4, quantityPrecision: 1, makerFee: 0.001, takerFee: 0.001 },
        { symbol: "BONKUSDT", minOrderSize: 100000, maxOrderSize: 1000000000, stepSize: 100, pricePrecision: 8, quantityPrecision: 0, makerFee: 0.001, takerFee: 0.001 },
        { symbol: "FLOKIUSDT", minOrderSize: 10000, maxOrderSize: 100000000, stepSize: 10, pricePrecision: 6, quantityPrecision: 0, makerFee: 0.001, takerFee: 0.001 },
        { symbol: "BOMEUSDT", minOrderSize: 10, maxOrderSize: 1000000, stepSize: 1, pricePrecision: 6, quantityPrecision: 0, makerFee: 0.001, takerFee: 0.001 },
        { symbol: "POPCATUSDT", minOrderSize: 1, maxOrderSize: 100000, stepSize: 0.1, pricePrecision: 4, quantityPrecision: 1, makerFee: 0.001, takerFee: 0.001 },
    ],

    maxDailyTrades: 30,
    maxOpenPositions: 5,
    maxNotionalPerTrade: 500,  // Memecoins: posiciones pequeñas, riesgo controlado
};

// ═══════════════════════════════════════════
// ALPACA — Acciones US (Equities)
// Comisión 0%, horario limitado, Extended Hours disponible
// ═══════════════════════════════════════════
// ═══════════════════════════════════════════
// AXI — Forex / Metals (Prop Trading)
// ═══════════════════════════════════════════
export const AXI_CONFIG: ExchangeConfig = {
    id: "axi",
    name: "Axi",
    type: "FOREX_PROP",
    enabled: true,
    maxLeverage: 100,
    defaultLeverage: 10,
    crossMargin: true,
    marketHours: {
        alwaysOpen: false,
        openHourUTC: 22, // Domingo 22:00 UTC
        closeHourUTC: 21, // Viernes 21:00 UTC
        tradingDays: [0, 1, 2, 3, 4, 5],
    },
    pairs: [
        { symbol: "EURUSD", minOrderSize: 0.01, maxOrderSize: 50, stepSize: 0.01, pricePrecision: 5, quantityPrecision: 2, makerFee: 0, takerFee: 0.00007 },
        { symbol: "GBPUSD", minOrderSize: 0.01, maxOrderSize: 50, stepSize: 0.01, pricePrecision: 5, quantityPrecision: 2, makerFee: 0, takerFee: 0.00007 },
        { symbol: "USDJPY", minOrderSize: 0.01, maxOrderSize: 50, stepSize: 0.01, pricePrecision: 3, quantityPrecision: 2, makerFee: 0, takerFee: 0.00007 },
        { symbol: "XAUUSD", minOrderSize: 0.01, maxOrderSize: 10, stepSize: 0.01, pricePrecision: 2, quantityPrecision: 2, makerFee: 0, takerFee: 0.0001 },
        { symbol: "GBPJPY", minOrderSize: 0.01, maxOrderSize: 50, stepSize: 0.01, pricePrecision: 3, quantityPrecision: 2, makerFee: 0, takerFee: 0.00007 },
        { symbol: "AUDUSD", minOrderSize: 0.01, maxOrderSize: 50, stepSize: 0.01, pricePrecision: 5, quantityPrecision: 2, makerFee: 0, takerFee: 0.00007 },
        { symbol: "USDCHF", minOrderSize: 0.01, maxOrderSize: 50, stepSize: 0.01, pricePrecision: 5, quantityPrecision: 2, makerFee: 0, takerFee: 0.00007 },
    ],
    maxDailyTrades: 40,
    maxOpenPositions: 15,
    maxNotionalPerTrade: 250000,
};

export const ALPACA_CONFIG: ExchangeConfig = {
    id: "alpaca",
    name: "Alpaca (US Equities)",
    type: "EQUITIES",
    enabled: true,
    maxLeverage: 2,            // RegT margin
    defaultLeverage: 1,
    crossMargin: false,

    marketHours: {
        alwaysOpen: false,
        openHourUTC: 14,          // 9:30 AM ET = 14:30 UTC (usando 14 como check)
        closeHourUTC: 21,         // 4:00 PM ET = 21:00 UTC
        tradingDays: [1, 2, 3, 4, 5],  // Lun-Vie
    },

    pairs: [
        { symbol: "AAPL", minOrderSize: 1, maxOrderSize: 500, stepSize: 1, pricePrecision: 2, quantityPrecision: 0, makerFee: 0, takerFee: 0 },
        { symbol: "TSLA", minOrderSize: 1, maxOrderSize: 200, stepSize: 1, pricePrecision: 2, quantityPrecision: 0, makerFee: 0, takerFee: 0 },
        { symbol: "NVDA", minOrderSize: 1, maxOrderSize: 300, stepSize: 1, pricePrecision: 2, quantityPrecision: 0, makerFee: 0, takerFee: 0 },
        { symbol: "SPY", minOrderSize: 1, maxOrderSize: 1000, stepSize: 1, pricePrecision: 2, quantityPrecision: 0, makerFee: 0, takerFee: 0 },
        { symbol: "MSFT", minOrderSize: 1, maxOrderSize: 200, stepSize: 1, pricePrecision: 2, quantityPrecision: 0, makerFee: 0, takerFee: 0 },
        { symbol: "GOOGL", minOrderSize: 1, maxOrderSize: 500, stepSize: 1, pricePrecision: 2, quantityPrecision: 0, makerFee: 0, takerFee: 0 },
        { symbol: "AMZN", minOrderSize: 1, maxOrderSize: 500, stepSize: 1, pricePrecision: 2, quantityPrecision: 0, makerFee: 0, takerFee: 0 },
        { symbol: "META", minOrderSize: 1, maxOrderSize: 200, stepSize: 1, pricePrecision: 2, quantityPrecision: 0, makerFee: 0, takerFee: 0 },
    ],

    maxDailyTrades: 20,
    maxOpenPositions: 10,
    maxNotionalPerTrade: 10000,
};

// ═══════════════════════════════════════════
// AXI SELECT — Forex Prop Trading (Reglas estrictas)
// Estas son las reglas de evaluación del Prop Firm, no un exchange directo.
// Se aplican como RESTRICCIONES sobre todos los demás exchanges.
// ═══════════════════════════════════════════
// ═══════════════════════════════════════════
// REGLAS GLOBALES (aplican a todos los mercados como límite superior)
// ═══════════════════════════════════════════
export let AXI_SELECT_RULES = {
    maxDailyDrawdownPct: 5.0,
    maxTotalDrawdownPct: 10.0,
    maxPositionPct: 50.0,
    maxRiskPerTradePct: 5.0,
    maxLeverage: 1,
    maxLotSize: 5.0,
    profitTargetPct: 10.0,
    minTradingDays: 5,
    maxTradeDuration: null as number | null,
    newsTrading: true,
    weekendHolding: false,
    hedgingAllowed: false,
    maxCorrelatedPositions: 10,
};

// ═══════════════════════════════════════════
// REGLAS POR MERCADO (cada mercado tiene su propia config)
// Los agentes L3 leen de aquí para sus decisiones
// ═══════════════════════════════════════════
export interface MarketRuleSet {
    maxLeverage: number;
    maxPositionPct: number;       // % del equity por posición
    maxRiskPerTradePct: number;   // % del equity en riesgo por trade
    style: 'scalping' | 'intraday' | 'swing' | 'position';
    maxHoldMinutes: number | null; // null = sin límite
    description: string;
    // ── Ecosystem-level config (persisted to Supabase) ──
    mode: 'paper' | 'live';      // paper trading vs live execution
    enabled: boolean;             // toggle ecosystem on/off
    credentials: Record<string, string>; // stores customized API keys, secrets, WSS URLs, etc.
}

export const MARKET_RULES: Record<string, MarketRuleSet> = {
    crypto: {
        maxLeverage: 10,
        maxPositionPct: 30,
        maxRiskPerTradePct: 3,
        style: 'swing',
        maxHoldMinutes: null,
        description: 'CRIPTO — Todas las criptos y pares en Hyperliquid y aster.exchange (y expansible). Alto leverage.',
        mode: 'paper',
        enabled: true,
        credentials: { hl_wss: "wss://api.hyperliquid.xyz/ws", aster_wss: "wss://api.aster.exchange/ws" },
    },
    memecoins: {
        maxLeverage: 1,
        maxPositionPct: 10,
        maxRiskPerTradePct: 2,
        style: 'scalping',
        maxHoldMinutes: 60,
        description: 'MEME — Pump and dump (MEXC). Investigación de proyectos, IPOs, airdrops.',
        mode: 'paper',
        enabled: true,
        credentials: { mexc_wss: "wss://wbs.mexc.com/ws" },
    },
    equities: {
        maxLeverage: 1,
        maxPositionPct: 25,
        maxRiskPerTradePct: 3,
        style: 'position',
        maxHoldMinutes: null,
        description: 'TRADICIONAL FREE — Forex, comodities, acciones, índices libres en Alpaca. Sin reglas estrictas.',
        mode: 'paper',
        enabled: true,
        credentials: { alpaca_wss: "wss://stream.data.alpaca.markets/v2/iex" },
    },
    forex: {
        maxLeverage: 30,
        maxPositionPct: 20,
        maxRiskPerTradePct: 2,
        style: 'intraday',
        maxHoldMinutes: 480,
        description: 'AXI SELECT — Pares de Axi (forex, commodities, acciones, índices) bajo reglas estrictas de Prop Firm.',
        mode: 'paper',
        enabled: true,
        credentials: { axi_server: "AxiTrader-Live", sl_bps: "15", tp_bps: "45" },
    },
    small_caps: {
        maxLeverage: 1,
        maxPositionPct: 10,
        maxRiskPerTradePct: 2,
        style: 'scalping',
        maxHoldMinutes: 30,
        description: 'SMALL CAPS — Acciones US baja capitalización (Alpaca). Gapper, pump and dump, dilución. Intradía.',
        mode: 'paper',
        enabled: true,
        credentials: { alpaca_sc_wss: "wss://stream.data.alpaca.markets/v2/sip" },
    },
};

/** Obtener reglas de un mercado específico */
export function getMarketRules(market: string): MarketRuleSet {
    return MARKET_RULES[market] || MARKET_RULES.crypto;
}

/**
 * Hot-reload risk limits from Admin Console / Supabase
 * Soporta keys globales (risk_*) y por mercado (market_crypto_*, market_memes_*, etc.)
 */
export function updateRule(key: string, value: any) {
    const numVal = parseFloat(value);
    
    // ── Keys por mercado: market_{mercado}_{campo} ──
    const marketMatch = key.match(/^market_(\w+)_(\w+)$/);
    if (marketMatch) {
        const [, market, field] = marketMatch;
        if (MARKET_RULES[market]) {
            if (field === 'leverage') MARKET_RULES[market].maxLeverage = Math.max(1, Math.floor(numVal));
            if (field === 'position_pct') MARKET_RULES[market].maxPositionPct = numVal;
            if (field === 'risk_per_trade') MARKET_RULES[market].maxRiskPerTradePct = numVal;
            if (field === 'hold_minutes') MARKET_RULES[market].maxHoldMinutes = numVal > 0 ? numVal : null;
            if (field === 'balance') (MARKET_RULES[market] as any).initialBalance = numVal;
            // ── New ecosystem-level fields ──
            if (field === 'mode') MARKET_RULES[market].mode = value === 'live' ? 'live' : 'paper';
            else if (field === 'enabled') MARKET_RULES[market].enabled = value === true || value === 'true' || value === '1';
            else if (!['leverage', 'position_pct', 'risk_per_trade', 'hold_minutes', 'balance'].includes(field)) {
                // If it's none of the standard numerical fields or core flags, it's a dynamic credential
                if (!MARKET_RULES[market].credentials) MARKET_RULES[market].credentials = {};
                MARKET_RULES[market].credentials[field] = String(value);
            }
            console.log(`[ExchangeManager] Market rule updated: ${market}.${field} = ${value}`);
            return;
        }
    }

    // ── Keys globales ──
    if (key === "risk_max_daily_dd_pct") AXI_SELECT_RULES.maxDailyDrawdownPct = numVal;
    if (key === "risk_max_total_dd_pct") AXI_SELECT_RULES.maxTotalDrawdownPct = numVal;
    if (key === "risk_max_position_pct" || key === "risk_max_position_size_pct") AXI_SELECT_RULES.maxPositionPct = numVal;
    if (key === "risk_max_risk_per_trade_pct") AXI_SELECT_RULES.maxRiskPerTradePct = numVal;
    if (key === "risk_max_leverage") AXI_SELECT_RULES.maxLeverage = Math.max(1, Math.floor(numVal));
    if (key === "risk_max_correlated_positions") AXI_SELECT_RULES.maxCorrelatedPositions = Math.floor(numVal);
    if (key === "risk_weekend_holding") AXI_SELECT_RULES.weekendHolding = value === true || value === "true";
    if (key === "risk_hedging_allowed") AXI_SELECT_RULES.hedgingAllowed = value === true || value === "true";
    
    // Leverage por mercado desde campos legacy de la consola
    if (key === "risk_max_leverage_crypto") MARKET_RULES.crypto.maxLeverage = Math.max(1, Math.floor(numVal));
    if (key === "risk_max_leverage_forex") MARKET_RULES.forex.maxLeverage = Math.max(1, Math.floor(numVal));

    if (key === "risk_max_notional_per_trade") {
        HYPERLIQUID_CONFIG.maxNotionalPerTrade = numVal;
        MEXC_CONFIG.maxNotionalPerTrade = numVal;
        ALPACA_CONFIG.maxNotionalPerTrade = numVal;
    }

    if (key === "risk_max_open_positions") {
        HYPERLIQUID_CONFIG.maxOpenPositions = Math.floor(numVal);
        MEXC_CONFIG.maxOpenPositions = Math.floor(numVal);
        ALPACA_CONFIG.maxOpenPositions = Math.floor(numVal);
    }

    console.log(`[ExchangeManager] Rule updated: ${key} = ${value}`);
}

// ═══════════════════════════════════════════
// Utilidades de validación
// ═══════════════════════════════════════════

export function getExchangeConfig(exchangeId: string): ExchangeConfig | null {
    switch (exchangeId) {
        case "hyperliquid": return HYPERLIQUID_CONFIG;
        case "mexc": return MEXC_CONFIG;
        case "alpaca": return ALPACA_CONFIG;
        case "axi": return AXI_CONFIG;
        default: return null;
    }
}

export function getPairConfig(exchangeId: string, symbol: string): ExchangePairConfig | null {
    const exchange = getExchangeConfig(exchangeId);
    if (!exchange) return null;
    
    // First: check explicit config
    const explicit = exchange.pairs.find(p => p.symbol === symbol);
    if (explicit) return explicit;
    
    // Dynamic fallback: generate safe defaults for radar-discovered symbols
    // This allows the 200+ symbols from MarketRadar to pass Filter 5
    return generateDefaultPair(exchangeId, symbol);
}

/**
 * Generate conservative default pair config for dynamically discovered symbols.
 * Uses safe values based on exchange type.
 */
function generateDefaultPair(exchangeId: string, symbol: string): ExchangePairConfig {
    switch (exchangeId) {
        case "hyperliquid":
            return {
                symbol,
                minOrderSize: 0.01,
                maxOrderSize: 10000,
                stepSize: 0.01,
                pricePrecision: 4,
                quantityPrecision: 2,
                makerFee: 0.0001,
                takerFee: 0.0003,
            };
        case "mexc":
            return {
                symbol,
                minOrderSize: 1,
                maxOrderSize: 1000000,
                stepSize: 0.1,
                pricePrecision: 6,
                quantityPrecision: 1,
                makerFee: 0.001,
                takerFee: 0.001,
            };
        case "alpaca":
            return {
                symbol,
                minOrderSize: 1,
                maxOrderSize: 500,
                stepSize: 1,
                pricePrecision: 2,
                quantityPrecision: 0,
                makerFee: 0,
                takerFee: 0,
            };
        case "axi":
            return {
                symbol,
                minOrderSize: 0.01,
                maxOrderSize: 50,
                stepSize: 0.01,
                pricePrecision: 5,
                quantityPrecision: 2,
                makerFee: 0,
                takerFee: 0.00007,
            };
        default:
            return {
                symbol,
                minOrderSize: 0.01,
                maxOrderSize: 10000,
                stepSize: 0.01,
                pricePrecision: 4,
                quantityPrecision: 2,
                makerFee: 0.001,
                takerFee: 0.001,
            };
    }
}

/**
 * Valida si el mercado está abierto para operar en este exchange.
 */
export function isMarketOpen(exchangeId: string): boolean {
    const config = getExchangeConfig(exchangeId);
    if (!config || !config.enabled) return false;

    if (config.marketHours.alwaysOpen) return true;

    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcDay = now.getUTCDay();

    const { openHourUTC, closeHourUTC, tradingDays } = config.marketHours;

    if (tradingDays && !tradingDays.includes(utcDay)) return false;
    if (openHourUTC !== undefined && closeHourUTC !== undefined) {
        if (utcHour < openHourUTC || utcHour >= closeHourUTC) return false;
    }

    return true;
}

/**
 * Valida que la orden cumpla con los límites del exchange.
 */
export function validateOrderSize(
    exchangeId: string,
    symbol: string,
    quantity: number,
    notionalUsd: number
): { valid: boolean; reason?: string } {
    const exchange = getExchangeConfig(exchangeId);
    const pair = getPairConfig(exchangeId, symbol);

    if (!exchange) return { valid: false, reason: `Exchange "${exchangeId}" no reconocido.` };
    if (!pair) return { valid: false, reason: `Par "${symbol}" no configurado en ${exchangeId}.` };
    if (!exchange.enabled) return { valid: false, reason: `Exchange ${exchangeId} está deshabilitado.` };

    if (quantity < pair.minOrderSize) {
        return { valid: false, reason: `Cantidad ${quantity} inferior al mínimo ${pair.minOrderSize} para ${symbol}.` };
    }
    if (quantity > pair.maxOrderSize) {
        return { valid: false, reason: `Cantidad ${quantity} excede el máximo ${pair.maxOrderSize} para ${symbol}.` };
    }
    if (notionalUsd > exchange.maxNotionalPerTrade) {
        return { valid: false, reason: `Notional $${notionalUsd} excede el máximo $${exchange.maxNotionalPerTrade} por trade en ${exchangeId}.` };
    }
    if (!isMarketOpen(exchangeId)) {
        return { valid: false, reason: `Mercado ${exchangeId} cerrado. Hora UTC: ${new Date().getUTCHours()}:00.` };
    }

    return { valid: true };
}
