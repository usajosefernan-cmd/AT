import EventEmitter from "events";
import { MarketTick } from "../utils/WebSocketManager";
import { broadcastAgentState } from "../utils/SwarmEvents";
import { getAllPaperAccounts, getOpenPaperPositions, savePaperPosition, updatePaperBalance } from "../utils/supabaseClient";
import { L4AExecutionEngine } from "./L4A_execution_engine";
import { PostTradeLogger } from "./PostTradeLogger";
import { L4BPortfolioStrategist } from "./L4B_portfolio_strategist";

/**
 * Representa una orden virtual abierta en Paper Trading.
 */
export interface PaperPosition {
    id: string;
    symbol: string;
    exchange: string;
    marketId: string;
    side: "LONG" | "SHORT";
    entryPrice: number;
    leverage: number;
    quantity: number;            
    notionalValue: number;      
    stopLoss: number | null;
    takeProfit: number | null;
    trailingStop?: {
        activationPct: number;
        callbackPct: number;
        active: boolean;
        highestPrice?: number;
        lowestPrice?: number;
    } | null;
    openedAt: number;            
    status: "OPEN" | "CLOSED_TP" | "CLOSED_SL" | "CLOSED_MANUAL";
    unrealizedPnl: number;      
    unrealizedPnlPct: number;   
    realizedPnl: number;        
    closedAt?: number;
    closePrice?: number;
    rationale?: string;
    openedBy?: string;
}

export interface PaperAccount {
    balance: number;             
    initialBalance: number;
    peakBalance: number;         
    dailyStartBalance: number;   
    positions: Map<string, PaperPosition>;
    closedPositions: PaperPosition[];
    totalPnl: number;
}

export const MARKET_IDS = ["crypto", "memecoins", "equities", "forex", "small_caps"];

export function inferMarketId(exchange?: string): string {
    const ex = (exchange || "").toLowerCase();
    if (ex === "axi") return "forex";
    if (ex === "alpaca") return "equities";
    if (ex === "hyperliquid" || ex === "mexc" || ex === "binance") return "crypto";
    return "crypto"; // default fallback
}

export class PaperExecutionEngine extends EventEmitter {
    public accounts: Record<string, PaperAccount> = {};
    public limits: Record<string, { dailyDD: number, totalDD: number }> = {};
    public l4a: L4AExecutionEngine;
    public l4b: L4BPortfolioStrategist;

    private lastDailyAlertTime = 0;
    private lastTotalAlertTime = 0;
    private drawdownAlertCooldownMs = 60_000;

    constructor() {
        super();
        for (const m of MARKET_IDS) {
            this.accounts[m] = {
                balance: 10000,
                initialBalance: 10000,
                peakBalance: 10000,
                dailyStartBalance: 10000,
                positions: new Map(),
                closedPositions: [],
                totalPnl: 0,
            };
            this.limits[m] = { dailyDD: 5.0, totalDD: 10.0 };
        }

        // L4-A: Execution Engine — gestión algorítmica de posiciones vivas
        this.l4a = new L4AExecutionEngine(this);

        // Telemetría: Registra cada cierre para el L5 Quantitative Researcher
        new PostTradeLogger(this);

        // L4-B: Portfolio Strategist — auditoría macro asíncrona con override jerárquico
        this.l4b = new L4BPortfolioStrategist(this);

        console.log(`[PaperEngine] Initializing Multi-Market Virtual Accounts + L4-A/L4-B Engine + Telemetry.`);
        this.loadAllStatesFromSupabase().catch(err => console.error("[PaperEngine] Init Error:", err));
    }

    private async loadAllStatesFromSupabase() {
        try {
            const accounts = await getAllPaperAccounts();
            const openPositions = await getOpenPaperPositions();

            for (const accData of accounts) {
                const m = accData.id;
                if (!this.accounts[m]) continue;
                const acc = this.accounts[m];
                
                acc.balance = accData.balance || 10000;
                acc.initialBalance = accData.initial_balance || 10000;
                acc.peakBalance = accData.peak_balance || 10000;
                acc.dailyStartBalance = accData.daily_start_balance || 10000;
                acc.totalPnl = accData.total_pnl || 0;
            }

            for (const posData of openPositions) {
                const m = posData.market_id || inferMarketId(posData.exchange);
                if (!this.accounts[m]) continue;
                
                const acc = this.accounts[m];
                const pos: any = {
                    id: posData.id,
                    symbol: posData.symbol,
                    exchange: posData.exchange || 'unknown',
                    side: posData.side,
                    entryPrice: posData.entry_price,
                    quantity: posData.quantity,
                    notionalValue: posData.notional_value,
                    stopLoss: posData.stop_loss,
                    takeProfit: posData.take_profit,
                    leverage: posData.leverage || 1,
                    status: posData.status,
                    unrealizedPnl: posData.unrealized_pnl || 0,
                    realizedPnl: posData.realized_pnl || 0,
                    openedAt: new Date(posData.opened_at).getTime(),
                    rationale: posData.rationale,
                };
                
                if (posData.trailing_stop_pct) {
                    pos.trailingStop = { active: true, activationPct: 0, callbackPct: posData.trailing_stop_pct };
                }
                
                acc.positions.set(pos.id, pos);
            }
            
            for (const m of MARKET_IDS) {
                console.log(`[PaperEngine][${m}] 📦 SQL Restored. Balance: $${this.accounts[m].balance.toFixed(2)}, Open: ${this.accounts[m].positions.size}`);
            }
        } catch (err) {
            console.error(`[PaperEngine] Error loading state from Supabase SQL:`, err);
        }
        this.emitAccountUpdate();
    }

    private async saveStateToSupabase(marketId?: string) {
        const marketsToSave = marketId ? [marketId] : MARKET_IDS;

        for (const m of marketsToSave) {
            try {
                const acc = this.accounts[m];
                if (!acc) continue;
                const limit = this.limits[m];
                
                await updatePaperBalance(
                    m, acc.balance, this.getEquity(m), 
                    this.getDailyDrawdownPct(m), this.getMaxDrawdownPct(m), 
                    acc.totalPnl, acc.initialBalance, acc.peakBalance, acc.dailyStartBalance
                );

                for (const pos of acc.positions.values()) {
                    await savePaperPosition(pos, m);
                }
            } catch (err) {
                console.error(`[PaperEngine] Failed to save SQL state to Supabase for ${m}:`, err);
            }
        }
    }

    /**
     * Hot-reload config from AdminConsole.
     */
    public updateConfig(key: string, value: any) {
        const num = parseFloat(value);
        if (isNaN(num)) return;

        // format matches AdminConsole.tsx: market_{id}_balance, market_{id}_daily_dd
        const match = key.match(/^market_([a-z_]+)_(.*)$/);
        if (match) {
            const marketId = match[1];
            const stat = match[2];
            
            if (!this.accounts[marketId]) return;

            if (stat === "daily_dd") {
                this.limits[marketId].dailyDD = num;
                console.log(`[PaperEngine][${marketId}] ✅ dailyDD → ${num}%`);
            }
            if (stat === "total_dd") {
                 this.limits[marketId].totalDD = num;
                 console.log(`[PaperEngine][${marketId}] ✅ totalDD → ${num}%`);
            }
            
            if (stat === "balance") {
                const acc = this.accounts[marketId];
                const oldInitial = acc.initialBalance;
                acc.initialBalance = num;
                
                if (acc.balance === oldInitial || acc.closedPositions.length === 0) {
                     acc.balance = num;
                     acc.dailyStartBalance = num;
                     acc.peakBalance = num;
                     console.log(`[PaperEngine][${marketId}] ✅ Syncing balance to: $${num}`);
                }
                console.log(`[PaperEngine][${marketId}] ✅ initialBalance updated → $${num}`);
                this.emitAccountUpdate();
                this.saveStateToSupabase(marketId);
            }
        }
    }

    public resetDailyDrawdown(marketId?: string) {
        const markets = marketId ? [marketId] : MARKET_IDS;
        for (const m of markets) {
            const acc = this.accounts[m];
            if (acc) {
                acc.dailyStartBalance = acc.balance;
            }
        }
        console.log(`[PaperEngine] Daily drawdown reset for: ${marketId || 'ALL'}`);
        this.saveStateToSupabase(marketId);
    }

    public onRealTick(tick: MarketTick) {
        for (const m of MARKET_IDS) {
            const acc = this.accounts[m];
            for (const [id, pos] of acc.positions) {
                if (pos.symbol !== tick.symbol) continue;

                const priceDiff = tick.price - pos.entryPrice;
                const direction = pos.side === "LONG" ? 1 : -1;
                pos.unrealizedPnl = priceDiff * pos.quantity * direction;

                const margin = pos.notionalValue / pos.leverage;
                const leveredPct = margin > 0 ? (pos.unrealizedPnl / margin) * 100 : 0;
                pos.unrealizedPnlPct = leveredPct;

                this.emit("pnl_update", {
                    positionId: id,
                    unrealizedPnl: pos.unrealizedPnl,
                    unrealizedPnlPct: leveredPct,
                    currentPrice: tick.price,
                    entryPrice: pos.entryPrice,
                });

                // ⚡ L4-A: Gestión dinámica (BE, Partial TP, Trailing) ANTES de checks SL/TP
                this.l4a.onTick(id, tick.price);

                if (pos.trailingStop && pos.trailingStop.active) {
                    if (pos.side === 'LONG') {
                        if (tick.price > (pos.trailingStop.highestPrice || 0)) {
                            pos.trailingStop.highestPrice = tick.price;
                            const newSL = tick.price * (1 - pos.trailingStop.callbackPct / 100);
                            if (pos.stopLoss === null || newSL > pos.stopLoss) pos.stopLoss = newSL;
                        }
                    } else {
                        if (tick.price < (pos.trailingStop.lowestPrice || Infinity)) {
                            pos.trailingStop.lowestPrice = tick.price;
                            const newSL = tick.price * (1 + pos.trailingStop.callbackPct / 100);
                            if (pos.stopLoss === null || newSL < pos.stopLoss) pos.stopLoss = newSL;
                        }
                    }
                }

                if (pos.stopLoss !== null) {
                    const slHit = pos.side === "LONG" ? tick.price <= pos.stopLoss : tick.price >= pos.stopLoss;
                    if (slHit) {
                        this.closePosition(id, tick.price, "CLOSED_SL", m);
                        broadcastAgentState("risk", "stoploss_triggered", `${pos.symbol} @ ${tick.price.toFixed(2)}`, "error");
                        this.emit("stoploss_hit", pos);
                        continue;
                    }
                }

                if (pos.takeProfit !== null) {
                    const tpHit = pos.side === "LONG" ? tick.price >= pos.takeProfit : tick.price <= pos.takeProfit;
                    if (tpHit) {
                        this.closePosition(id, tick.price, "CLOSED_TP", m);
                        broadcastAgentState("risk", "takeprofit_reached", `${pos.symbol} +${pos.unrealizedPnl.toFixed(2)}`, "success");
                        this.emit("takeprofit_hit", pos);
                        continue;
                    }
                }
            }
        }

        this.checkDrawdownLimits();
        this.emitAccountUpdate();
    }

    public openPosition(params: {
        symbol: string;
        exchange?: string;
        marketId?: string;
        side: "LONG" | "SHORT";
        entryPrice: number;
        notionalValue: number;
        leverage?: number;
        stopLoss?: number;
        takeProfit?: number;
        trailingStopPct?: number;
        rationale?: string;
        openedBy?: string;
    }): PaperPosition | null {
        const marketId = params.marketId || inferMarketId(params.exchange);
        const acc = this.accounts[marketId];
        
        if (!acc) {
            console.error(`[PaperEngine] REJECTED: Invalid marketId ${marketId}`);
            return null;
        }

        const leverage = params.leverage || 1;
        const requiredMargin = params.notionalValue / leverage;

        let totalUsedMargin = 0;
        for (const p of acc.positions.values()) {
            totalUsedMargin += p.notionalValue / p.leverage;
        }

        const availableMargin = acc.balance - totalUsedMargin;

        if (requiredMargin > availableMargin) {
            console.warn(`[PaperEngine][${marketId}] REJECTED: Insufficient Margin. Need $${requiredMargin.toFixed(2)}, have $${availableMargin.toFixed(2)}`);
            broadcastAgentState("risk", "order_rejected", "Insufficient Margin", "error");
            return null;
        }

        const ddPct = this.getDailyDrawdownPct(marketId);
        if (ddPct > 0 && ddPct >= this.limits[marketId].dailyDD) {
            console.warn(`[PaperEngine][${marketId}] REJECTED: Daily drawdown limit reached.`);
            broadcastAgentState("risk", "order_rejected", "DD Limit Breached", "error");
            return null;
        }

        const quantity = params.notionalValue / params.entryPrice;
        const id = `paper_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const position: PaperPosition = {
            id,
            symbol: params.symbol,
            exchange: params.exchange || "UNKNOWN",
            marketId,
            side: params.side,
            entryPrice: params.entryPrice,
            leverage: leverage,
            quantity,
            notionalValue: params.notionalValue,
            stopLoss: params.stopLoss ?? null,
            takeProfit: params.takeProfit ?? null,
            trailingStop: params.trailingStopPct ? {
                activationPct: 0,
                callbackPct: params.trailingStopPct,
                active: true,
                highestPrice: params.side === 'LONG' ? params.entryPrice : undefined,
                lowestPrice: params.side === 'SHORT' ? params.entryPrice : undefined
            } : null,
            openedAt: Date.now(),
            status: "OPEN",
            unrealizedPnl: 0,
            unrealizedPnlPct: 0,
            realizedPnl: 0,
            rationale: params.rationale || "No rationale provided",
            openedBy: params.openedBy || "system",
        };

        acc.positions.set(id, position);

        console.log(`[PaperEngine][${marketId}] 📥 OPENED ${params.side} ${params.symbol} | Lev: ${leverage}x | Qty: ${quantity.toFixed(6)} @ $${params.entryPrice.toFixed(2)}`);
        broadcastAgentState("risk", "position_opened", `${params.side} ${params.symbol} (${leverage}x)`, "success");

        this.emit("position_opened", position);
        this.emitAccountUpdate();
        this.saveStateToSupabase(marketId);

        return position;
    }

    public closePosition(
        positionId: string,
        closePrice: number,
        reason: PaperPosition["status"] = "CLOSED_MANUAL",
        marketIdHint?: string
    ): PaperPosition | null {
        // Find position across all markets if marketIdHint is not provided
        let targetMarket = marketIdHint;
        let pos: PaperPosition | undefined;
        
        if (targetMarket) {
            pos = this.accounts[targetMarket]?.positions.get(positionId);
        } else {
            for (const m of MARKET_IDS) {
                if (this.accounts[m].positions.has(positionId)) {
                    targetMarket = m;
                    pos = this.accounts[m].positions.get(positionId);
                    break;
                }
            }
        }

        if (!pos || !targetMarket) {
            console.warn(`[PaperEngine] Position ${positionId} not found.`);
            return null;
        }

        const acc = this.accounts[targetMarket];
        const direction = pos.side === "LONG" ? 1 : -1;
        const priceDiff = closePrice - pos.entryPrice;
        pos.realizedPnl = priceDiff * pos.quantity * direction;
        pos.unrealizedPnl = 0;
        pos.status = reason;
        pos.closedAt = Date.now();
        pos.closePrice = closePrice;

        acc.balance += pos.realizedPnl;
        acc.totalPnl += pos.realizedPnl;

        if (acc.balance > acc.peakBalance) {
            acc.peakBalance = acc.balance;
        }

        acc.positions.delete(positionId);
        acc.closedPositions.push(pos);

        const emoji = pos.realizedPnl >= 0 ? "🟢" : "🔴";
        console.log(`[PaperEngine][${targetMarket}] 📤 CLOSED ${pos.symbol} | ${reason} | PnL: ${emoji} $${pos.realizedPnl.toFixed(2)}`);

        this.emit("position_closed", pos);
        this.emitAccountUpdate();
        this.saveStateToSupabase(targetMarket);

        return pos;
    }

    public liquidateAll(currentPrices: Record<string, number>) {
        console.warn("[PaperEngine] ⚠️ EMERGENCY LIQUIDATION: Closing all virtual positions.");
        broadcastAgentState("risk", "emergency_liquidation", "ALL POSITIONS", "error");

        for (const m of MARKET_IDS) {
            for (const [id, pos] of this.accounts[m].positions) {
                const price = currentPrices[pos.symbol] || pos.entryPrice;
                this.closePosition(id, price, "CLOSED_MANUAL", m);
            }
        }
    }

    public getTotalBalance(): number {
        return Object.values(this.accounts).reduce((sum, acc) => sum + acc.balance, 0);
    }

    public getTotalPnL(): number {
        return Object.values(this.accounts).reduce((sum, acc) => sum + acc.totalPnl, 0);
    }

    public getTotalPositionsCount(): number {
        return Object.values(this.accounts).reduce((sum, acc) => sum + acc.positions.size, 0);
    }

    public getTotalClosedCount(): number {
        return Object.values(this.accounts).reduce((sum, acc) => sum + acc.closedPositions.length, 0);
    }

    public getTotalEquity(): number {
        return MARKET_IDS.reduce((sum, m) => sum + this.getEquity(m), 0);
    }

    public getMaxDailyDrawdownPct(): number {
        return Math.max(0, ...MARKET_IDS.map(m => this.getDailyDrawdownPct(m)));
    }

    public getMaxTotalDrawdownPct(): number {
        return Math.max(0, ...MARKET_IDS.map(m => this.getMaxDrawdownPct(m)));
    }

    public getEquity(marketId: string): number {
        const acc = this.accounts[marketId];
        if (!acc) return 0;

        let unrealized = 0;
        for (const pos of acc.positions.values()) {
            unrealized += pos.unrealizedPnl;
        }
        return acc.balance + unrealized;
    }

    public getDailyDrawdownPct(marketId: string): number {
        const acc = this.accounts[marketId];
        if (!acc || acc.dailyStartBalance === 0) return 0;
        const equity = this.getEquity(marketId);
        return ((acc.dailyStartBalance - equity) / acc.dailyStartBalance) * 100;
    }

    public getMaxDrawdownPct(marketId: string): number {
        const acc = this.accounts[marketId];
        if (!acc || acc.peakBalance === 0) return 0;
        const equity = this.getEquity(marketId);
        return ((acc.peakBalance - equity) / acc.peakBalance) * 100;
    }

    private checkDrawdownLimits() {
        const now = Date.now();

        for (const m of MARKET_IDS) {
            const acc = this.accounts[m];
            if (acc.positions.size === 0) continue;

            const dailyDD = this.getDailyDrawdownPct(m);
            const maxDD = this.getMaxDrawdownPct(m);
            const limit = this.limits[m];

            if (dailyDD >= limit.dailyDD * 0.8) {
                if (now - this.lastDailyAlertTime > this.drawdownAlertCooldownMs) {
                    this.lastDailyAlertTime = now;
                    this.emit("drawdown_alert", {
                        type: "DAILY",
                        marketId: m,
                        current: dailyDD,
                        limit: limit.dailyDD,
                        breached: dailyDD >= limit.dailyDD,
                    });
                }
            }

            if (maxDD >= limit.totalDD * 0.8) {
                if (now - this.lastTotalAlertTime > this.drawdownAlertCooldownMs) {
                    this.lastTotalAlertTime = now;
                    this.emit("drawdown_alert", {
                        type: "TOTAL",
                        marketId: m,
                        current: maxDD,
                        limit: limit.totalDD,
                        breached: maxDD >= limit.totalDD,
                    });
                }
            }
        }
    }

    public emitAccountUpdate() {
        let totalBalance = 0;
        let totalEquity = 0;
        let totalPnL = 0;
        let totalOpen = 0;
        let maxDailyDD = 0;
        let maxMaxDD = 0;

        for (const m of MARKET_IDS) {
            const acc = this.accounts[m];
            totalBalance += acc.balance;
            totalEquity += this.getEquity(m);
            totalPnL += acc.totalPnl;
            totalOpen += acc.positions.size;
            
            const dd = this.getDailyDrawdownPct(m);
            const peakDd = this.getMaxDrawdownPct(m);
            if (dd > maxDailyDD) maxDailyDD = dd;
            if (peakDd > maxMaxDD) maxMaxDD = peakDd;
        }

        this.emit("account_update", {
            balance: totalBalance,
            equity: totalEquity,
            dailyDrawdown: maxDailyDD,
            maxDrawdown: maxMaxDD,
            openPositions: totalOpen,
            totalPnl: totalPnL,
            perMarket: Array.from(MARKET_IDS).reduce((acc, m) => {
                acc[m] = {
                    balance: this.accounts[m].balance,
                    equity: this.getEquity(m),
                    totalPnl: this.accounts[m].totalPnl,
                    openPositions: this.accounts[m].positions.size,
                };
                return acc;
            }, {} as any)
        });
    }

    /** Snapshot consolidado de todas las posiciones */
    public getOpenPositionsSnapshot() {
        const positions: any[] = [];
        for (const m of MARKET_IDS) {
            const acc = this.accounts[m];
            for (const p of acc.positions.values()) {
                const margin = p.notionalValue / p.leverage;
                positions.push({
                    id: p.id,
                    symbol: p.symbol,
                    exchange: p.exchange,
                    marketId: p.marketId,
                    side: p.side,
                    entryPrice: p.entryPrice,
                    leverage: p.leverage,
                    quantity: p.quantity,
                    notionalValue: p.notionalValue,
                    unrealizedPnl: p.unrealizedPnl,
                    unrealizedPnlPct: margin > 0 ? (p.unrealizedPnl / margin) * 100 : 0,
                    stopLoss: p.stopLoss,
                    takeProfit: p.takeProfit,
                    openedAt: p.openedAt,
                    rationale: p.rationale,
                    openedBy: p.openedBy,
                });
            }
        }
        return positions;
    }
}
