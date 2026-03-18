/**
 * TradingTools.ts
 * 
 * Definiciones de herramientas (Function Calling / Tool Use) que los LLMs
 * invocan para ejecutar acciones reales en el sistema de trading.
 * 
 * Formato compatible con OpenAI Function Calling (que Groq y OpenRouter también usan).
 */

import { PaperExecutionEngine } from "../engine/PaperExecutionEngine";
import { validateOrderSize, isMarketOpen, getPairConfig, AXI_SELECT_RULES } from "../config/ExchangeManager";
import { saveAgentMemory, getAgentMemory } from "../utils/supabaseClient";
import { broadcastAgentState } from "../utils/SwarmEvents";

// ═══════════════════════════════════════════
// Tool Definitions (para pasar al LLM como tools[])
// ═══════════════════════════════════════════

export const TOOL_DEFINITIONS = [
    {
        type: "function" as const,
        function: {
            name: "execute_trade",
            description: "Ejecuta una orden de trading en el exchange especificado. En modo PAPER, registra la posición virtual contra precios reales. En modo LIVE, enviaría la orden al exchange real. SOLO el Risk Manager puede invocar esta herramienta después de validar todas las reglas de Axi Select.",
            parameters: {
                type: "object",
                properties: {
                    exchange: {
                        type: "string",
                        enum: ["hyperliquid", "mexc", "alpaca"],
                        description: "Exchange donde ejecutar la orden.",
                    },
                    symbol: {
                        type: "string",
                        description: "Par/ticker a operar (ej: BTC, ETHUSDT, AAPL).",
                    },
                    side: {
                        type: "string",
                        enum: ["LONG", "SHORT"],
                        description: "Dirección de la operación.",
                    },
                    notional_usd: {
                        type: "number",
                        description: "Cantidad en USD a invertir en esta operación.",
                    },
                    leverage: {
                        type: "number",
                        description: "Apalancamiento a utilizar (ej. 1, 5, 10). Mínimo 1.",
                    },
                    order_type: {
                        type: "string",
                        enum: ["MARKET", "LIMIT"],
                        description: "Tipo de orden.",
                    },
                    stop_loss_pct: {
                        type: "number",
                        description: "Stop Loss como porcentaje desde el precio de entrada (ej: 2.0 = 2%).",
                    },
                    take_profit_pct: {
                        type: "number",
                        description: "Take Profit como porcentaje desde el precio de entrada (ej: 4.0 = 4%).",
                    },
                    trailing_stop_pct: {
                        type: "number",
                        description: "Trailing Stop como porcentaje (opcional). Si se activa, el SL seguirá al precio.",
                    },
                    rationale: {
                        type: "string",
                        description: "Justificación breve de por qué se ejecuta esta operación.",
                    },
                    opened_by: {
                        type: "string",
                        description: "ID del agente que originó la señal (ej: crypto_perp, memecoin_sniper, ceo).",
                    },
                },
                required: ["exchange", "symbol", "side", "notional_usd", "leverage", "stop_loss_pct", "take_profit_pct", "rationale", "opened_by"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "reject_trade",
            description: "Rechaza una propuesta de trade que no cumple con las reglas de riesgo de Axi Select o con la política de gestión de capital.",
            parameters: {
                type: "object",
                properties: {
                    reason: {
                        type: "string",
                        description: "Razón detallada del rechazo.",
                    },
                    rule_violated: {
                        type: "string",
                        enum: [
                            "MAX_DAILY_DRAWDOWN",
                            "MAX_TOTAL_DRAWDOWN",
                            "POSITION_SIZE_TOO_LARGE",
                            "MARKET_CLOSED",
                            "MAX_OPEN_POSITIONS",
                            "RISK_REWARD_INSUFFICIENT",
                            "CORRELATION_RISK",
                            "WEEKEND_HOLDING",
                            "INSUFFICIENT_BALANCE",
                        ],
                        description: "Regla específica que se ha violado.",
                    },
                    suggestion: {
                        type: "string",
                        description: "Sugerencia para corregir la operación (ej: reducir tamaño, cambiar SL, esperar).",
                    },
                },
                required: ["reason", "rule_violated"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "get_portfolio_status",
            description: "Obtiene el estado actual del portfolio: balance, equity, drawdown, posiciones abiertas y PnL.",
            parameters: {
                type: "object",
                properties: {},
                required: [],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "save_analysis",
            description: "Guarda un análisis o nota en la memoria persistente del agente en Supabase para ser consultado después.",
            parameters: {
                type: "object",
                properties: {
                    key: {
                        type: "string",
                        description: "Clave de la memoria (ej: last_analysis, btc_thesis, macro_context).",
                    },
                    content: {
                        type: "string",
                        description: "Contenido del análisis a guardar.",
                    },
                },
                required: ["key", "content"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "get_market_context",
            description: "Obtiene el contexto macro del mercado: precios actuales, tendencias, y estado de los exchanges.",
            parameters: {
                type: "object",
                properties: {
                    scope: {
                        type: "string",
                        enum: ["crypto", "equities", "all"],
                        description: "Qué mercado consultar.",
                    },
                },
                required: ["scope"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "force_analysis",
            description: "Fuerza al Sentinel Agent a buscar oportunidades AHORA MISMO y saltarse la espera de 15 minutos. Úsalo cuando el usuario te pida buscar trades o analizar el mercado en este instante.",
            parameters: {
                type: "object",
                properties: {},
                required: [],
            },
        },
    },
];

// ═══════════════════════════════════════════
// Tool Executor — Procesa las tool_calls del LLM
// ═══════════════════════════════════════════

export class ToolExecutor {
    private paperEngine: PaperExecutionEngine;
    private latestPrices: Record<string, number>;
    private mode: "PAPER" | "LIVE";
    private onForceAnalysis?: () => Promise<any>;

    constructor(
        paperEngine: PaperExecutionEngine,
        latestPrices: Record<string, number>,
        mode: "PAPER" | "LIVE" = "PAPER",
        onForceAnalysis?: () => Promise<any>
    ) {
        this.paperEngine = paperEngine;
        this.latestPrices = latestPrices;
        this.mode = mode;
        this.onForceAnalysis = onForceAnalysis;
    }

    /**
     * Ejecuta una tool_call devuelta por el LLM.
     */
    public async execute(toolName: string, args: any): Promise<string> {
        switch (toolName) {
            case "execute_trade":
                return this.executeTrade(args);
            case "reject_trade":
                return this.rejectTrade(args);
            case "get_portfolio_status":
                return this.getPortfolioStatus();
            case "save_analysis":
                return this.saveAnalysis(args);
            case "get_market_context":
                return this.getMarketContext(args);
            case "force_analysis":
                if (this.onForceAnalysis) {
                    const res = await this.onForceAnalysis();
                    return JSON.stringify({ success: true, message: "Sentinel forzado a buscar trades ahora.", details: res });
                }
                return JSON.stringify({ error: "Force analysis no disponible" });
            default:
                return JSON.stringify({ error: `Tool "${toolName}" no reconocida.` });
        }
    }

    private async executeTrade(args: {
        exchange: string;
        symbol: string;
        side: "LONG" | "SHORT";
        notional_usd: number;
        leverage: number;
        order_type: string;
        stop_loss_pct: number;
        take_profit_pct: number;
        trailing_stop_pct?: number;
        rationale: string;
        opened_by?: string;
    }): Promise<string> {
        const price = this.latestPrices[args.symbol];
        if (!price) {
            return JSON.stringify({
                success: false,
                error: `No hay precio real disponible para ${args.symbol}. No se puede ejecutar sin datos del mercado.`
            });
        }

        // Calcular cantidad del activo
        const quantity = args.notional_usd / price;

        // Validar contra las reglas del exchange
        const validation = validateOrderSize(args.exchange, args.symbol, quantity, args.notional_usd);
        if (!validation.valid) {
            broadcastAgentState("risk_manager", "order_rejected", validation.reason!, "error");
            return JSON.stringify({ success: false, error: validation.reason });
        }

        // Calcular SL/TP en precio absoluto
        const direction = args.side === "LONG" ? 1 : -1;
        const stopLoss = price * (1 - (args.stop_loss_pct / 100) * direction);
        const takeProfit = price * (1 + (args.take_profit_pct / 100) * direction);

        if (this.mode === "PAPER") {
            const position = this.paperEngine.openPosition({
                symbol: args.symbol,
                exchange: args.exchange,
                side: args.side,
                entryPrice: price,
                notionalValue: args.notional_usd,
                leverage: args.leverage || 1,
                stopLoss,
                takeProfit,
                trailingStopPct: args.trailing_stop_pct,
                rationale: args.rationale,
                openedBy: args.opened_by,
            });

            if (!position) {
                return JSON.stringify({ success: false, error: "PaperEngine rechazó la orden (balance insuficiente o DD)." });
            }


            broadcastAgentState("risk_manager", "trade_executed", `${args.side} ${args.symbol} $${args.notional_usd}`, "success");

            return JSON.stringify({
                success: true,
                mode: "PAPER",
                position_id: position.id,
                exchange: args.exchange,
                symbol: args.symbol,
                side: args.side,
                entry_price: price,
                quantity,
                stop_loss: stopLoss,
                take_profit: takeProfit,
                rationale: args.rationale,
            });
        } else {
            // LIVE — aquí iría la llamada real a la API del exchange
            // Por seguridad, no se implementa hasta que el usuario lo active explícitamente.
            return JSON.stringify({
                success: false,
                error: "LIVE mode execution not yet implemented. Use PAPER mode.",
            });
        }
    }

    private rejectTrade(args: { reason: string; rule_violated: string; suggestion?: string }): string {
        broadcastAgentState("risk_manager", "trade_rejected", args.rule_violated, "error");
        console.log(`[RiskManager] ❌ Trade REJECTED: ${args.reason} (Rule: ${args.rule_violated})`);

        return JSON.stringify({
            action: "REJECTED",
            reason: args.reason,
            rule_violated: args.rule_violated,
            suggestion: args.suggestion || "Reduce el tamaño de la posición o espera mejores condiciones.",
        });
    }

    private async getPortfolioStatus(): Promise<string> {
        const openPositions = this.paperEngine.getOpenPositionsSnapshot();

        return JSON.stringify({
            balance: this.paperEngine.getTotalBalance(),
            equity: this.paperEngine.getTotalEquity(),
            daily_drawdown_pct: this.paperEngine.getMaxDailyDrawdownPct(),
            max_drawdown_pct: this.paperEngine.getMaxTotalDrawdownPct(),
            open_positions: openPositions.length,
            positions: openPositions,
            total_pnl: this.paperEngine.getTotalPnL(),
            axi_rules: {
                max_daily_dd: AXI_SELECT_RULES.maxDailyDrawdownPct,
                max_total_dd: AXI_SELECT_RULES.maxTotalDrawdownPct,
                daily_dd_remaining: AXI_SELECT_RULES.maxDailyDrawdownPct - this.paperEngine.getMaxDailyDrawdownPct(),
                total_dd_remaining: AXI_SELECT_RULES.maxTotalDrawdownPct - this.paperEngine.getMaxTotalDrawdownPct(),
            },
        });
    }

    private async saveAnalysis(args: { key: string; content: string }): Promise<string> {
        await saveAgentMemory("analyst", args.key, args.content);
        return JSON.stringify({ success: true, key: args.key, saved_at: new Date().toISOString() });
    }

    private async getMarketContext(args: { scope: string }): Promise<string> {
        const context: any = { timestamp: new Date().toISOString(), prices: {} };

        if (args.scope === "crypto" || args.scope === "all") {
            for (const [symbol, price] of Object.entries(this.latestPrices)) {
                if (["BTC", "ETH", "SOL", "BTCUSDT", "ETHUSDT"].includes(symbol)) {
                    context.prices[symbol] = price;
                }
            }
            context.crypto_market_open = true;
        }

        if (args.scope === "equities" || args.scope === "all") {
            for (const [symbol, price] of Object.entries(this.latestPrices)) {
                if (["AAPL", "TSLA", "SPY"].includes(symbol)) {
                    context.prices[symbol] = price;
                }
            }
            context.equities_market_open = isMarketOpen("alpaca");
        }

        return JSON.stringify(context);
    }
}
