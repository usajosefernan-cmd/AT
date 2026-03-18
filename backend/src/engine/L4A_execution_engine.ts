import { PaperPosition, PaperExecutionEngine } from './PaperExecutionEngine';
import { broadcastAgentState, broadcastAgentLog } from '../utils/SwarmEvents';

// ═══════════════════════════════════════════
// L4-A: EXECUTION ENGINE — Mesa de Ejecución Algorítmica
// Gestión algorítmica de posiciones vivas post-aprobación L3.
// Mandato: Táctico y Defensivo. Hit & Run.
// ═══════════════════════════════════════════

/**
 * Configuración L4-A por skill/ecosistema.
 * Cada mercado tiene reglas distintas de gestión dinámica.
 */
export interface L4AConfig {
    /** R múltiplo a partir del cual mover SL a Break-Even */
    breakEvenAtR: number;
    /** Targets de toma de beneficios parcial [{atR: 1, pct: 25}, ...] */
    partialTPs: { atR: number; pct: number }[];
    /** Callback % para trailing stop dinámico */
    trailingCallbackPct: number;
    /** Override del maxHoldMinutes (null = sin límite) */
    maxHoldMinutes: number | null;
    /** Permitir que L4-B sobrescriba las decisiones */
    allowL4BOverride: boolean;
}

/**
 * Registro de una acción L4-A ejecutada sobre una posición.
 * Se almacena para la telemetría post-operativa (Fase 3).
 */
export interface L4AAction {
    type: 'MOVE_SL_BE' | 'PARTIAL_TP' | 'ADJUST_TRAILING' | 'FORCE_CLOSE_TIME' | 'FORCE_CLOSE_L4B';
    positionId: string;
    timestamp: number;
    oldValue: number | null;
    newValue: number;
    reason: string;
}

/**
 * Estado de gestión L4-A para una posición activa.
 */
interface ManagedPosition {
    positionId: string;
    marketId: string;
    initialRisk: number;          // Distancia entry→SL en $ (el "1R")
    breakEvenApplied: boolean;
    partialTPsExecuted: number[]; // Índices de los parciales ya cobrados
    actions: L4AAction[];         // Historial de acciones para telemetría
    l4bOverride: boolean;         // Si L4-B ha tomado control
}

// ═══════════════════════════════════════════
// CONFIGS POR ECOSISTEMA
// ═══════════════════════════════════════════

export const L4A_CONFIGS: Record<string, L4AConfig> = {
    forex: {
        breakEvenAtR: 0.5,
        partialTPs: [
            { atR: 1.0, pct: 25 },
            { atR: 2.0, pct: 25 },
            { atR: 3.0, pct: 25 },
            // 25% restante queda con trailing
        ],
        trailingCallbackPct: 0.3,     // 0.3% — Forex es tight
        maxHoldMinutes: 480,           // 8 horas (sesión completa)
        allowL4BOverride: true,
    },
    crypto: {
        breakEvenAtR: 0.75,
        partialTPs: [
            { atR: 1.0, pct: 20 },
            { atR: 2.0, pct: 30 },
            { atR: 3.0, pct: 25 },
        ],
        trailingCallbackPct: 1.0,     // 1% — Crypto es más volátil
        maxHoldMinutes: null,          // Sin límite (swing OK)
        allowL4BOverride: true,
    },
    memecoins: {
        breakEvenAtR: 0.3,            // BE muy rápido — capital de supervivencia
        partialTPs: [
            { atR: 1.0, pct: 50 },    // Salvar inversión a 2x
            { atR: 2.5, pct: 25 },    // 5x total → cobrar 25% más
            // 25% restante = "moonbag" / free ride
        ],
        trailingCallbackPct: 3.0,     // 3% — Memecoins son extremas
        maxHoldMinutes: 60,            // Máximo 1 hora
        allowL4BOverride: false,       // L4-B NO interviene en memes
    },
    equities: {
        breakEvenAtR: 0.5,
        partialTPs: [
            { atR: 1.0, pct: 25 },
            { atR: 2.0, pct: 25 },
            { atR: 3.0, pct: 25 },
        ],
        trailingCallbackPct: 0.5,     // 0.5%
        maxHoldMinutes: null,          // Position trading OK
        allowL4BOverride: true,
    },
    small_caps: {
        breakEvenAtR: 0.3,            // BE rápido — volatilidad extrema
        partialTPs: [
            { atR: 1.0, pct: 25 },
            { atR: 2.0, pct: 25 },
            { atR: 3.0, pct: 25 },
        ],
        trailingCallbackPct: 5.0,     // 5% — Trailing amplio por volatilidad
        maxHoldMinutes: 30,            // Cerrar antes del cierre
        allowL4BOverride: false,       // L4-B NO interviene en small caps
    },
};

// ═══════════════════════════════════════════
// L4-A ENGINE CLASS
// ═══════════════════════════════════════════

export class L4AExecutionEngine {
    private managedPositions: Map<string, ManagedPosition> = new Map();
    private paperEngine: PaperExecutionEngine;

    constructor(paperEngine: PaperExecutionEngine) {
        this.paperEngine = paperEngine;

        // Subscribe a nuevas posiciones abiertas
        paperEngine.on('position_opened', (pos: PaperPosition) => {
            this.registerPosition(pos);
        });

        // Subscribe a cierres para limpiar
        paperEngine.on('position_closed', (pos: PaperPosition) => {
            this.unregisterPosition(pos.id);
        });

        console.log(`[L4-A] ⚡ Execution Engine initialized. Listening for positions.`);
    }

    /**
     * Registra una posición nueva para gestión L4-A.
     * Calcula el "1R" (riesgo inicial) basado en entry→SL.
     */
    private registerPosition(pos: PaperPosition) {
        const marketId = (pos as any).marketId || 'crypto';
        const config = L4A_CONFIGS[marketId];
        if (!config) {
            console.warn(`[L4-A] No config for market ${marketId}, skipping.`);
            return;
        }

        // Calcular 1R = distancia entry→SL
        let initialRisk = 0;
        if (pos.stopLoss !== null) {
            initialRisk = Math.abs(pos.entryPrice - pos.stopLoss);
        } else {
            // Si no hay SL, usar 1% del entry como proxy
            initialRisk = pos.entryPrice * 0.01;
        }

        const managed: ManagedPosition = {
            positionId: pos.id,
            marketId,
            initialRisk,
            breakEvenApplied: false,
            partialTPsExecuted: [],
            actions: [],
            l4bOverride: false,
        };

        this.managedPositions.set(pos.id, managed);

        console.log(`[L4-A][${marketId}] 📋 Registered ${pos.symbol} | 1R = $${initialRisk.toFixed(4)} | Config: BE@${config.breakEvenAtR}R, ${config.partialTPs.length} partials`);
        broadcastAgentLog('l4a', `Position registered: ${pos.symbol} (${pos.side}) | 1R=$${initialRisk.toFixed(2)}`, 'info');
    }

    /**
     * Limpia la posición de la gestión.
     */
    private unregisterPosition(positionId: string) {
        const managed = this.managedPositions.get(positionId);
        if (managed) {
            console.log(`[L4-A] 🗑️ Unregistered ${positionId} | ${managed.actions.length} actions recorded.`);
            this.managedPositions.delete(positionId);
        }
    }

    /**
     * Obtiene el historial de acciones L4-A para telemetría.
     */
    public getActionsForPosition(positionId: string): L4AAction[] {
        return this.managedPositions.get(positionId)?.actions || [];
    }

    /**
     * L4-B puede marcar una posición como "override" para tomar control.
     */
    public setL4BOverride(positionId: string, override: boolean) {
        const managed = this.managedPositions.get(positionId);
        if (managed) {
            const config = L4A_CONFIGS[managed.marketId];
            if (config && !config.allowL4BOverride) {
                console.warn(`[L4-A] ❌ L4-B override DENIED for ${managed.marketId} — config prohibits it.`);
                return;
            }
            managed.l4bOverride = override;
            console.log(`[L4-A] 🔄 L4-B override ${override ? 'ACTIVATED' : 'DEACTIVATED'} for ${positionId}`);
        }
    }

    /**
     * TICK HANDLER — Llamado en cada tick de precio para cada posición gestionada.
     * Este es el corazón del L4-A. Evalúa si debe ejecutar alguna acción.
     */
    public onTick(positionId: string, currentPrice: number) {
        const managed = this.managedPositions.get(positionId);
        if (!managed || managed.l4bOverride) return; // L4-B has control

        const pos = this.findPosition(managed.marketId, positionId);
        if (!pos || pos.status !== 'OPEN') return;

        const config = L4A_CONFIGS[managed.marketId];
        if (!config) return;

        const direction = pos.side === 'LONG' ? 1 : -1;
        const priceDelta = (currentPrice - pos.entryPrice) * direction;
        const currentR = managed.initialRisk > 0 ? priceDelta / managed.initialRisk : 0;

        // ── 1. BREAK-EVEN ──
        if (!managed.breakEvenApplied && currentR >= config.breakEvenAtR) {
            this.applyBreakEven(pos, managed, config);
        }

        // ── 2. PARTIAL TAKE-PROFITS ──
        for (let i = 0; i < config.partialTPs.length; i++) {
            if (managed.partialTPsExecuted.includes(i)) continue;
            const tp = config.partialTPs[i];
            if (currentR >= tp.atR) {
                this.applyPartialTP(pos, managed, config, i, currentPrice);
            }
        }

        // ── 3. TRAILING STOP (dynamic) ──
        this.applyDynamicTrailing(pos, managed, config, currentPrice);

        // ── 4. TIME LIMIT ──
        if (config.maxHoldMinutes !== null) {
            const holdMs = Date.now() - pos.openedAt;
            const holdMin = holdMs / 60_000;
            if (holdMin >= config.maxHoldMinutes) {
                this.forceCloseTime(pos, managed, config, currentPrice);
            }
        }
    }

    // ── BREAK-EVEN ──
    private applyBreakEven(pos: PaperPosition, managed: ManagedPosition, config: L4AConfig) {
        const oldSL = pos.stopLoss;
        pos.stopLoss = pos.entryPrice; // Mover SL a entry
        managed.breakEvenApplied = true;

        const action: L4AAction = {
            type: 'MOVE_SL_BE',
            positionId: pos.id,
            timestamp: Date.now(),
            oldValue: oldSL,
            newValue: pos.entryPrice,
            reason: `Break-Even activado a ${config.breakEvenAtR}R. Capital protegido.`,
        };
        managed.actions.push(action);

        console.log(`[L4-A][${managed.marketId}] 🛡️ BREAK-EVEN → ${pos.symbol} SL moved to $${pos.entryPrice.toFixed(4)}`);
        broadcastAgentState('l4a', 'break_even', `${pos.symbol} SL → BE`, 'success');
    }

    // ── PARTIAL TAKE-PROFIT ──
    private applyPartialTP(
        pos: PaperPosition,
        managed: ManagedPosition,
        config: L4AConfig,
        tpIndex: number,
        currentPrice: number
    ) {
        const tp = config.partialTPs[tpIndex];
        const closeQtyPct = tp.pct / 100;
        const closeQty = pos.quantity * closeQtyPct;

        // Reducir la posición en lugar de cerrarla completamente
        const direction = pos.side === 'LONG' ? 1 : -1;
        const partialPnl = (currentPrice - pos.entryPrice) * closeQty * direction;

        // Actualizar posición: reducir quantity y notional
        pos.quantity -= closeQty;
        pos.notionalValue = pos.quantity * pos.entryPrice;

        // Acreditar PnL parcial al balance
        const acc = this.paperEngine.accounts[managed.marketId];
        if (acc) {
            acc.balance += partialPnl;
            acc.totalPnl += partialPnl;
            if (acc.balance > acc.peakBalance) acc.peakBalance = acc.balance;
        }

        managed.partialTPsExecuted.push(tpIndex);

        const action: L4AAction = {
            type: 'PARTIAL_TP',
            positionId: pos.id,
            timestamp: Date.now(),
            oldValue: pos.quantity + closeQty,
            newValue: pos.quantity,
            reason: `Partial TP ${tpIndex + 1}/${config.partialTPs.length}: ${tp.pct}% closed at ${tp.atR}R ($${currentPrice.toFixed(4)}). PnL: $${partialPnl.toFixed(2)}.`,
        };
        managed.actions.push(action);

        const emoji = partialPnl >= 0 ? '🟢' : '🔴';
        console.log(`[L4-A][${managed.marketId}] ${emoji} PARTIAL TP ${tpIndex + 1} → ${pos.symbol} | ${tp.pct}% @ ${tp.atR}R | PnL: $${partialPnl.toFixed(2)}`);
        broadcastAgentState('l4a', 'partial_tp', `${pos.symbol} ${tp.pct}% @ ${tp.atR}R +$${partialPnl.toFixed(2)}`, 'success');
    }

    // ── DYNAMIC TRAILING STOP ──
    private applyDynamicTrailing(
        pos: PaperPosition,
        managed: ManagedPosition,
        config: L4AConfig,
        currentPrice: number
    ) {
        // Solo activar trailing después de que BE esté aplicado
        if (!managed.breakEvenApplied) return;

        // Si la posición ya tiene trailing activo en PaperEngine, dejarlo
        // Solo establecer trailing si no existe
        if (!pos.trailingStop || !pos.trailingStop.active) {
            pos.trailingStop = {
                activationPct: 0, // Ya activado (BE ya se aplicó)
                callbackPct: config.trailingCallbackPct,
                active: true,
                highestPrice: pos.side === 'LONG' ? currentPrice : undefined,
                lowestPrice: pos.side === 'SHORT' ? currentPrice : undefined,
            };

            const action: L4AAction = {
                type: 'ADJUST_TRAILING',
                positionId: pos.id,
                timestamp: Date.now(),
                oldValue: null,
                newValue: config.trailingCallbackPct,
                reason: `Trailing Stop activated at ${config.trailingCallbackPct}% callback after Break-Even.`,
            };
            managed.actions.push(action);

            console.log(`[L4-A][${managed.marketId}] 📈 TRAILING activated → ${pos.symbol} | Callback: ${config.trailingCallbackPct}%`);
        }
    }

    // ── FORCE CLOSE (TIME LIMIT) ──
    private forceCloseTime(
        pos: PaperPosition,
        managed: ManagedPosition,
        config: L4AConfig,
        currentPrice: number
    ) {
        const holdMin = (Date.now() - pos.openedAt) / 60_000;

        const action: L4AAction = {
            type: 'FORCE_CLOSE_TIME',
            positionId: pos.id,
            timestamp: Date.now(),
            oldValue: null,
            newValue: currentPrice,
            reason: `Time limit reached: ${holdMin.toFixed(0)}min >= ${config.maxHoldMinutes}min. Force closing.`,
        };
        managed.actions.push(action);

        console.log(`[L4-A][${managed.marketId}] ⏰ TIME LIMIT → Force closing ${pos.symbol} at $${currentPrice.toFixed(4)}`);
        broadcastAgentState('l4a', 'force_close', `${pos.symbol} time limit ${config.maxHoldMinutes}min`, 'error');

        this.paperEngine.closePosition(pos.id, currentPrice, 'CLOSED_MANUAL', managed.marketId);
    }

    /**
     * Helper to find position from PaperEngine across markets.
     */
    private findPosition(marketId: string, positionId: string): PaperPosition | undefined {
        return this.paperEngine.accounts[marketId]?.positions.get(positionId);
    }

    /**
     * Get all currently managed positions (for dashboard/debugging).
     */
    public getManagedSnapshot(): Array<{
        positionId: string;
        marketId: string;
        breakEvenApplied: boolean;
        partialsPct: number;
        actionsCount: number;
        l4bOverride: boolean;
    }> {
        const result: any[] = [];
        for (const [id, m] of this.managedPositions) {
            const config = L4A_CONFIGS[m.marketId];
            const totalPartials = config?.partialTPs.length || 0;
            result.push({
                positionId: id,
                marketId: m.marketId,
                breakEvenApplied: m.breakEvenApplied,
                partialsPct: totalPartials > 0 ? (m.partialTPsExecuted.length / totalPartials) * 100 : 0,
                actionsCount: m.actions.length,
                l4bOverride: m.l4bOverride,
            });
        }
        return result;
    }
}
