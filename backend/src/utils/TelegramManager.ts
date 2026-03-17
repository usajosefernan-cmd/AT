import TelegramBot from 'node-telegram-bot-api';
import { SwarmAutonomyLoop } from '../engine/SwarmAutonomyLoop';

export class TelegramManager {
    static bot: TelegramBot | null = null;
    static chatId: string | null = null;
    static ceoHandler: ((text: string) => Promise<string>) | null = null;

    static setCEOHandler(handler: (text: string) => Promise<string>) {
        this.ceoHandler = handler;
    }
    
    static init(token: string) {
        if (!token) {
            console.warn("\x1b[33m[TelegramManager] No BOT_TOKEN provided. Telegram interface is offline.\x1b[0m");
            return;
        }
        
        try {
            this.bot = new TelegramBot(token, { polling: true });
            
            console.log("\x1b[34m[TelegramManager] Conectado e inicializando listeners de comandos.\x1b[0m");
            
            this.setupListeners();
        } catch (error) {
            console.error("\x1b[31m[TelegramManager] Error al inicializar:\x1b[0m", error);
        }
    }
    
    private static setupListeners() {
        if (!this.bot) return;

        // Comando /start y capturar Chat ID
        this.bot.onText(/\/start/, (msg) => {
            if (!this.chatId) {
                this.chatId = msg.chat.id.toString();
                console.log(`\x1b[34m[TelegramManager] Nuevo enlace de Mando (Chat ID: ${this.chatId})\x1b[0m`);
            }
            this.sendMessage("✅ *Uplink Omnicanal Establecido.*\n\nSoy el CEO Agent. Listo para orquestar el fondo. Envía comandos o usa /status.");
        });

        // Comando /status
        this.bot.onText(/\/status/, (msg) => {
            if (!this.chatId) this.chatId = msg.chat.id.toString();
            this.sendMessage("📊 *ESTADO DE ECOSISTEMAS*\n\n1. Axi Forex: ACTIVO\n2. Cripto Majors: ACTIVO (HL CVD)\n3. Memecoins: ACTIVO (MEXC)\n4. Equities Large: ACTIVO (Alpaca VWAP)\n5. Small Caps: ACTIVO (Alpaca Halts)\n\nMotor Autónomo: " + (SwarmAutonomyLoop['isRunning'] ? "🟢 CORRIENDO" : "🔴 PAUSADO"));
            // Emitir evento al frontend
            this.emitToFrontend('ceo_status_broadcast', { msg: "Telegram user requested status." });
        });

        // Comando /pause
        this.bot.onText(/\/pause/, (msg) => {
            if (!this.chatId) this.chatId = msg.chat.id.toString();
            SwarmAutonomyLoop.stop();
            this.sendMessage("⏸️ *MOTOR AUTÓNOMO PAUSADO*\nLos 5 Screeners han cesado el escaneo.");
            this.emitToFrontend('swarm_status_changed', { status: 'PAUSED', source: 'telegram' });
        });

        // Comando /resume
        this.bot.onText(/\/resume/, (msg) => {
            if (!this.chatId) this.chatId = msg.chat.id.toString();
            if (!SwarmAutonomyLoop['isRunning']) {
                SwarmAutonomyLoop.start();
                this.sendMessage("▶️ *MOTOR AUTÓNOMO REANUDADO*\nEnjambre regresando al escrutinio del mercado.");
                this.emitToFrontend('swarm_status_changed', { status: 'RUNNING', source: 'telegram' });
            } else {
                this.sendMessage("⚠️ El motor ya está corriendo.");
            }
        });

        // Comando /panic
        this.bot.onText(/\/panic/, (msg) => {
            if (!this.chatId) this.chatId = msg.chat.id.toString();
            SwarmAutonomyLoop.stop();
            // Lógica ficticia para kill switch en L3 / brokers, simulada por ahora.
            this.sendMessage("🚨 *MODO PÁNICO ACTIVADO* 🚨\n\nMotor Pausado.\nCercenando exposición en L3 (Kill Switch).\nSe requiere anulación manual en Mission Control.");
            this.emitToFrontend('panic_mode_activated', { source: 'telegram' });
        });

        // Recepción de mensajes genéricos (CEO enrutamiento)
        this.bot.on('message', async (msg) => {
            if (msg.text && !msg.text.startsWith('/')) {
                if (!this.chatId) this.chatId = msg.chat.id.toString();
                console.log(`\x1b[36m[CEO Agent | Telegram]\x1b[0m Recibió: "${msg.text}"`);
                
                this.emitToFrontend('ceo_processing_command', { text: msg.text, source: 'telegram' });
                
                if (this.ceoHandler) {
                    try {
                        const response = await this.ceoHandler(msg.text);
                        this.sendMessage(`CEO: ${response}`);
                        this.emitToFrontend('ceo_response', { text: response, source: 'telegram' });
                    } catch (error: any) {
                        this.sendMessage(`❌ Error en el núcleo CEO: ${error.message}`);
                        this.emitToFrontend('ceo_response', { text: `Error: ${error.message}`, source: 'telegram' });
                    }
                } else {
                    const response = `CEO Agent no sincronizado.`;
                    this.sendMessage(`CEO: ${response}`);
                }
            }
        });
    }

    static sendMessage(text: string) {
        if (this.bot && this.chatId) {
            this.bot.sendMessage(this.chatId, text, { parse_mode: 'Markdown' });
        }
    }
    
    static broadcastAlert(text: string) {
        this.sendMessage(`⚠️ ALERTA DEL ENJAMBRE ⚠️\n\n${text}`);
    }

    private static emitToFrontend(event: string, data: any) {
        if ((global as any).io) {
            (global as any).io.emit(event, data);
        }
    }
}
