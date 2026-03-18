import { PaperPosition, PaperExecutionEngine } from './PaperExecutionEngine';
import { L4AAction } from './L4A_execution_engine';
import { supabase } from '../utils/supabaseClient';

// ═══════════════════════════════════════════
// POST-TRADE LOGGER — Telemetría Post-Operativa (Data Lake)
// Registra cada trade cerrado con autopsia completa para L5.
// ═══════════════════════════════════════════

/**
 * Autopsia completa de un trade cerrado.
 * Alimenta al L5 Quantitative Researcher.
 */
export interface TradeAutopsy {
    position_id: string;
    ecosystem: string;
    symbol: string;
    side: string;
    entry_price: number;
    close_price: number;
    realized_pnl: number;
    close_reason: string;
    // Contexto en el momento de apertura
    l3_rationale: string | null;
    macro_context: Record<string, any> | null;
    l4a_actions: L4AAction[];
    l4b_overrides: Record<string, any> | null;
    // MFE/MAE (calculados post-cierre, inicialmente null)
    mfe_2h: number | null;
    mae_2h: number | null;
    mfe_12h: number | null;
    mae_12h: number | null;
    mfe_48h: number | null;
    mae_48h: number | null;
    // Timestamps
    opened_at: string;
    closed_at: string;
}

export class PostTradeLogger {
    private paperEngine: PaperExecutionEngine;

    constructor(paperEngine: PaperExecutionEngine) {
        this.paperEngine = paperEngine;

        // Subscribe a cierres de posiciones
        paperEngine.on('position_closed', (pos: PaperPosition) => {
            this.logTradeAutopsy(pos).catch(err => 
                console.error(`[PostTradeLogger] Error logging autopsy:`, err)
            );
        });

        console.log(`[PostTradeLogger] 📊 Telemetry initialized. Listening for position closures.`);
    }

    /**
     * Genera y almacena la autopsia completa de un trade cerrado.
     */
    private async logTradeAutopsy(pos: PaperPosition) {
        const marketId = (pos as any).marketId || 'crypto';

        // Recoger acciones L4-A antes de que se eliminen
        const l4aActions = this.paperEngine.l4a.getActionsForPosition(pos.id);

        const autopsy: TradeAutopsy = {
            position_id: pos.id,
            ecosystem: marketId,
            symbol: pos.symbol,
            side: pos.side,
            entry_price: pos.entryPrice,
            close_price: pos.closePrice || pos.entryPrice,
            realized_pnl: pos.realizedPnl,
            close_reason: pos.status,
            l3_rationale: pos.rationale || null,
            macro_context: null, // TODO: Capturar macro context al abrir
            l4a_actions: l4aActions,
            l4b_overrides: null, // TODO: Capturar L4-B overrides
            // MFE/MAE se calculan después via cron
            mfe_2h: null, mae_2h: null,
            mfe_12h: null, mae_12h: null,
            mfe_48h: null, mae_48h: null,
            opened_at: new Date(pos.openedAt).toISOString(),
            closed_at: new Date(pos.closedAt || Date.now()).toISOString(),
        };

        try {
            const { error } = await supabase.from('trade_autopsies').insert(autopsy);
            if (error) {
                console.error(`[PostTradeLogger] ❌ Supabase insert error:`, error.message);
                return;
            }

            const emoji = pos.realizedPnl >= 0 ? '🟢' : '🔴';
            console.log(`[PostTradeLogger] ${emoji} Autopsy saved: ${pos.symbol} (${pos.side}) | PnL: $${pos.realizedPnl.toFixed(2)} | Reason: ${pos.status} | L4-A actions: ${l4aActions.length}`);
        } catch (err: any) {
            console.error(`[PostTradeLogger] ❌ Exception:`, err.message);
        }
    }

    /**
     * Consulta autopsias recientes por ecosistema (para L5).
     */
    static async getRecentAutopsies(ecosystem: string, limit: number = 50): Promise<TradeAutopsy[]> {
        try {
            const { data, error } = await supabase
                .from('trade_autopsies')
                .select('*')
                .eq('ecosystem', ecosystem)
                .order('closed_at', { ascending: false })
                .limit(limit);

            if (error) {
                console.error(`[PostTradeLogger] Query error:`, error.message);
                return [];
            }

            return data || [];
        } catch (err: any) {
            console.error(`[PostTradeLogger] Query exception:`, err.message);
            return [];
        }
    }

    /**
     * Actualiza MFE/MAE para una autopsia (llamado por cron job diferido).
     */
    static async updateMFEMAE(
        positionId: string,
        mfe: { h2: number; h12: number; h48: number },
        mae: { h2: number; h12: number; h48: number }
    ) {
        try {
            const { error } = await supabase
                .from('trade_autopsies')
                .update({
                    mfe_2h: mfe.h2,
                    mae_2h: mae.h2,
                    mfe_12h: mfe.h12,
                    mae_12h: mae.h12,
                    mfe_48h: mfe.h48,
                    mae_48h: mae.h48,
                })
                .eq('position_id', positionId);

            if (error) {
                console.error(`[PostTradeLogger] MFE/MAE update error:`, error.message);
            }
        } catch (err: any) {
            console.error(`[PostTradeLogger] MFE/MAE exception:`, err.message);
        }
    }

    /**
     * Procesamiento por lotes llamado por el CronOrchestrator (cada hora).
     * Revisa trades cerrados que aún no tienen MFE/MAE calculado y
     * si ya pasó el tiempo requerido, efectúa el cálculo.
     */
    static async processDeferredTelemetry() {
        console.log(`[Telemetry] 📡 Buscando autopsias pendientes de cálculo MFE/MAE...`);
        try {
            // Buscamos las últimas 100 sin mfe_2h
            const { data, error } = await supabase
                .from('trade_autopsies')
                .select('*')
                .is('mfe_2h', null)
                .order('closed_at', { ascending: false })
                .limit(100);

            if (error || !data) return;

            const now = Date.now();
            let processed = 0;

            for (const trade of data) {
                const closedAt = new Date(trade.closed_at).getTime();
                const hoursSinceClose = (now - closedAt) / (1000 * 60 * 60);

                // Si pasaron al menos 2 horas, mockeamos la telemetría histórica.
                // TODO: Usar APIs históricas (Binance, Alpaca, etc.) en producción.
                if (hoursSinceClose >= 2) {
                    const volatilityBase = Math.abs(trade.realized_pnl) * 0.5 || 5;
                    const mfe = {
                        h2: volatilityBase * 1.2,
                        h12: hoursSinceClose >= 12 ? volatilityBase * 2.5 : 0,
                        h48: hoursSinceClose >= 48 ? volatilityBase * 4.0 : 0
                    };
                    const mae = {
                        h2: -volatilityBase * 0.8,
                        h12: hoursSinceClose >= 12 ? -volatilityBase * 1.5 : 0,
                        h48: hoursSinceClose >= 48 ? -volatilityBase * 3.0 : 0
                    };

                    await this.updateMFEMAE(trade.position_id, mfe, mae);
                    processed++;
                }
            }

            if (processed > 0) {
                console.log(`[Telemetry] ✅ ${processed} autopsias actualizadas con MFE/MAE retroactivo.`);
            }

        } catch (err) {
            console.error(`[Telemetry] Error procesando telemetría diferida:`, err);
        }
    }
}
