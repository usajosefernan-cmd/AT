import * as cron from 'node-cron';
import { PaperExecutionEngine, MARKET_IDS } from './PaperExecutionEngine';
import { PostTradeLogger } from './PostTradeLogger';
import { L5QuantitativeResearcher } from './L5_quantitative_researcher';
import { broadcastAgentLog } from '../utils/SwarmEvents';

// ═══════════════════════════════════════════
// CRON ORCHESTRATOR — El Reloj Institucional
// Dispara los procesos asíncronos corporativos:
// 1. Auditoría L4-B (Manejo de Posiciones vivas y macro)
// 2. Telemetría MFE/MAE Tracker
// 3. L5 Batch Processing (Generación Parches Políticas)
// ═══════════════════════════════════════════

export class CronOrchestrator {
    private engine: PaperExecutionEngine;
    private tasks: cron.ScheduledTask[] = [];

    constructor(engine: PaperExecutionEngine) {
        this.engine = engine;
        console.log(`\n[CronOrchestrator] ⏱️ Initializing Institutional Clocks...`);
        this.startL4BCron();
        this.startTelemetryCron();
        this.startL5Cron();
    }

    /**
     * Cron L4-B (Supervisión de Cartera): Ejecución cada 4 horas
     * Itera sobre trades abiertos. Despierta a L4-B, le inyecta el MacroDataFetcher y POLICY_D.md
     * y evalúa si debe sobreescribir al L4-A.
     */
    private startL4BCron() {
        const task = cron.schedule('0 */4 * * *', async () => {
            console.log(`[Cron] ⏰ Ejecutando supervisión rutinaria L4-B (cada 4hrs)...`);
            broadcastAgentLog('system', 'Iniciando auditoría de cartera L4-B', 'info');
            for (const marketId of MARKET_IDS) {
                try {
                    await this.engine.l4b.auditMarket(marketId);
                } catch (err) {
                    console.error(`[Cron] Error en auditoría L4-B para ${marketId}:`, err);
                }
            }
        });
        this.tasks.push(task);
    }

    /**
     * Cron Telemetría Diferida (MFE/MAE Tracker): Ejecución cada hora (0 * * * *)
     * Revisa trades cerrados hace 2h/12h/48h y rellena Maximum Favorable/Adverse Excursion.
     * Vital para la función de Alpha Decay de L5.
     */
    private startTelemetryCron() {
        const task = cron.schedule('0 * * * *', async () => {
            console.log(`[Cron] 📡 Actualizando Telemetría MFE/MAE (cada hora)...`);
            try {
                await PostTradeLogger.processDeferredTelemetry();
            } catch (err) {
                console.error(`[Cron] Error procesando telemetría diferida:`, err);
            }
        });
        this.tasks.push(task);
    }

    /**
     * Cron L5 (Batch Forense): Ejecución Sabados a las 02:00 AM (0 2 * * 6)
     * Extrae Supabase, cruza con POLICY_D.md, detecta Alpha Decay y guarda Parches Evolutivos.
     */
    private startL5Cron() {
        const task = cron.schedule('0 2 * * 6', async () => {
            console.log(`[Cron] 🔬 Ejecutando Investigación Forense Semanal (L5)...`);
            broadcastAgentLog('system', 'L5 iniciando batch processing forense (Fin de semana)', 'info');
            try {
                await L5QuantitativeResearcher.runFullWeekendAnalysis();
            } catch (err) {
                console.error(`[Cron] Error en Análisis Forense L5:`, err);
            }
        });
        this.tasks.push(task);
    }

    /**
     * Destruye de forma segura todos los crons al apagar el servidor.
     */
    public destroy() {
        for (const task of this.tasks) {
            task.stop();
        }
        this.tasks = [];
        console.log(`[CronOrchestrator] 🛑 Relojes detenidos.`);
    }
}
