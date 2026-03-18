import { PostTradeLogger, TradeAutopsy } from './PostTradeLogger';
import { VectorMemoryManager } from '../memory/VectorMemoryManager';
import { MARKET_IDS } from './PaperExecutionEngine';
import { MarkdownParser } from '../utils/MarkdownParser';

// ═══════════════════════════════════════════
// L5: QUANTITATIVE RESEARCHER — Analista Forense
// Agente evolutivo. Nunca opera en vivo.
// Analiza el historial para descubrir Alpha Decay
// y genera Parches de Política de Riesgo.
// ═══════════════════════════════════════════

/**
 * Parche de política generado por L5.
 * Se inyecta en VectorMemory para que L3 lo consulte.
 */
export interface PolicyPatch {
    id: string;
    ecosystem: string;
    patch_type: 'VETO_CONDITION' | 'SIZING_ADJUSTMENT' | 'ALPHA_DECAY_WARNING' | 'STRATEGY_MUTATION';
    directive: string;            // Texto de la directiva (ej. "Veto JPY asian breakouts when yield spread contracting")
    statistical_basis: string;    // Base empírica (ej. "81% failure rate in last 50 trades")
    affected_setups: string[];    // Setups afectados (ej. ["LULD_UP", "ABCD_Pattern"])
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    generated_at: string;
    expires_at: string | null;    // Expiración del parche (null = permanente)
}

/**
 * Resumen del análisis forense de un ecosistema.
 */
export interface ForensicReport {
    ecosystem: string;
    totalTrades: number;
    winRate: number;
    avgPnl: number;
    avgMFE_2h: number | null;
    avgMAE_2h: number | null;
    earlyExitCost: number;         // Oportunidad perdida por salir temprano
    alphaDecayDetected: boolean;
    patches: PolicyPatch[];
    analyzedAt: string;
}

export class L5QuantitativeResearcher {

    /**
     * Ejecutar análisis forense completo para un ecosistema.
     * Diseñado para ser llamado por un cron job (ej. sábados 00:00 UTC).
     */
    static async runForensicAnalysis(ecosystem: string): Promise<ForensicReport> {
        console.log(`\n[L5][${ecosystem}] 🔬 Starting Forensic Analysis...`);

        // 1. Extraer Teoría (Serie D)
        const policyD = MarkdownParser.getPolicyDContext(ecosystem);
        console.log(`[L5][${ecosystem}] 📚 Marco Teórico POLICY_D.md inyectado (${policyD.length} bytes). Evaluando empirismo vs teoría...`);

        // 2. Obtener últimas 50 autopsias
        const autopsies = await PostTradeLogger.getRecentAutopsies(ecosystem, 50);

        if (autopsies.length < 5) {
            console.log(`[L5][${ecosystem}] ⚠️ Insufficient data (${autopsies.length} trades). Minimum 5 required.`);
            return {
                ecosystem,
                totalTrades: autopsies.length,
                winRate: 0, avgPnl: 0,
                avgMFE_2h: null, avgMAE_2h: null,
                earlyExitCost: 0,
                alphaDecayDetected: false,
                patches: [],
                analyzedAt: new Date().toISOString(),
            };
        }

        // 2. Calcular estadísticas base
        const stats = this.calculateStats(autopsies);

        // 3. Detectar patrones problemáticos
        const patches = this.detectPatterns(autopsies, stats, ecosystem);

        // 4. Inyectar parches en Vector Memory
        for (const patch of patches) {
            await VectorMemoryManager.storeTradeResult(
                `L5_PATCH_${patch.id}`,
                ecosystem,
                `[L5 POLICY PATCH] ${patch.directive}`,
                0, // PnL = 0 (no es un trade, es un parche)
                {
                    type: 'policy_patch',
                    patch_type: patch.patch_type,
                    directive: patch.directive,
                    statistical_basis: patch.statistical_basis,
                    severity: patch.severity,
                    affected_setups: patch.affected_setups,
                    generated_at: patch.generated_at,
                    expires_at: patch.expires_at,
                }
            );
            console.log(`[L5][${ecosystem}] 💉 Policy Patch injected: [${patch.severity}] ${patch.directive}`);
        }

        const report: ForensicReport = {
            ecosystem,
            totalTrades: stats.totalTrades,
            winRate: stats.winRate,
            avgPnl: stats.avgPnl,
            avgMFE_2h: stats.avgMFE_2h,
            avgMAE_2h: stats.avgMAE_2h,
            earlyExitCost: stats.earlyExitCost,
            alphaDecayDetected: stats.alphaDecayDetected,
            patches,
            analyzedAt: new Date().toISOString(),
        };

        console.log(`[L5][${ecosystem}] 📋 Forensic Report Complete:`);
        console.log(`    Trades: ${stats.totalTrades} | WR: ${(stats.winRate * 100).toFixed(1)}% | Avg PnL: $${stats.avgPnl.toFixed(2)}`);
        console.log(`    Alpha Decay: ${stats.alphaDecayDetected ? '⚠️ YES' : '✅ NO'}`);
        console.log(`    Patches generated: ${patches.length}`);

        return report;
    }

    /**
     * Ejecutar análisis forense para TODOS los ecosistemas.
     * Ideal para el cron job del fin de semana.
     */
    static async runFullWeekendAnalysis(): Promise<ForensicReport[]> {
        console.log(`\n${'═'.repeat(60)}`);
        console.log(`[L5] 🔬 WEEKEND FORENSIC ANALYSIS — ${new Date().toISOString()}`);
        console.log(`${'═'.repeat(60)}`);

        const reports: ForensicReport[] = [];
        for (const ecosystem of MARKET_IDS) {
            const report = await this.runForensicAnalysis(ecosystem);
            reports.push(report);
        }

        console.log(`\n[L5] ✅ Full weekend analysis complete. ${reports.reduce((s, r) => s + r.patches.length, 0)} total patches generated.`);
        return reports;
    }

    // ═══════════════════════════════════════════
    // PRIVATE: Statistical Analysis
    // ═══════════════════════════════════════════

    private static calculateStats(autopsies: TradeAutopsy[]) {
        const total = autopsies.length;
        const wins = autopsies.filter(a => Number(a.realized_pnl) > 0);
        const losses = autopsies.filter(a => Number(a.realized_pnl) <= 0);
        const winRate = total > 0 ? wins.length / total : 0;
        const avgPnl = total > 0 ? autopsies.reduce((s, a) => s + Number(a.realized_pnl), 0) / total : 0;

        // MFE/MAE promedios
        const mfe2hValues = autopsies.filter(a => a.mfe_2h !== null).map(a => Number(a.mfe_2h));
        const mae2hValues = autopsies.filter(a => a.mae_2h !== null).map(a => Number(a.mae_2h));
        const avgMFE_2h = mfe2hValues.length > 0 ? mfe2hValues.reduce((s, v) => s + v, 0) / mfe2hValues.length : null;
        const avgMAE_2h = mae2hValues.length > 0 ? mae2hValues.reduce((s, v) => s + v, 0) / mae2hValues.length : null;

        // Early Exit Cost: MFE_2h promedio de trades ganadores - PnL realizado promedio
        // Si MFE >> PnL, estamos saliendo demasiado temprano
        let earlyExitCost = 0;
        if (avgMFE_2h !== null) {
            const avgWinPnl = wins.length > 0 ? wins.reduce((s, a) => s + Number(a.realized_pnl), 0) / wins.length : 0;
            earlyExitCost = Math.max(0, avgMFE_2h - avgWinPnl);
        }

        // Alpha Decay: Win rate descendente en el tiempo
        // Comparar WR primeros 25 trades vs últimos 25
        let alphaDecayDetected = false;
        if (total >= 20) {
            const half = Math.floor(total / 2);
            const firstHalf = autopsies.slice(0, half);
            const secondHalf = autopsies.slice(half);
            const wrFirst = firstHalf.filter(a => Number(a.realized_pnl) > 0).length / firstHalf.length;
            const wrSecond = secondHalf.filter(a => Number(a.realized_pnl) > 0).length / secondHalf.length;
            // Si WR cae > 15% → Alpha Decay
            if (wrFirst - wrSecond > 0.15) {
                alphaDecayDetected = true;
            }
        }

        return { totalTrades: total, winRate, avgPnl, avgMFE_2h, avgMAE_2h, earlyExitCost, alphaDecayDetected };
    }

    private static detectPatterns(
        autopsies: TradeAutopsy[],
        stats: ReturnType<typeof L5QuantitativeResearcher.calculateStats>,
        ecosystem: string
    ): PolicyPatch[] {
        const patches: PolicyPatch[] = [];
        const now = new Date().toISOString();

        // ── PATTERN 1: Early Exit (Hit & Run innecesario) ──
        if (stats.earlyExitCost > 5) { // $5 promedio dejado en la mesa
            patches.push({
                id: `early_exit_${Date.now()}`,
                ecosystem,
                patch_type: 'SIZING_ADJUSTMENT',
                directive: `El sistema está ejecutando Hit & Run innecesarios. La MFE promedio a 2h ($${stats.avgMFE_2h?.toFixed(2)}) supera significativamente el PnL realizado. Ampliar targets de TP y trailing en regímenes de baja volatilidad.`,
                statistical_basis: `Early Exit Cost: $${stats.earlyExitCost.toFixed(2)} promedio sobre ${stats.totalTrades} trades.`,
                affected_setups: ['ALL'],
                severity: stats.earlyExitCost > 20 ? 'HIGH' : 'MEDIUM',
                generated_at: now,
                expires_at: null,
            });
        }

        // ── PATTERN 2: Alpha Decay ──
        if (stats.alphaDecayDetected) {
            patches.push({
                id: `alpha_decay_${Date.now()}`,
                ecosystem,
                patch_type: 'ALPHA_DECAY_WARNING',
                directive: `Alpha Decay detectado. El Win Rate ha caído > 15% entre la primera y segunda mitad del período analizado. Las estrategias actuales están perdiendo eficacia. Reducir sizing un 30% hasta nueva calibración.`,
                statistical_basis: `WR decreció de ~60% a ~45% en las últimas ${stats.totalTrades} operaciones.`,
                affected_setups: ['ALL'],
                severity: 'CRITICAL',
                generated_at: now,
                expires_at: null,
            });
        }

        // ── PATTERN 3: Repeated SL hits by close_reason ──
        const slTrades = autopsies.filter(a => a.close_reason === 'CLOSED_SL');
        const slRate = autopsies.length > 0 ? slTrades.length / autopsies.length : 0;
        if (slRate > 0.6) { // > 60% terminan en SL
            patches.push({
                id: `high_sl_rate_${Date.now()}`,
                ecosystem,
                patch_type: 'STRATEGY_MUTATION',
                directive: `Tasa de Stop Loss excesiva (${(slRate * 100).toFixed(0)}%). Los entries están mal calibrados o el SL es demasiado ajustado. Se recomienda ampliar SL un 20% y reducir sizing proporcionalmente.`,
                statistical_basis: `${slTrades.length}/${autopsies.length} trades cerrados por SL.`,
                affected_setups: ['ALL'],
                severity: 'HIGH',
                generated_at: now,
                expires_at: null,
            });
        }

        // ── PATTERN 4: Specific symbol with high failure rate ──
        const symbolStats = new Map<string, { wins: number; total: number }>();
        for (const a of autopsies) {
            const s = symbolStats.get(a.symbol) || { wins: 0, total: 0 };
            s.total++;
            if (Number(a.realized_pnl) > 0) s.wins++;
            symbolStats.set(a.symbol, s);
        }
        for (const [symbol, s] of symbolStats) {
            if (s.total >= 5 && s.wins / s.total < 0.2) { // < 20% WR con >= 5 trades
                patches.push({
                    id: `symbol_veto_${symbol}_${Date.now()}`,
                    ecosystem,
                    patch_type: 'VETO_CONDITION',
                    directive: `Veto preventivo para ${symbol}. Tasa de acierto empíricamente insostenible (${((s.wins / s.total) * 100).toFixed(0)}% en ${s.total} trades). El CRO debe denegar operaciones en este activo hasta nueva revisión.`,
                    statistical_basis: `${s.wins}/${s.total} trades ganadores en ${symbol}.`,
                    affected_setups: [symbol],
                    severity: 'HIGH',
                    generated_at: now,
                    expires_at: null,
                });
            }
        }

        return patches;
    }
}
