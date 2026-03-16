import EventEmitter from "events";
import { broadcastAgentState } from "./SwarmEvents";
import { getSystemConfig, updateSystemConfig, getAgentMemory, getPaperBalance } from "./supabaseClient";

/**
 * TelegramManager
 * Conecta el bot de Telegram directamente con el Agente CEO.
 * 
 * Funcionalidad:
 * - Recibe mensajes del usuario (tú) por Telegram
 * - Los parsea y ejecuta como comandos del CEO
 * - Responde con el estado actual del sistema
 * - Envía alertas proactivas (drawdown, SL/TP hit, etc.)
 * 
 * Usa la API de Telegram Bot (polling via getUpdates).
 * No requiere webhook público — funciona desde Railway con long-polling.
 */
export class TelegramManager extends EventEmitter {
    private token: string;
    private baseUrl: string;
    private offset: number = 0;
    private isRunning: boolean = false;
    private authorizedChatIds: Set<number> = new Set();

    // External handler: the real CEOAgent with LLM
    private externalHandler: ((text: string) => Promise<string>) | null = null;

    constructor() {
        super();
        this.token = process.env.TELEGRAM_BOT_TOKEN || "";

        if (!this.token) {
            console.warn("[Telegram] ⚠️ TELEGRAM_BOT_TOKEN not set. Bot disabled.");
        }

        this.baseUrl = `https://api.telegram.org/bot${this.token}`;

        // Initialize with admin chat ID if provided
        const adminId = process.env.TELEGRAM_ADMIN_CHAT_ID;
        if (adminId) {
            this.authorizedChatIds.add(parseInt(adminId, 10));
            console.log(`[Telegram] Admin Chat ID authorized: ${adminId}`);
        }
    }

    /**
     * Conecta el CEOAgent como handler para mensajes en lenguaje natural.
     */
    public setCEOHandler(handler: (text: string) => Promise<string>) {
        this.externalHandler = handler;
        console.log("[Telegram] CEOAgent handler connected.");
    }

    /**
     * Inicia el long-polling loop para recibir mensajes.
     */
    public async start() {
        if (!this.token) return;

        this.isRunning = true;
        console.log("[Telegram] 🤖 Bot started. Waiting for messages...");

        while (this.isRunning) {
            try {
                const response = await fetch(
                    `${this.baseUrl}/getUpdates?offset=${this.offset}&timeout=30`
                );
                const data: any = await response.json();

                if (data.ok && data.result.length > 0) {
                    for (const update of data.result) {
                        this.offset = update.update_id + 1;
                        await this.handleUpdate(update);
                    }
                }
            } catch (error: any) {
                console.error("[Telegram] Polling error:", error.message);
                // Wait before retrying to avoid hammering
                await this.sleep(5000);
            }
        }
    }

    public stop() {
        this.isRunning = false;
        console.log("[Telegram] Bot stopped.");
    }

    /**
     * Procesa un mensaje entrante de Telegram.
     */
    private async handleUpdate(update: any) {
        const message = update.message;
        if (!message || !message.text) return;

        const chatId = message.chat.id;
        const text = message.text.trim();
        const username = message.from?.username || "unknown";

        // Auto-autorizar al primer usuario que escriba (o hard-codear tu chatId)
        if (!this.authorizedChatIds.has(chatId)) {
            this.authorizedChatIds.add(chatId);
            console.log(`[Telegram] New authorized user: @${username} (chatId: ${chatId})`);
        }

        console.log(`[Telegram] Message from @${username}: "${text}"`);
        broadcastAgentState("ceo", "processing_telegram", text.slice(0, 30), "active");

        // Parsear el comando
        const response = await this.processCommand(text);

        // Enviar respuesta al usuario
        await this.sendMessage(chatId, response);

        broadcastAgentState("ceo", "monitoring", undefined, "idle");
    }

    /**
     * Procesa un comando de texto natural y devuelve la respuesta.
     */
    private async processCommand(text: string): Promise<string> {
        const lower = text.toLowerCase();

        // ─── STATUS / INFO ───
        if (lower.includes("pnl") || lower.includes("status") || lower.includes("balance") || lower === "/status") {
            try {
                const balance = await getPaperBalance();
                if (!balance) return "⚠️ No se encontró cuenta Paper. El sistema puede no estar inicializado.";

                return [
                    "📊 *ESTADO DEL SISTEMA*",
                    `💰 Balance: $${balance.balance?.toFixed(2) || "N/A"}`,
                    `📈 Equity: $${balance.equity?.toFixed(2) || "N/A"}`,
                    `📉 DD Diario: ${balance.daily_drawdown?.toFixed(2) || 0}%`,
                    `📉 DD Máximo: ${balance.max_drawdown?.toFixed(2) || 0}%`,
                    `🕐 Actualizado: ${balance.updated_at || "N/A"}`,
                ].join("\n");
            } catch {
                return "❌ Error consultando Supabase.";
            }
        }

        // ─── ¿QUÉ ESTÁ HACIENDO UN AGENTE? ───
        if (lower.includes("qué") && (lower.includes("agente") || lower.includes("forex") || lower.includes("cripto"))) {
            // Read agent memory from Supabase
            const agentId = lower.includes("forex") ? "analyst_forex"
                : lower.includes("cripto") || lower.includes("crypto") ? "analyst_crypto"
                    : "sentinel";

            try {
                const memory = await getAgentMemory(agentId, "last_analysis");
                if (memory) {
                    return `🤖 *Agente ${agentId}*:\n${memory.content}\n\n_Última actualización: ${memory.updated_at}_`;
                }
                return `🤖 Agente ${agentId} no tiene análisis recientes en memoria.`;
            } catch {
                return `❌ Error leyendo memoria del agente ${agentId}.`;
            }
        }

        // ─── KILLSWITCH / LIQUIDATE ───
        if (lower.includes("liquidate") || lower.includes("liquida") || lower.includes("stop all") || lower.includes("kill")) {
            await updateSystemConfig({ kill_switch: true, mode: "HALTED" });
            this.emit("killswitch");
            broadcastAgentState("risk", "emergency_liquidation", "Telegram Order", "error");
            return "🛑 *¡KILL SWITCH ACTIVADO!*\nOrden de liquidación total enviada. Todas las posiciones serán cerradas a mercado.";
        }

        // ─── PAUSE EXCHANGE ───
        if (lower.includes("pausa") || lower.includes("pause")) {
            if (lower.includes("alpaca")) {
                await updateSystemConfig({ alpaca_status: "PAUSED" });
                return "⏸️ Alpaca pausado. No se enviarán más órdenes a TradFi.";
            }
            if (lower.includes("mexc") || lower.includes("cripto")) {
                await updateSystemConfig({ mexc_status: "PAUSED" });
                return "⏸️ MEXC/Crypto pausado. Posiciones existentes se mantienen.";
            }
            if (lower.includes("hyper")) {
                await updateSystemConfig({ hyperliquid_status: "PAUSED" });
                return "⏸️ Hyperliquid pausado.";
            }
            await updateSystemConfig({ global_pause: true });
            return "⏸️ *SISTEMA COMPLETO PAUSADO.* Ningún agente ejecutará trades.";
        }

        // ─── RESUME ───
        if (lower.includes("resume") || lower.includes("reanud") || lower.includes("activa")) {
            await updateSystemConfig({ global_pause: false, alpaca_status: "ACTIVE", mexc_status: "ACTIVE", hyperliquid_status: "ACTIVE" });
            return "▶️ Sistema reactivado. Todos los exchanges y agentes están operativos.";
        }

        // ─── SWITCH MODE ───
        if (lower.includes("paper")) {
            await updateSystemConfig({ mode: "PAPER" });
            return "📝 Modo cambiado a *PAPER TRADING*. Ejecución virtual con datos reales.";
        }
        if (lower.includes("live") && (lower.includes("mode") || lower.includes("modo"))) {
            return "⚠️ Cambiar a LIVE requiere confirmación doble. Escribe: CONFIRM LIVE MODE";
        }
        if (lower === "confirm live mode") {
            await updateSystemConfig({ mode: "LIVE" });
            return "🔴 *MODO LIVE ACTIVADO.* Las órdenes se enviarán a los exchanges reales. Procede con precaución.";
        }

        // ─── HELP ───
        if (lower === "/help" || lower === "/start") {
            return [
                "🧠 *CEO BOT — Hedge Fund IA*",
                "",
                "Comandos rápidos:",
                "• `/status` - Balance, PnL y drawdown",
                "• `Pausa Alpaca` / `Pausa MEXC` / `Pausa Hyper`",
                "• `Resume` - Reactivar todo",
                "• `Liquidate all` - Kill Switch",
                "",
                "O escríbeme en lenguaje natural y el CEO Agent responderá con IA.",
            ].join("\n");
        }

        // ─── FALLBACK: Pasar al CEOAgent real con LLM ───
        if (this.externalHandler) {
            try {
                return await this.externalHandler(text);
            } catch (error: any) {
                console.error("[Telegram] CEOAgent error:", error.message);
                return `❌ Error del CEO Agent: ${error.message}`;
            }
        }
        return "🤔 CEO Agent no conectado aún. Usa /help para comandos disponibles.";
    }

    /**
     * Envía un mensaje de texto a un chat de Telegram.
     */
    public async sendMessage(chatId: number | string, text: string) {
        try {
            await fetch(`${this.baseUrl}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: chatId,
                    text,
                    parse_mode: "Markdown",
                }),
            });
        } catch (error: any) {
            console.error("[Telegram] Error sending message:", error.message);
        }
    }

    /**
     * Envía una alerta proactiva a TODOS los usuarios autorizados.
     * Usado internamente por el PaperEngine o el RiskManager.
     */
    public async broadcastAlert(text: string) {
        for (const chatId of this.authorizedChatIds) {
            await this.sendMessage(chatId, text);
        }
    }

    private sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
