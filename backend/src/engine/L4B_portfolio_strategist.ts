import { PaperPosition, PaperExecutionEngine, MARKET_IDS } from './PaperExecutionEngine';
import { L4AExecutionEngine, L4A_CONFIGS } from './L4A_execution_engine';
import { broadcastAgentLog } from '../utils/SwarmEvents';
import { MacroDataFetcher, MacroSnapshot } from './MacroDataFetcher';
import { MarkdownParser } from '../utils/MarkdownParser';

// ═══════════════════════════════════════════
// L4-B: PORTFOLIO STRATEGIST — Estratega de Cartera
// IA de alto contexto que audita trades vivos y puede sobrescribir L4-A.
// Despierta asíncronamente (cada 4h o pico de volatilidad).
// ═══════════════════════════════════════════

/**
 * Decisión de override del L4-B sobre una posición gestionada por L4-A.
 */
export interface L4BDecision {
    positionId: string;
    action: 'HOLD' | 'OVERRIDE_TP' | 'EXTEND_TRAILING' | 'CONVERT_TO_SWING' | 'FORCE_EXIT';
    overrides?: {
        takeProfit?: number;
        trailingPct?: number;
        maxHoldMinutes?: number | null;
    };
    macroRationale: string;
    timestamp: number;
}

// Interface importada desde MacroDataFetcher
/**
 * Configuración L4-B por ecosistema.
 */
interface L4BConfig {
    enabled: boolean;
    auditIntervalMs: number;     // Cada cuánto despertar (default 4h)
    volatilityThreshold: number; // VIX/ATR umbral para despertar anticipado
    canConvertToSwing: boolean;  // Puede convertir intradía → swing
    llmModel: string;            // Modelo a usar para razonamiento
}

const L4B_CONFIGS: Record<string, L4BConfig> = {
    forex: {
        enabled: true,
        auditIntervalMs: 4 * 60 * 60 * 1000, // 4 horas
        volatilityThreshold: 25,               // VIX > 25
        canConvertToSwing: true,
        llmModel: 'claude-3.5-sonnet',
    },
    crypto: {
        enabled: true,
        auditIntervalMs: 4 * 60 * 60 * 1000,
        volatilityThreshold: 30,
        canConvertToSwing: true,
        llmModel: 'claude-3.5-sonnet',
    },
    memecoins: {
        enabled: false,  // L4-B NO interviene en memes
        auditIntervalMs: Infinity,
        volatilityThreshold: Infinity,
        canConvertToSwing: false,
        llmModel: 'none',
    },
    equities: {
        enabled: true,
        auditIntervalMs: 4 * 60 * 60 * 1000,
        volatilityThreshold: 30,
        canConvertToSwing: true,
        llmModel: 'claude-3.5-sonnet',
    },
    small_caps: {
        enabled: false,  // L4-B NO interviene en small caps
        auditIntervalMs: Infinity,
        volatilityThreshold: Infinity,
        canConvertToSwing: false,
        llmModel: 'none',
    },
};

export class L4BPortfolioStrategist {
    private paperEngine: PaperExecutionEngine;
    private l4a: L4AExecutionEngine;
    private decisions: L4BDecision[] = [];
    private timers: Map<string, NodeJS.Timeout> = new Map();

    constructor(paperEngine: PaperExecutionEngine) {
        this.paperEngine = paperEngine;
        this.l4a = paperEngine.l4a;

        // Iniciar auditorías periódicas para cada mercado habilitado
        for (const marketId of MARKET_IDS) {
            const config = L4B_CONFIGS[marketId];
            if (!config || !config.enabled) continue;

            const timer = setInterval(() => {
                this.auditMarket(marketId).catch(err =>
                    console.error(`[L4-B] Audit error for ${marketId}:`, err)
                );
            }, config.auditIntervalMs);

            this.timers.set(marketId, timer);
        }

        console.log(`[L4-B] 🧠 Portfolio Strategist initialized. Active markets: ${
            MARKET_IDS.filter(m => L4B_CONFIGS[m]?.enabled).join(', ')
        }`);
    }

    /**
     * Auditoría periódica de todas las posiciones vivas de un mercado.
     * Evalúa si alguna posición debe ser overrideada.
     */
    async auditMarket(marketId: string): Promise<L4BDecision[]> {
        const config = L4B_CONFIGS[marketId];
        if (!config || !config.enabled) return [];

        const acc = this.paperEngine.accounts[marketId];
        if (!acc || acc.positions.size === 0) return [];

        console.log(`\n[L4-B][${marketId}] 🔍 Auditing ${acc.positions.size} live position(s)...`);

        // Obtener snapshot macro actual (mock en esta versión)
        const macro = await this.getMacroSnapshot(marketId);

        const decisions: L4BDecision[] = [];

        for (const [posId, pos] of acc.positions) {
            const decision = await this.evaluatePosition(pos, marketId, macro, config);
            if (decision && decision.action !== 'HOLD') {
                this.applyDecision(decision, pos);
                decisions.push(decision);
            }
        }

        this.decisions.push(...decisions);
        return decisions;
    }

    /**
     * Despierta anticipadamente ante un pico de volatilidad.
     */
    async onVolatilitySpike(marketId: string, currentVIX: number) {
        const config = L4B_CONFIGS[marketId];
        if (!config || !config.enabled) return;

        if (currentVIX >= config.volatilityThreshold) {
            console.log(`[L4-B][${marketId}] ⚡ VOLATILITY SPIKE: VIX=${currentVIX} >= threshold ${config.volatilityThreshold}. Emergency audit.`);
            broadcastAgentLog('l4b', `⚡ Vol spike! VIX=${currentVIX}. Emergency audit for ${marketId}.`, 'warn');
            await this.auditMarket(marketId);
        }
    }

    /**
     * Evalúa si una posición viva necesita override.
     * En producción: LLM pesado con contexto macro + Serie D del NotebookLM.
     */
    private async evaluatePosition(
        pos: PaperPosition,
        marketId: string,
        macro: MacroSnapshot,
        config: L4BConfig
    ): Promise<L4BDecision | null> {
        const direction = pos.side === 'LONG' ? 1 : -1;
        const holdHours = (Date.now() - pos.openedAt) / (60 * 60 * 1000);

        // 1. Inyectar la Serie D (Ontología y Reglas Institucionales)
        const policyD = MarkdownParser.getPolicyDContext(marketId);
        
        // El LLM usará `policyD` + `macro` + `pos` para razonar si debe haber un override.
        // Aquí simulamos la consciencia de esa inyección teórica:
        console.log(`[L4-B][${marketId}] 📚 Serie D (POLICY_D.md) inyectada. Tamaño empírico: ${policyD.length} bytes.`);
        
        // ── Lógica heurística temporal (hasta enchufar GPT-4o / Sonnet en el pipeline final) ──

        // Caso 1: Trade intradía rentable + macro a favor → Convertir a Swing
        if (config.canConvertToSwing && holdHours > 2 && pos.unrealizedPnlPct > 200) {
            // Bonos colapsando a favor + flujo institucional masivo
            if (
                (pos.side === 'LONG' && macro.tradfi.us10y_yield < 4.0) ||
                (pos.side === 'SHORT' && macro.tradfi.us10y_yield > 5.0)
            ) {
                return {
                    positionId: pos.id,
                    action: 'CONVERT_TO_SWING',
                    overrides: {
                        maxHoldMinutes: null, // Sin límite de tiempo
                        trailingPct: 0.8,     // Trailing más amplio
                    },
                    macroRationale: `Rendimiento 10Y = ${macro.tradfi.us10y_yield}%. Flujo institucional alineado con ${pos.side}. Convirtiendo de intradía a swing. L4-A: cancela TP inminente, amplía trailing.`,
                    timestamp: Date.now(),
                };
            }
        }

        // Caso 2: VIX disparado contra la posición → Force exit
        if (macro.tradfi.vix > 35 && pos.unrealizedPnlPct < 0) {
            return {
                positionId: pos.id,
                action: 'FORCE_EXIT',
                macroRationale: `VIX = ${macro.tradfi.vix} (crisis). PnL negativo. Force exit para proteger capital.`,
                timestamp: Date.now(),
            };
        }

        // Default: mantener
        return null;
    }

    /**
     * Aplica la decisión L4-B sobre la posición y L4-A.
     */
    private applyDecision(decision: L4BDecision, pos: PaperPosition) {
        const marketId = (pos as any).marketId || 'crypto';

        switch (decision.action) {
            case 'CONVERT_TO_SWING':
            case 'EXTEND_TRAILING':
                // Tomar control de L4-A para esta posición
                this.l4a.setL4BOverride(decision.positionId, true);

                // Aplicar overrides
                if (decision.overrides?.trailingPct && pos.trailingStop) {
                    pos.trailingStop.callbackPct = decision.overrides.trailingPct;
                }
                if (decision.overrides?.takeProfit) {
                    pos.takeProfit = decision.overrides.takeProfit;
                }
                console.log(`[L4-B][${marketId}] 🔄 OVERRIDE → ${pos.symbol}: ${decision.action} | ${decision.macroRationale}`);
                broadcastAgentLog('l4b', `Override: ${pos.symbol} → ${decision.action}`, 'warn');
                break;

            case 'OVERRIDE_TP':
                if (decision.overrides?.takeProfit) {
                    pos.takeProfit = decision.overrides.takeProfit;
                }
                console.log(`[L4-B][${marketId}] TP Override → ${pos.symbol}: TP=$${decision.overrides?.takeProfit}`);
                break;

            case 'FORCE_EXIT':
                console.log(`[L4-B][${marketId}] ❌ FORCE EXIT → ${pos.symbol}: ${decision.macroRationale}`);
                broadcastAgentLog('l4b', `FORCE EXIT: ${pos.symbol} | ${decision.macroRationale}`, 'error');
                // Cerrar al precio actual (usamos entry como fallback)
                const closePrice = pos.entryPrice + (pos.unrealizedPnl / pos.quantity);
                this.paperEngine.closePosition(pos.id, closePrice, 'CLOSED_MANUAL', marketId);
                break;
        }
    }

    /**
     * Obtiene el snapshot macro vía el orquestador global de datos exógenos.
     */
    private async getMacroSnapshot(marketId: string): Promise<MacroSnapshot> {
        return await MacroDataFetcher.getGlobalMacroSnapshot();
    }

    /**
     * Obtener decisiones recientes para telemetría.
     */
    public getRecentDecisions(limit: number = 20): L4BDecision[] {
        return this.decisions.slice(-limit);
    }

    /**
     * Cleanup de timers.
     */
    public destroy() {
        for (const [, timer] of this.timers) {
            clearInterval(timer);
        }
        this.timers.clear();
    }
}
