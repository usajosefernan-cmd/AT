import fs from 'fs';
import path from 'path';

export interface TradeMemory {
    tradeId: string;
    ecosystem: string;
    rationale: string;
    profit_loss: number;
    timestamp: number;
    context: any; 
}

export class VectorMemoryManager {
    private static dbPath = path.join(__dirname, 'memory_db.json');
    private static memory: TradeMemory[] = [];

    static init() {
        if (fs.existsSync(this.dbPath)) {
            const data = fs.readFileSync(this.dbPath, 'utf8');
            try {
                this.memory = JSON.parse(data);
            } catch (e) {
                this.memory = [];
            }
        }
    }

    private static save() {
        fs.writeFileSync(this.dbPath, JSON.stringify(this.memory, null, 2));
    }

    static storeTradeResult(tradeId: string, ecosystem: string, rationale: string, profit_loss: number, context: any = {}) {
        this.init();
        this.memory.push({
            tradeId,
            ecosystem,
            rationale,
            profit_loss,
            timestamp: Date.now(),
            context
        });
        this.save();
        console.log(`\n\x1b[32m[\uD83E\uDDE0 Vector Memory] -> Trade ${tradeId} guardado. PnL: ${profit_loss}\x1b[0m`);
    }

    static queryPastMistakes(ecosystem: string, current_context: any): TradeMemory[] {
        this.init();
        console.log(`\n\x1b[33m[\uD83D\uDD0D Vector Memory] -> Consultando histórico de errores en ${ecosystem} para contexto similar...\x1b[0m`);
        
        const allMistakes = this.memory.filter(m => m.ecosystem === ecosystem && m.profit_loss < 0);
        const similarMistakes = allMistakes.filter(mistake => this.isContextSimilar(current_context, mistake.context));
        
        if (similarMistakes.length > 0) {
           console.log(`\x1b[31m[\u26A0\uFE0F Alerta Memoria] Se encontraron ${similarMistakes.length} errores pasados similares.\x1b[0m`);
        } else {
           console.log(`\x1b[90m[Memoria Limpia] No hay registros de fallas catastróficas recientes bajo este contexto.\x1b[0m`);
        }

        return similarMistakes;
    }

    private static isContextSimilar(current: any, past: any): boolean {
        if (!current || !past) return false;
        if (typeof current !== 'object' || typeof past !== 'object') return false;
        
        let matchCount = 0;
        let totalCount = 0;

        for (const key of Object.keys(current)) {
            if (past[key] !== undefined) {
                if (typeof current[key] === 'number' && typeof past[key] === 'number') {
                    totalCount++;
                    const diff = Math.abs(current[key] - past[key]);
                    const maxVal = Math.max(Math.abs(current[key]), Math.abs(past[key]), 1); // evitar div/0
                    const percentDiff = diff / maxVal;
                    
                    if (percentDiff <= 0.15) { // Margen del 15% de similitud
                        matchCount++;
                    }
                } else if (typeof current[key] === 'string' && typeof past[key] === 'string') {
                    totalCount++;
                    if (current[key] === past[key]) matchCount++;
                }
            }
        }

        // Si hay al menos un factor de contexto comparable y la mayoría coincide
        return totalCount > 0 && (matchCount / totalCount) >= 0.5;
    }
}
