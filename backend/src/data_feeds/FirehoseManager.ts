import WebSocket from 'ws';
import { EventEmitter } from 'events';
import axios from 'axios';

async function fetchActiveMEXCTickers(): Promise<string[]> {
    try {
        const res = await axios.get('https://api.mexc.com/api/v3/ticker/24hr');
        const validSyms = res.data
            .filter((t: any) => parseFloat(t.quoteVolume) > 1000000 && t.symbol.endsWith('USDT'))
            .map((t: any) => t.symbol);
        
        console.log(`[MEXC] Scaneando ${Math.min(validSyms.length, 100)} activos dinámicamente.`);
        // Emit in chunks of 100 max to avoid ws overflow
        return validSyms.slice(0, 100); 
    } catch(e) { return ['PEPEUSDT', 'WIFUSDT', 'BONKUSDT']; }
}

async function fetchActiveHyperliquidTickers(): Promise<string[]> {
    try {
        const res = await axios.post('https://api.hyperliquid.xyz/info', { type: "meta" }, { headers: { 'Content-Type': 'application/json' }});
        const universe = res.data.universe;
        const symbols = universe.map((u: any) => u.name);
        console.log(`[Hyperliquid] Scaneando ${Math.min(symbols.length, 100)} activos dinámicamente.`);
        return symbols.slice(0, 100);
    } catch(e) { return ['BTC', 'ETH', 'SOL']; }
}

async function fetchActiveAlpacaTickers(): Promise<string[]> {
    // Si tienes cuenta free (IEX), Alpaca suele limitar a 30 suscripciones simultáneas.
    // Simulamos un fetch dinámico con una lista ampliada de high-volume + small caps.
    const symbols = ["AAPL","MSFT","NVDA","TSLA","AMD","AMZN","META","GOOGL","GME","AMC","HOLO","SPY","QQQ","DJT","SMCI","PLTR","MARA","RIOT","COIN","MSTR"];
    console.log(`[Alpaca] Scaneando ${symbols.length} activos dinámicamente.`);
    return symbols;
}

export class FirehoseManager extends EventEmitter {
    private mexcWs: WebSocket | null = null;
    private hlWs: WebSocket | null = null;
    private alpacaWs: WebSocket | null = null;

    private pingIntervals: Record<string, NodeJS.Timeout> = {};

    constructor() {
        super();
    }

    public startStreams() {
        console.log(`\n\x1b[46m\x1b[30m \uD83C\uDF0A INICIANDO MARKET DATA FIREHOSE \uD83C\uDF0A \x1b[0m\n`);
        this.connectMexc();
        this.connectHyperliquid();
        this.connectAlpaca();
    }

    private async connectMexc() {
        // MEXC Spot V3 WebSocket
        this.mexcWs = new WebSocket('wss://wbs.mexc.com/ws');
        const tickers = await fetchActiveMEXCTickers();

        this.mexcWs.on('open', () => {
            console.log(`\x1b[36m[Firehose] Conectado a MEXC WSS (Memecoins Spot)\x1b[0m`);
            
            // Suscribirse en batches para no sobrepasar límites de longitud de JSON
            const batchSize = 30;
            for (let i = 0; i < tickers.length; i += batchSize) {
                const batch = tickers.slice(i, i + batchSize);
                const params = batch.map(t => `spot@public.kline.v3.api@${t}@Min1`);
                this.mexcWs?.send(JSON.stringify({
                    method: "SUBSCRIPTION",
                    params: params
                }));
            }

            // Keep-alive ping
            this.pingIntervals['mexc'] = setInterval(() => {
                if (this.mexcWs?.readyState === WebSocket.OPEN) {
                    this.mexcWs.send(JSON.stringify({ method: "PING" }));
                }
            }, 30000);
        });

        this.mexcWs.on('message', (data: WebSocket.RawData) => {
            try {
                const msg = JSON.parse(data.toString());
                process.stdout.write('.'); // TICK LOG
                if (msg.c && msg.c.includes('kline') && msg.d && msg.d.k) {
                    const symbol = msg.s; // PEPEUSDT
                    const kline = msg.d.k;
                    // Emitir cuando cierra la vela (kline.is_closed o equivalente, asumiremos tick en vivo por ahora)
                    this.emit('mexc_kline_update', {
                        asset: symbol,
                        close: parseFloat(kline.c),
                        high: parseFloat(kline.h),
                        low: parseFloat(kline.l),
                        open: parseFloat(kline.o),
                        volume: parseFloat(kline.v),
                    });
                }
            } catch (e) {
                // ignorar errores de parseo o pings
            }
        });

        this.mexcWs.on('close', () => {
             console.log(`\x1b[31m[Firehose] MEXC WSS Desconectado. Reconectando en 5s...\x1b[0m`);
             clearInterval(this.pingIntervals['mexc']);
             setTimeout(() => this.connectMexc(), 5000);
        });
        
        this.mexcWs.on('error', (err) => {
            console.error(`\x1b[31m[Firehose] MEXC WSS Error: ${err.message}\x1b[0m`);
        });
    }

    private async connectHyperliquid() {
        // Hyperliquid L1 WebSocket
        this.hlWs = new WebSocket('wss://api.hyperliquid.xyz/ws');
        const coins = await fetchActiveHyperliquidTickers();

        this.hlWs.on('open', () => {
            console.log(`\x1b[36m[Firehose] Conectado a Hyperliquid WSS (Cripto Majors Perps)\x1b[0m`);
            // Suscribirse a trades de Majors
            coins.forEach(coin => {
                this.hlWs?.send(JSON.stringify({
                    method: "subscribe",
                    subscription: { type: "trades", coin: coin }
                }));
            });
            
            this.pingIntervals['hl'] = setInterval(() => {
                if (this.hlWs?.readyState === WebSocket.OPEN) {
                    this.hlWs.send(JSON.stringify({ method: "ping" }));
                }
            }, 50000);
        });

        this.hlWs.on('message', (data: WebSocket.RawData) => {
            try {
                const msg = JSON.parse(data.toString());
                process.stdout.write('.'); // TICK LOG
                if (msg.channel === 'trades' && msg.data && msg.data.length > 0) {
                    const trades = msg.data;
                    const coin = trades[0].coin;
                    // Aquí podríamos calcular volumen acumulado o tape velocity
                    this.emit('hl_trade_update', {
                        asset: coin,
                        trades: trades
                    });
                }
            } catch (e) { }
        });

        this.hlWs.on('close', () => {
             console.log(`\x1b[31m[Firehose] Hyperliquid WSS Desconectado. Reconectando en 5s...\x1b[0m`);
             clearInterval(this.pingIntervals['hl']);
             setTimeout(() => this.connectHyperliquid(), 5000);
        });
        
        this.hlWs.on('error', (err) => {
            console.error(`\x1b[31m[Firehose] Hyperliquid WSS Error: ${err.message}\x1b[0m`);
        });
    }

    private async connectAlpaca() {
        // Alpaca IEX Free Tier WebSocket
        this.alpacaWs = new WebSocket('wss://stream.data.alpaca.markets/v2/iex');
        const symbols = await fetchActiveAlpacaTickers();

        this.alpacaWs.on('open', () => {
            console.log(`\x1b[36m[Firehose] Conectado a Alpaca WSS (Equities & Small Caps)\x1b[0m`);
            // Auth - Requiere variables de entorno
            const keyId = process.env.ALPACA_API_KEY || "dummy_key";
            const secretKey = process.env.ALPACA_SECRET_KEY || "dummy_secret";
            
            this.alpacaWs?.send(JSON.stringify({
                action: "auth",
                key: keyId,
                secret: secretKey
            }));
        });

        this.alpacaWs.on('message', (data: WebSocket.RawData) => {
            try {
                const msgs = JSON.parse(data.toString());
                process.stdout.write('.'); // TICK LOG
                for (const msg of msgs) {
                    if (msg.T === 'success' && msg.msg === 'authenticated') {
                        console.log(`\x1b[32m[Firehose] Alpaca Auth OK. Suscribiéndose...\x1b[0m`);
                        this.alpacaWs?.send(JSON.stringify({
                            action: "subscribe",
                            bars: symbols
                        }));
                    } else if (msg.T === 'b') { // Bar message (kline)
                        this.emit('alpaca_bar_update', {
                            asset: msg.S,
                            close: msg.c,
                            high: msg.h,
                            low: msg.l,
                            open: msg.o,
                            volume: msg.v
                        });
                    }
                }
            } catch (e) { }
        });

        this.alpacaWs.on('close', () => {
             console.log(`\x1b[31m[Firehose] Alpaca WSS Desconectado. Reconectando en 5s...\x1b[0m`);
             setTimeout(() => this.connectAlpaca(), 5000);
        });
        
        this.alpacaWs.on('error', (err) => {
            console.error(`\x1b[31m[Firehose] Alpaca WSS Error: ${err.message}\x1b[0m`);
        });
    }
}
