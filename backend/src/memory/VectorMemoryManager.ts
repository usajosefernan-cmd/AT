import { supabase } from '../utils/supabaseClient';

export interface TradeMemory {
    trade_id: string;
    ecosystem: string;
    rationale: string;
    profit_loss: number;
    timestamp: number;
    context: any; 
}

export class VectorMemoryManager {

    /**
     * Genera un embedding para el contexto actual. 
     * En producción, deberías llamar a la API de embeddings de Groq, Mistral u OpenAI.
     */
    private static async generateEmbedding(text: string): Promise<number[]> {
        // Mock: Array de 1536 dimensiones (estándar OpenAI)
        // Reemplazar con llamada real a tu proveedor de LLM / Embeddings
        return Array(1536).fill(0).map(() => Math.random() * 0.1); 
    }

    static async storeTradeResult(tradeId: string, ecosystem: string, rationale: string, profit_loss: number, context: any = {}) {
        try {
            // Convertimos el contexto y rationale a texto para generar el vector
            const textToEmbed = `${ecosystem} | PnL: ${profit_loss} | Rationale: ${rationale} | Context: ${JSON.stringify(context)}`;
            const embedding = await this.generateEmbedding(textToEmbed);

            const { error } = await supabase.from('trade_memory').insert({
                trade_id: tradeId,
                ecosystem: ecosystem,
                rationale: rationale,
                profit_loss: profit_loss,
                timestamp: Date.now(),
                context: context,
                embedding: embedding
            });

            if (error) {
                console.error(`\x1b[31m[\uD83D\uDDB4\uFE0F Vector Memory Error] No se pudo guardar en Supabase:\x1b[0m`, error);
                return;
            }
            console.log(`\n\x1b[32m[\uD83E\uDDE0 Vector Memory] -> Trade ${tradeId} guardado con Supabase pgvector. PnL: ${profit_loss}\x1b[0m`);
        } catch (err) {
            console.error(`\x1b[31m[\uD83D\uDDB4\uFE0F Vector Memory Exception]\x1b[0m`, err);
        }
    }

    static async queryPastMistakes(ecosystem: string, current_context: any): Promise<TradeMemory[]> {
        console.log(`\n\x1b[33m[\uD83D\uDD0D Vector Memory] -> Consultando pgvector en Supabase histórico de errores en ${ecosystem} para contexto similar...\x1b[0m`);
        
        try {
            const contextStr = JSON.stringify(current_context);
            const queryEmbedding = await this.generateEmbedding(`Context: ${contextStr}`);

            // Buscamos similitud superior al 85% (1 - 0.15 de distancia)
            const { data, error } = await supabase.rpc('match_trade_memory', {
                query_embedding: queryEmbedding,
                match_threshold: 0.85, 
                match_count: 5,
                ecosystem_filter: ecosystem
            });

            if (error) {
                console.error(`\x1b[31m[\uD83D\uDDB4\uFE0F Vector Query Error] Error en RPC Supabase:\x1b[0m`, error);
                return [];
            }

            // Filtrar y mapear los errores
            const similarMistakes = (data || []).filter((row: any) => row.profit_loss < 0).map((row: any) => ({
                trade_id: row.trade_id,
                ecosystem: row.ecosystem,
                rationale: row.rationale,
                profit_loss: row.profit_loss,
                timestamp: row.timestamp,
                context: row.context
            }));

            if (similarMistakes.length > 0) {
               console.log(`\x1b[31m[\u26A0\uFE0F Alerta Memoria] Se encontraron ${similarMistakes.length} errores pasados similares en la Vector DB.\x1b[0m`);
            } else {
               console.log(`\x1b[90m[Memoria Limpia] No hay registros de fallas catastróficas recientes bajo este contexto en Supabase.\x1b[0m`);
            }

            return similarMistakes;
        } catch (err) {
            console.error(`\x1b[31m[\uD83D\uDDB4\uFE0F Vector Query Exception]\x1b[0m`, err);
            return [];
        }
    }
}
