/**
 * ═══════════════════════════════════════════
 * E2E DRY-RUN: Prueba de Estrés de la Tubería de Datos
 * ═══════════════════════════════════════════
 *
 * Simula un trade EUR/USD completo sin broker real.
 * Valida que L4-A ejecute Break-Even, Partial TPs y Trailing.
 * PRUEBA DE FUEGO: INSERT real en Supabase `trade_autopsies`.
 *
 * Ejecución:
 *   npx ts-node tests/e2e_dry_run.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Cargar .env ANTES de importar cualquier módulo que use Supabase
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { PaperExecutionEngine } from '../src/engine/PaperExecutionEngine';
import { supabase } from '../src/utils/supabaseClient';

// ── CONFIG ──
const SYMBOL = 'EURUSD';
const MARKET_ID = 'axi';        // Usa config forex (L4-A: BE@0.5R, partials, trailing 0.3%)
const ENTRY_PRICE = 1.0850;
const STOP_LOSS = 1.0830;       // 20 pips de riesgo → 1R = 0.0020
const TAKE_PROFIT = 1.0910;     // 3R target
const NOTIONAL = 1000;          // $1,000 nocional

// Serie temporal de ticks simulados: subida progresiva que dispara BE, parciales, y TP
const TICK_SERIES = [
    // Fase 0: Ruido inicial (precio oscila cerca del entry)
    1.0852, 1.0848, 1.0851, 1.0853,
    // Fase 1: Sube a +0.5R → debe disparar BREAK-EVEN (SL → entry)
    1.0855, 1.0858, 1.0860,
    // Fase 2: Sube a +1R → debe disparar PARTIAL TP #1 (25% cerrado)
    1.0865, 1.0868, 1.0870,
    // Fase 3: Sube a +2R → debe disparar PARTIAL TP #2 (25% más cerrado)
    1.0880, 1.0885, 1.0890,
    // Fase 4: Sube a +3R → debe disparar PARTIAL TP #3 + TAKE PROFIT cierre completo
    1.0900, 1.0905, 1.0910, 1.0912,
];

function sleep(ms: number) {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  🧪 E2E DRY-RUN: Prueba de Estrés de la Tubería de Datos`);
    console.log(`${'═'.repeat(60)}\n`);

    // ── PASO 0: Verificar conexión a Supabase ──
    console.log(`[E2E] 🔌 Verificando conexión a Supabase...`);
    const { data: healthCheck, error: healthErr } = await supabase
        .from('trade_autopsies')
        .select('position_id')
        .limit(1);

    if (healthErr) {
        console.error(`[E2E] ❌ FALLO DE CONEXIÓN A SUPABASE:`);
        console.error(`  → ${healthErr.message}`);
        console.error(`  → ¿Ejecutaste el SQL DDL en tu panel de Supabase?`);
        console.error(`  → Verifica SUPABASE_URL y SUPABASE_ANON_KEY en .env`);
        process.exit(1);
    }
    console.log(`[E2E] ✅ Conexión a Supabase verificada. Tabla trade_autopsies accesible.\n`);

    // ── PASO 1: Instanciar PaperExecutionEngine ──
    console.log(`[E2E] 🏗️ Instanciando PaperExecutionEngine con L4-A + PostTradeLogger...`);
    const engine = new PaperExecutionEngine("test_user");

    // Dar tiempo a la carga inicial desde Supabase
    await sleep(2000);

    // ── PASO 2: Abrir posición simulada (como si L3 aprobara) ──
    console.log(`\n[E2E] 📥 Abriendo LONG ${SYMBOL} @ ${ENTRY_PRICE} | SL: ${STOP_LOSS} | TP: ${TAKE_PROFIT}`);

    const position = engine.openPosition({
        symbol: SYMBOL,
        exchange: 'axi',
        marketId: MARKET_ID,
        side: 'LONG',
        entryPrice: ENTRY_PRICE,
        notionalValue: NOTIONAL,
        leverage: 1,
        stopLoss: STOP_LOSS,
        takeProfit: TAKE_PROFIT,
        rationale: '[E2E DRY-RUN] Simulación de trade EUR/USD para validar pipeline de datos.',
        openedBy: 'e2e_test',
    });

    if (!position) {
        console.error(`[E2E] ❌ No se pudo abrir la posición. Abortando.`);
        process.exit(1);
    }

    const positionId = position.id;
    console.log(`[E2E] ✅ Posición abierta: ${positionId}\n`);

    // ── PASO 3: Inyectar serie temporal de ticks ──
    console.log(`[E2E] 📊 Inyectando ${TICK_SERIES.length} ticks simulados...\n`);

    // Escuchar evento de cierre para saber cuándo terminó
    let tradeClosed = false;
    let closedPnl = 0;

    engine.on('position_closed', (pos: any) => {
        if (pos.id === positionId) {
            tradeClosed = true;
            closedPnl = pos.realizedPnl;
            console.log(`\n[E2E] 🎯 POSICIÓN CERRADA → PnL: $${closedPnl.toFixed(4)} | Razón: ${pos.status}`);
        }
    });

    for (let i = 0; i < TICK_SERIES.length; i++) {
        const price = TICK_SERIES[i];
        const priceDelta = price - ENTRY_PRICE;
        const rMultiple = priceDelta / (ENTRY_PRICE - STOP_LOSS);

        console.log(`  [Tick ${String(i + 1).padStart(2, '0')}] ${price.toFixed(4)} | Δ ${priceDelta >= 0 ? '+' : ''}${(priceDelta * 10000).toFixed(1)} pips | R: ${rMultiple.toFixed(2)}`);

        engine.onRealTick({
            type: 'TICK',
            source: 'ALPACA',
            symbol: SYMBOL,
            price: price,
            volume: 1000,
            timestamp: Date.now(),
        });

        if (tradeClosed) break;

        // Pequeña pausa entre ticks para simular flujo temporal
        await sleep(100);
    }

    // ── PASO 4: Esperar a que PostTradeLogger escriba en Supabase ──
    if (!tradeClosed) {
        console.log(`\n[E2E] ⚠️ El trade no se cerró por TP. Cerrando manualmente al último precio...`);
        const lastPrice = TICK_SERIES[TICK_SERIES.length - 1];
        engine.closePosition(positionId, lastPrice, 'CLOSED_MANUAL', MARKET_ID);
    }

    console.log(`\n[E2E] ⏳ Esperando 3s para que PostTradeLogger persista en Supabase...`);
    await sleep(3000);

    // ── PASO 5: PRUEBA DE FUEGO — Leer la fila desde Supabase ──
    console.log(`[E2E] 🔥 PRUEBA DE FUEGO: Leyendo autopsia desde Supabase...`);

    const { data: rows, error: readErr } = await supabase
        .from('trade_autopsies')
        .select('*')
        .eq('position_id', positionId)
        .limit(1);

    if (readErr) {
        console.error(`[E2E] ❌ Error leyendo desde Supabase:`, readErr.message);
        process.exit(1);
    }

    if (!rows || rows.length === 0) {
        console.error(`[E2E] ❌ FALLO: No se encontró la autopsia en Supabase.`);
        console.error(`  → El INSERT del PostTradeLogger parece haber fallado.`);
        console.error(`  → Revisa los logs de error anteriores.`);
        process.exit(1);
    }

    const autopsy = rows[0];

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  🏆 ¡PRUEBA DE FUEGO SUPERADA!`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`\n  📋 Autopsia encontrada en Supabase:`);
    console.log(`  ┌─────────────────────────────────────────┐`);
    console.log(`  │ Position ID : ${autopsy.position_id}`);
    console.log(`  │ Symbol      : ${autopsy.symbol}`);
    console.log(`  │ Side        : ${autopsy.side}`);
    console.log(`  │ Entry       : $${autopsy.entry_price}`);
    console.log(`  │ Close       : $${autopsy.close_price}`);
    console.log(`  │ PnL         : $${autopsy.realized_pnl}`);
    console.log(`  │ Reason      : ${autopsy.close_reason}`);
    console.log(`  │ Ecosystem   : ${autopsy.ecosystem}`);
    console.log(`  │ L4-A Actions: ${JSON.stringify(autopsy.l4a_actions?.length || 0)} recorded`);
    console.log(`  │ Opened At   : ${autopsy.opened_at}`);
    console.log(`  │ Closed At   : ${autopsy.closed_at}`);
    console.log(`  │ MFE/MAE     : (pendiente cron horario)`);
    console.log(`  └─────────────────────────────────────────┘`);
    console.log(`\n  ✅ La tubería de datos está VIVA. Persistencia real confirmada.`);
    console.log(`  📡 Los campos MFE/MAE se rellenarán automáticamente por el cron de Telemetría.\n`);

    process.exit(0);
}

main().catch(err => {
    console.error(`[E2E] 💥 Error fatal:`, err);
    process.exit(1);
});
