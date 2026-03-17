import EventEmitter from "events";
import { MarketTick } from "../utils/WebSocketManager";
import { broadcastAgentState } from "../utils/SwarmEvents";

/**
 * Representa una orden virtual abierta en Paper Trading.
 * Se rastrea contra el precio real en vivo para calcular PnL.
 */
export interface PaperPosition {
    id: string;
    symbol: string;
    exchange: string;
    side: "LONG" | "SHORT";
    entryPrice: number;
    leverage: number;
    quantity: number;            // Cantidad del activo (ej. 0.001 BTC)
    notionalValue: number;      // Valor en la moneda de cotización al momento de la entrada
    stopLoss: number | null;
    takeProfit: number | null;
    openedAt: number;            // Unix timestamp ms
    status: "OPEN" | "CLOSED_TP" | "CLOSED_SL" | "CLOSED_MANUAL";
    unrealizedPnl: number;      // Se actualiza en cada tick real
    realizedPnl: number;        // Se fija al cerrar
    closedAt?: number;
    closePrice?: number;
    rationale?: string;
    openedBy?: string;
}

export interface PaperAccount {
    balance: number;             // Saldo virtual en USDT o USD
    initialBalance: number;
    peakBalance: number;         // Para calcular Max Drawdown
    dailyStartBalance: number;   // Para calcular Daily Drawdown
    positions: Map<string, PaperPosition>;
    closedPositions: PaperPosition[];
    totalPnl: number;
}

/**
 * PaperExecutionEngine
 * 
 * Motor de ejecución virtual. NO envía órdenes a ningún exchange.
 * Se alimenta de los ticks REALES del WebSocketManager
 * y calcula el PnL irrealizado de cada posición abierta en memoria.
 *
 * Emite eventos:
 *   "position_opened"  -> PaperPosition
 *   "position_closed"  -> PaperPosition
 *   "pnl_update"       -> { positionId, unrealizedPnl, currentPrice }
 *   "account_update"   -> PaperAccount snapshot
 *   "stoploss_hit"     -> PaperPosition
 *   "takeprofit_hit"   -> PaperPosition
 *   "drawdown_alert"   -> { daily, max, limit }
 */
export class PaperExecutionEngine extends EventEmitter {
    public account: PaperAccount;

    // Axi Select limits
    private maxDailyDrawdownPct = 5.0;   // 5%
    private maxTotalDrawdownPct = 10.0;  // 10%

    // Throttle drawdown alerts: máximo 1 alerta por tipo cada 60 segundos
    private lastDailyAlertTime = 0;
    private lastTotalAlertTime = 0;
    private drawdownAlertCooldownMs = 60_000;

    constructor(initialBalance: number = 10000) {
        super();
        this.account = {
            balance: initialBalance,
            initialBalance: initialBalance,
            peakBalance: initialBalance,
            dailyStartBalance: initialBalance,
            positions: new Map(),
            closedPositions: [],
            totalPnl: 0,
        };
        console.log(`[PaperEngine] Initialized with virtual balance: $${initialBalance}`);
    }

    /**
     * Hot-reload config from AdminConsole.
     * Called by AILoop.reloadRiskConfig when the operator changes risk params.
     */
    public updateConfig(key: string, value: any) {
        const num = parseFloat(value);
        if (isNaN(num)) return;

        if (key === "risk_max_daily_dd_pct") {
            this.maxDailyDrawdownPct = num;
            console.log(`[PaperEngine] ✅ maxDailyDrawdownPct → ${num}%`);
        }
        if (key === "risk_max_total_dd_pct") {
            this.maxTotalDrawdownPct = num;
            console.log(`[PaperEngine] ✅ maxTotalDrawdownPct → ${num}%`);
        }
    }

    /**
     * Reiniciar el saldo diario (para que el DD diario se calcule desde aquellos niveles).
     * Callable desde la consola o al inicio de un nuevo día de trading.
     */
    public resetDailyDrawdown() {
        this.account.dailyStartBalance = this.account.balance;
        console.log(`[PaperEngine] Daily drawdown reset. New daily start: $${this.account.balance.toFixed(2)}`);
    }

    /**
     * Alimentar con cada tick real del WebSocketManager.
     * Actualiza el PnL irrealizado de todas las posiciones abiertas
     * y verifica SL/TP en tiempo real.
     */
    public onRealTick(tick: MarketTick) {
        for (const [id, pos] of this.account.positions) {
            if (pos.symbol !== tick.symbol) continue;

            // Calcular PnL irrealizado
            const priceDiff = tick.price - pos.entryPrice;
            const direction = pos.side === "LONG" ? 1 : -1;
            pos.unrealizedPnl = priceDiff * pos.quantity * direction;

            this.emit("pnl_update", {
                positionId: id,
                unrealizedPnl: pos.unrealizedPnl,
                currentPrice: tick.price,
                entryPrice: pos.entryPrice,
                pnlPercent: ((tick.price - pos.entryPrice) / pos.entryPrice) * 100 * direction,
            });

            // --- Check Stop Loss ---
            if (pos.stopLoss !== null) {
                const slHit = pos.side === "LONG"
                    ? tick.price <= pos.stopLoss
                    : tick.price >= pos.stopLoss;

                if (slHit) {
                    this.closePosition(id, tick.price, "CLOSED_SL");
                    broadcastAgentState("risk", "stoploss_triggered", `${pos.symbol} @ ${tick.price.toFixed(2)}`, "error");
                    this.emit("stoploss_hit", pos);
                    continue;
                }
            }

            // --- Check Take Profit ---
            if (pos.takeProfit !== null) {
                const tpHit = pos.side === "LONG"
                    ? tick.price >= pos.takeProfit
                    : tick.price <= pos.takeProfit;

                if (tpHit) {
                    this.closePosition(id, tick.price, "CLOSED_TP");
                    broadcastAgentState("risk", "takeprofit_reached", `${pos.symbol} +${pos.unrealizedPnl.toFixed(2)}`, "success");
                    this.emit("takeprofit_hit", pos);
                    continue;
                }
            }
        }

        // Balance equity check (balance + sum of unrealized PnL)
        this.checkDrawdownLimits();
    }

    /**
     * Abrir una posición virtual.
     * Debita del saldo virtual la cantidad notional.
     */
    public openPosition(params: {
        symbol: string;
        exchange?: string;
        side: "LONG" | "SHORT";
        entryPrice: number;
        notionalValue: number;   // Cuántos USDT/USD invertir
        leverage?: number;
        stopLoss?: number;
        takeProfit?: number;
        rationale?: string;
        openedBy?: string;
    }): PaperPosition | null {

        // Pre-check: ¿hay saldo suficiente?
        if (params.notionalValue > this.account.balance) {
            console.warn(`[PaperEngine] REJECTED: Insufficient virtual balance. Need $${params.notionalValue}, have $${this.account.balance.toFixed(2)}`);
            broadcastAgentState("risk", "order_rejected", "Insufficient Balance", "error");
            return null;
        }

        // Pre-check: ¿drawdown permite operar?
        const ddPct = this.getDailyDrawdownPct();
        console.log(`[PaperEngine] DD Check: daily=${ddPct.toFixed(2)}% / limit=${this.maxDailyDrawdownPct}% | startBal=$${this.account.dailyStartBalance} equity=$${this.getEquity().toFixed(2)}`);
        if (ddPct > 0 && ddPct >= this.maxDailyDrawdownPct) {
            console.warn("[PaperEngine] REJECTED: Daily drawdown limit reached.");
            broadcastAgentState("risk", "order_rejected", "DD Limit Breached", "error");
            return null;
        }

        const quantity = params.notionalValue / params.entryPrice;
        const id = `paper_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const position: PaperPosition = {
            id,
            symbol: params.symbol,
            exchange: params.exchange || "UNKNOWN",
            side: params.side,
            entryPrice: params.entryPrice,
            leverage: params.leverage || 1,
            quantity,
            notionalValue: params.notionalValue,
            stopLoss: params.stopLoss ?? null,
            takeProfit: params.takeProfit ?? null,
            openedAt: Date.now(),
            status: "OPEN",
            unrealizedPnl: 0,
            realizedPnl: 0,
            rationale: params.rationale || "No rationale provided",
            openedBy: params.openedBy || "system",
        };


        // Debitar del saldo virtual
        this.account.balance -= params.notionalValue;
        this.account.positions.set(id, position);

        console.log(`[PaperEngine] 📥 OPENED ${params.side} ${params.symbol} | Qty: ${quantity.toFixed(6)} @ $${params.entryPrice.toFixed(2)} | Notional: $${params.notionalValue}`);
        broadcastAgentState("risk", "position_opened", `${params.side} ${params.symbol}`, "success");

        this.emit("position_opened", position);
        this.emitAccountUpdate();

        return position;
    }

    /**
     * Cerrar una posición virtual manualmente o por SL/TP.
     */
    public closePosition(
        positionId: string,
        closePrice: number,
        reason: PaperPosition["status"] = "CLOSED_MANUAL"
    ): PaperPosition | null {
        const pos = this.account.positions.get(positionId);
        if (!pos) {
            console.warn(`[PaperEngine] Position ${positionId} not found.`);
            return null;
        }

        // Calcular PnL realizado final
        const priceDiff = closePrice - pos.entryPrice;
        const direction = pos.side === "LONG" ? 1 : -1;
        pos.realizedPnl = priceDiff * pos.quantity * direction;
        pos.unrealizedPnl = 0;
        pos.status = reason;
        pos.closedAt = Date.now();
        pos.closePrice = closePrice;

        // Devolver al saldo: notional original + PnL
        this.account.balance += pos.notionalValue + pos.realizedPnl;
        this.account.totalPnl += pos.realizedPnl;

        // Update peak balance for drawdown tracking
        if (this.account.balance > this.account.peakBalance) {
            this.account.peakBalance = this.account.balance;
        }

        // Mover a historial
        this.account.positions.delete(positionId);
        this.account.closedPositions.push(pos);

        const emoji = pos.realizedPnl >= 0 ? "🟢" : "🔴";
        console.log(`[PaperEngine] 📤 CLOSED ${pos.symbol} | ${reason} | PnL: ${emoji} $${pos.realizedPnl.toFixed(2)} @ $${closePrice.toFixed(2)}`);

        this.emit("position_closed", pos);
        this.emitAccountUpdate();

        return pos;
    }

    /**
     * Cierre de emergencia de TODAS las posiciones (Kill Switch).
     * Usa el último precio real conocido. En producción, cada posición
     * usaría su tick más reciente.
     */
    public liquidateAll(currentPrices: Record<string, number>) {
        console.warn("[PaperEngine] ⚠️ EMERGENCY LIQUIDATION: Closing all virtual positions.");
        broadcastAgentState("risk", "emergency_liquidation", "ALL POSITIONS", "error");

        for (const [id, pos] of this.account.positions) {
            const price = currentPrices[pos.symbol] || pos.entryPrice;
            this.closePosition(id, price, "CLOSED_MANUAL");
        }
    }

    /**
     * Resetear el daily drawdown tracker (llamar a medianoche UTC)
     */
    public resetDailyTracking() {
        this.account.dailyStartBalance = this.getEquity();
        console.log(`[PaperEngine] Daily DD tracker reset. Start balance: $${this.account.dailyStartBalance.toFixed(2)}`);
    }

    // ═══════════════════════════════════════════
    // Internals
    // ═══════════════════════════════════════════

    /** Equity = Balance libre + PnL irrealizado de posiciones abiertas */
    public getEquity(): number {
        let unrealized = 0;
        for (const pos of this.account.positions.values()) {
            unrealized += pos.unrealizedPnl;
        }
        return this.account.balance + unrealized;
    }

    public getDailyDrawdownPct(): number {
        const equity = this.getEquity();
        if (this.account.dailyStartBalance === 0) return 0;
        return ((this.account.dailyStartBalance - equity) / this.account.dailyStartBalance) * 100;
    }

    public getMaxDrawdownPct(): number {
        const equity = this.getEquity();
        if (this.account.peakBalance === 0) return 0;
        return ((this.account.peakBalance - equity) / this.account.peakBalance) * 100;
    }

    private isDailyDrawdownBreached(): boolean {
        return this.getDailyDrawdownPct() >= this.maxDailyDrawdownPct;
    }

    private checkDrawdownLimits() {
        // No positions open = nothing to alert about
        if (this.account.positions.size === 0) return;

        const dailyDD = this.getDailyDrawdownPct();
        const maxDD = this.getMaxDrawdownPct();
        const now = Date.now();

        if (dailyDD >= this.maxDailyDrawdownPct * 0.8) {
            if (now - this.lastDailyAlertTime > this.drawdownAlertCooldownMs) {
                this.lastDailyAlertTime = now;
                this.emit("drawdown_alert", {
                    type: "DAILY",
                    current: dailyDD,
                    limit: this.maxDailyDrawdownPct,
                    breached: dailyDD >= this.maxDailyDrawdownPct,
                });
            }
        }

        if (maxDD >= this.maxTotalDrawdownPct * 0.8) {
            if (now - this.lastTotalAlertTime > this.drawdownAlertCooldownMs) {
                this.lastTotalAlertTime = now;
                this.emit("drawdown_alert", {
                    type: "TOTAL",
                    current: maxDD,
                    limit: this.maxTotalDrawdownPct,
                    breached: maxDD >= this.maxTotalDrawdownPct,
                });
            }
        }
    }

    public emitAccountUpdate() {
        this.emit("account_update", {
            balance: this.account.balance,
            equity: this.getEquity(),
            dailyDrawdown: this.getDailyDrawdownPct(),
            maxDrawdown: this.getMaxDrawdownPct(),
            openPositions: this.account.positions.size,
            totalPnl: this.account.totalPnl,
        });
    }

    /** Snapshot de las posiciones abiertas (para enviar al Frontend) */
    public getOpenPositionsSnapshot() {
        return Array.from(this.account.positions.values()).map(p => ({
            id: p.id,
            symbol: p.symbol,
            exchange: p.exchange,
            side: p.side,
            entryPrice: p.entryPrice,
            leverage: p.leverage,
            quantity: p.quantity,
            notionalValue: p.notionalValue,
            unrealizedPnl: p.unrealizedPnl,
            unrealizedPnlPct: ((p.unrealizedPnl / p.notionalValue) * 100),
            stopLoss: p.stopLoss,
            takeProfit: p.takeProfit,
            openedAt: p.openedAt,
            rationale: p.rationale,
            openedBy: p.openedBy,
        }));
    }
}
