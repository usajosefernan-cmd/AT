/**
 * SentinelAgent.ts
 *
 * El centinela del sistema. Se ejecuta en cada cierre de vela de 15m.
 * Usa Groq (Llama-3.3-70b) via LLMService para análisis rápido.
 *
 * FLUJO:
 *   1. Ingesta velas en buffer circular (20 por símbolo).
 *   2. Calcula indicadores técnicos REALES en TypeScript puro:
 *      RSI(14), EMA(9), EMA(21), VWAP, Volume Ratio, Body %.
 *   3. Pre-filtra: si volumen y cuerpo son normales, skip (sin gastar tokens).
 *   4. Inyecta datos OHLCV + indicadores calculados en el prompt del LLM.
 *   5. Parsea la respuesta JSON estructurada del LLM.
 *
 * NO EJECUTA TRADES. Solo detecta y propone señales.
 */

import { askGroq } from "../ai/LLMService";
import { OHLCCandle } from "../utils/WebSocketManager";
import { broadcastAgentState } from "../utils/SwarmEvents";
import { saveAgentMemory } from "../utils/supabaseClient";

// ═══════════════════════════════════════════
// Tipos de señal que el Sentinel produce
// ═══════════════════════════════════════════

export interface TradeSignal {
    action: "LONG" | "SHORT" | "NO_TRADE";
    symbol: string;
    exchange: "hyperliquid" | "mexc" | "alpaca";
    confidence: number;          // 0-100
    entry_price: number;
    stop_loss_pct: number;
    take_profit_pct: number;
    notional_usd: number;
    rationale: string;
    timeframe: string;
    indicators_used: string[];
}

// ═══════════════════════════════════════════
// System Prompt — Define el comportamiento del Sentinel
// ═══════════════════════════════════════════

const SENTINEL_SYSTEM_PROMPT = `Eres HEAD HUNTER, un analista de momentum de alta agresividad. Tu objetivo es detectar oportunidades EXPLOSIVAS antes que el resto.
Opera en:
- Hyperliquid: perpetuos (Max $5000 notional)
- MEXC: memecoins volátiles (Max $1000 notional)
- Alpaca: stocks US activa.

REGLAS DE CAZA:
1. Sé proactivo. Si ves momentum claro (>2% cambio o >2x volumen), entra.
2. Confianza mínima: 60 (Antes 70). Queremos acción.
3. El Risk/Reward debe ser 1:1.5 o superior.
4. Stop Loss máximo: 5%. Queremos darle aire a la volatilidad.
5. Si detectas un spike de volumen masivo, prioriza la entrada aunque el RSI sea alto (momentum play).

INDICADORES QUE RECIBES (Calculados):
- RSI(14), EMA(9), EMA(21), VWAP, Volume Ratio, Body %.

DECISIONES BASADAS EN CONFLUENCIA:
- LONG si: RSI < 40 + EMA9 > EMA21 + Volume > 1.5x + Precio > VWAP
- SHORT si: RSI > 65 + EMA9 < EMA21 + Volume > 1.5x + Precio < VWAP
- NO_TRADE si: no hay confluencia de al menos 3 indicadores.

Responde SIEMPRE en JSON con este esquema exacto:
{
  "action": "LONG" | "SHORT" | "NO_TRADE",
  "symbol": "BTC",
  "exchange": "hyperliquid" | "mexc" | "alpaca",
  "confidence": 0-100,
  "entry_price": number,
  "stop_loss_pct": number,
  "take_profit_pct": number,
  "notional_usd": number,
  "rationale": "ANÁLISIS TÉCNICO DETALLADO: (1) Estructura de precio, (2) Cruces de indicadores (EMA/RSI), (3) Análisis de Volumen, (4) Justificación de la ventaja estadística (Edge). Sé extremadamente detallista.",
  "timeframe": "15m",
  "indicators_used": ["rsi", "ema_cross", "volume_spike", ...]
}`;

// ═══════════════════════════════════════════
// Technical Indicator Calculations (Pure TypeScript)
// ═══════════════════════════════════════════

interface CalculatedIndicators {
    rsi14: number | null;
    ema9: number | null;
    ema21: number | null;
    vwap: number | null;
    volumeRatio: number;
    bodyPct: number;
    candleDirection: "ALCISTA" | "BAJISTA";
    changePct: number;
    avgVolume: number;
}

function computeRSI(closes: number[], period: number = 14): number | null {
    if (closes.length < period + 1) return null;

    const changes: number[] = [];
    for (let i = 1; i < closes.length; i++) {
        changes.push(closes[i] - closes[i - 1]);
    }

    // Use last `period` changes
    const recent = changes.slice(-period);
    let avgGain = 0;
    let avgLoss = 0;

    for (const change of recent) {
        if (change > 0) avgGain += change;
        else avgLoss += Math.abs(change);
    }

    avgGain /= period;
    avgLoss /= period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
}

function computeEMA(values: number[], period: number): number | null {
    if (values.length < period) return null;

    const multiplier = 2 / (period + 1);
    // Start with SMA of first `period` values
    let ema = values.slice(0, period).reduce((s, v) => s + v, 0) / period;

    for (let i = period; i < values.length; i++) {
        ema = (values[i] - ema) * multiplier + ema;
    }

    return ema;
}

function computeVWAP(candles: OHLCCandle[]): number | null {
    if (candles.length === 0) return null;

    let cumulativeTPV = 0; // typical price * volume
    let cumulativeVolume = 0;

    for (const c of candles) {
        const typicalPrice = (c.high + c.low + c.close) / 3;
        cumulativeTPV += typicalPrice * c.volume;
        cumulativeVolume += c.volume;
    }

    if (cumulativeVolume === 0) return null;
    return cumulativeTPV / cumulativeVolume;
}

function computeIndicators(candles: OHLCCandle[], currentCandle: OHLCCandle): CalculatedIndicators {
    const closes = candles.map((c) => c.close);
    const volumes = candles.map((c) => c.volume);

    const avgVolume = volumes.length >= 5
        ? volumes.slice(-10).reduce((s, v) => s + v, 0) / Math.min(volumes.length, 10)
        : currentCandle.volume;

    const volumeRatio = avgVolume > 0 ? currentCandle.volume / avgVolume : 1;
    const range = currentCandle.high - currentCandle.low;
    const bodyPct = range > 0 ? Math.abs(currentCandle.close - currentCandle.open) / range : 0;
    const changePct = currentCandle.open > 0
        ? ((currentCandle.close - currentCandle.open) / currentCandle.open) * 100
        : 0;

    return {
        rsi14: computeRSI(closes, 14),
        ema9: computeEMA(closes, 9),
        ema21: computeEMA(closes, 21),
        vwap: computeVWAP(candles),
        volumeRatio,
        bodyPct,
        candleDirection: currentCandle.close > currentCandle.open ? "ALCISTA" : "BAJISTA",
        changePct,
        avgVolume,
    };
}

// ═══════════════════════════════════════════
// Exchange source to exchange ID mapping
// ═══════════════════════════════════════════

function sourceToExchange(source: string): "hyperliquid" | "mexc" | "alpaca" {
    const s = source.toUpperCase();
    if (s === "HYPERLIQUID") return "hyperliquid";
    if (s === "MEXC") return "mexc";
    if (s === "ALPACA") return "alpaca";
    return "hyperliquid"; // default
}

// ═══════════════════════════════════════════
// Clase SentinelAgent
// ═══════════════════════════════════════════

export class SentinelAgent {
    // Buffer de las últimas N velas por símbolo para dar contexto al LLM
    private candleBuffer: Map<string, OHLCCandle[]> = new Map();
    private maxBufferSize = 20;

    /**
     * Almacena cada vela que llega del WSS para construir contexto.
     */
    public ingestCandle(candle: OHLCCandle) {
        const key = `${candle.source}_${candle.symbol}_${candle.interval}`;
        if (!this.candleBuffer.has(key)) {
            this.candleBuffer.set(key, []);
        }
        const buffer = this.candleBuffer.get(key)!;
        buffer.push(candle);
        if (buffer.length > this.maxBufferSize) {
            buffer.shift();
        }
    }

    /**
     * Returns the current buffer size for a given symbol (for diagnostics).
     */
    public getBufferSize(source: string, symbol: string, interval: string = "15m"): number {
        const key = `${source}_${symbol}_${interval}`;
        return this.candleBuffer.get(key)?.length || 0;
    }

    /**
     * Se ejecuta cuando cierra una vela de 15m.
     * Calcula indicadores técnicos REALES y envía al LLM.
     */
    public async analyze(closedCandle: OHLCCandle): Promise<TradeSignal | null> {
        broadcastAgentState("sentinel", "analyzing", `${closedCandle.symbol} 15m`, "active");

        const bufferKey = `${closedCandle.source}_${closedCandle.symbol}_${closedCandle.interval}`;
        let recentCandles = this.candleBuffer.get(bufferKey) || [];

        // FALLBACK: If buffer is empty (e.g. from Scanner), fetch history from CCXT or Supabase
        if (recentCandles.length < 5) {
            try {
                // For simplicity, we just use the current candle as the seed for now, 
                // but in a real spike we want to see if it's sustained.
                // We'll trust the computeIndicators to handle small arrays.
                if (recentCandles.length === 0) recentCandles = [closedCandle];
            } catch (err) {}
        }

        // ─── PASO 1: Calcular indicadores técnicos en TypeScript puro ───
        const indicators = computeIndicators(recentCandles, closedCandle);

        console.log(`[Sentinel] 📊 Indicadores calculados para ${closedCandle.symbol}:`);
        console.log(`           RSI(14)=${indicators.rsi14?.toFixed(1) ?? "N/A"} | EMA(9)=${indicators.ema9?.toFixed(2) ?? "N/A"} | EMA(21)=${indicators.ema21?.toFixed(2) ?? "N/A"}`);
        console.log(`           VWAP=${indicators.vwap?.toFixed(2) ?? "N/A"} | Vol Ratio=${indicators.volumeRatio.toFixed(2)}x | Body=${(indicators.bodyPct * 100).toFixed(0)}%`);

        // ─── PASO 2: Pre-filtro rápido (Modo Ultra-Sensible) ───
        // Solo saltamos si es ABSOLUTAMENTE ruido (volumen 0 y sin movimiento)
        if (indicators.volumeRatio < 0.1 && indicators.bodyPct < 0.01 && indicators.changePct === 0) {
            broadcastAgentState("sentinel", "no_signal", closedCandle.symbol, "idle");
            return null;
        }

        // ─── PASO 3: Construir prompt con datos reales + indicadores ───
        const candleTable = recentCandles.slice(-20).map((c, i) => ({
            n: i + 1,
            o: +c.open.toFixed(2),
            h: +c.high.toFixed(2),
            l: +c.low.toFixed(2),
            c: +c.close.toFixed(2),
            v: Math.round(c.volume),
            ts: new Date(c.timestamp).toISOString(),
        }));

        const userPrompt = `VELA DE 15 MINUTOS CERRADA — ${closedCandle.source} / ${closedCandle.symbol}

═══ VELA ACTUAL ═══
- Open: ${closedCandle.open}
- High: ${closedCandle.high}
- Low: ${closedCandle.low}
- Close: ${closedCandle.close}
- Volume: ${closedCandle.volume}
- Dirección: ${indicators.candleDirection}
- Cambio: ${indicators.changePct.toFixed(3)}%

═══ INDICADORES TÉCNICOS CALCULADOS ═══
- RSI(14): ${indicators.rsi14?.toFixed(2) ?? "Insuficientes datos (<15 velas)"}
- EMA(9): ${indicators.ema9?.toFixed(4) ?? "Insuficientes datos"}
- EMA(21): ${indicators.ema21?.toFixed(4) ?? "Insuficientes datos"}
- VWAP: ${indicators.vwap?.toFixed(4) ?? "N/A"}
- Cruce EMA: ${indicators.ema9 && indicators.ema21 ? (indicators.ema9 > indicators.ema21 ? "EMA9 > EMA21 (ALCISTA)" : "EMA9 < EMA21 (BAJISTA)") : "N/A"}
- Precio vs VWAP: ${indicators.vwap ? (closedCandle.close > indicators.vwap ? "POR ENCIMA (sesgo alcista)" : "POR DEBAJO (sesgo bajista)") : "N/A"}
- Volumen Promedio (10p): ${indicators.avgVolume.toFixed(2)}
- Ratio Volumen: ${indicators.volumeRatio.toFixed(2)}x ${indicators.volumeRatio >= 2 ? "⚠️ SPIKE" : ""}
- Cuerpo de Vela: ${(indicators.bodyPct * 100).toFixed(1)}% del rango ${indicators.bodyPct >= 0.7 ? "⚠️ CONVICCIÓN" : ""}

═══ ÚLTIMAS ${candleTable.length} VELAS (15m) ═══
${JSON.stringify(candleTable, null, 2)}

Exchange: ${closedCandle.source}
Hora UTC: ${new Date().toUTCString()}

Analiza la confluencia de indicadores y responde en JSON.`;

        // ─── PASO 4: Llamar al LLM con datos reales ───
        try {
            console.log(`[Sentinel] 🧠 Enviando a Groq con ${recentCandles.length} velas + indicadores calculados...`);

            const { data: signal, usage } = await askGroq<TradeSignal>(
                SENTINEL_SYSTEM_PROMPT,
                userPrompt,
                { temperature: 0.1, maxTokens: 500, jsonMode: true }
            );

            // ─── PASO 5: Validar y devolver la señal ───
            if (!signal || !signal.action) {
                console.warn("[Sentinel] LLM returned invalid signal structure.");
                broadcastAgentState("sentinel", "error", "Invalid LLM response", "error");
                return null;
            }

            // Ensure exchange field is correct
            signal.exchange = signal.exchange || sourceToExchange(closedCandle.source);

            if (signal.action === "NO_TRADE") {
                console.log(`[Sentinel] ${closedCandle.symbol}: NO_TRADE — ${signal.rationale}`);
                broadcastAgentState("sentinel", "no_signal", signal.rationale?.slice(0, 40) || "No opportunity", "idle");
                return null;
            }

            console.log(`[Sentinel] 🎯 SIGNAL: ${signal.action} ${signal.symbol} @ ${signal.entry_price} | Conf: ${signal.confidence}% | R: ${signal.rationale}`);
            broadcastAgentState("sentinel", "signal_detected", `${signal.action} ${signal.symbol} (${signal.confidence}%)`, "success");

            // Guardar análisis completo en Supabase
            await saveAgentMemory("sentinel", "last_analysis", JSON.stringify({
                signal,
                indicators: {
                    rsi14: indicators.rsi14,
                    ema9: indicators.ema9,
                    ema21: indicators.ema21,
                    vwap: indicators.vwap,
                    volumeRatio: indicators.volumeRatio,
                    bodyPct: indicators.bodyPct,
                },
                candle: {
                    symbol: closedCandle.symbol,
                    source: closedCandle.source,
                    close: closedCandle.close,
                    volume: closedCandle.volume,
                },
                tokens: { prompt: usage.promptTokens, completion: usage.completionTokens },
                analyzed_at: new Date().toISOString(),
            }));

            return signal;

        } catch (error: any) {
            console.error("[Sentinel] Error en llamada a Groq:", error.message);
            broadcastAgentState("sentinel", "error", error.message.slice(0, 40), "error");
            return null;
        }
    }
}
