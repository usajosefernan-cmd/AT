import { supabase } from './supabaseClient';

export class TelemetryLogger {
    private static callCount = 0;

    static getTotalCalls(): number {
        return this.callCount;
    }

    static async logApiUsage(model: string, prompt_tokens: number, completion_tokens: number) {
        this.callCount++;
        // Estimación de costes para Llama-3-8b y Llama-3-70b (Ajustable a tarifas oficiales de Groq)
        // Llama 3.1 8B: $0.05 / 1M input, $0.08 / 1M output
        // Llama 3.3 70B: $0.59 / 1M input, $0.79 / 1M output
        
        let costPer1kPrompt = 0;
        let costPer1kCompletion = 0;

        if (model.includes('70b') || model.includes('70B')) {
            costPer1kPrompt = 0.00059;
            costPer1kCompletion = 0.00079;
        } else if (model.includes('8b') || model.includes('8B')) {
            costPer1kPrompt = 0.00005;
            costPer1kCompletion = 0.00008;
        } else {
            // Default Gemini/other backup cost
            costPer1kPrompt = 0.0001;
            costPer1kCompletion = 0.0001;
        }

        const cost = ((prompt_tokens / 1000) * costPer1kPrompt) + ((completion_tokens / 1000) * costPer1kCompletion);

        try {
            const { error } = await supabase.from('api_telemetry').insert({
                timestamp: Date.now(),
                model,
                prompt_tokens,
                completion_tokens,
                cost_usd: cost
            });

            if (error) {
                console.error(`\x1b[31m[Telemetry Error] No se pudo guardar el coste en Supabase:\x1b[0m`, error.message);
            }
        } catch (err) {
            console.error(`\x1b[31m[Telemetry Exception]\x1b[0m`, err);
        }
    }
}
