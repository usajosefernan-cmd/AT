/**
 * LLMService.ts — Servicio LLM con gestión inteligente de llamadas.
 *
 * COSTOS INVESTIGADOS (por millón de tokens):
 * ┌──────────────────────────┬─────────┬──────────┬──────────────────────┐
 * │ Modelo                   │ Input   │ Output   │ Notas                │
 * ├──────────────────────────┼─────────┼──────────┼──────────────────────┤
 * │ Groq Llama 3.1 8B         │ $0.05   │ $0.08    │ Rutina (Sentinel)    │
 * │ Groq Llama 3.3 70B        │ $0.59   │ $0.79    │ CEO, decisiones      │
 * │ Gemini 2.0 Flash Lite     │ $0.075  │ $0.30    │ Backup gratis        │
 * └──────────────────────────┴─────────┴──────────┴──────────────────────┘
 *
 * ESTRATEGIA (SOLO GROQ + GEMINI):
 * 1. Groq llama-3.1-8b-instant: rutina (cheapest)
 * 2. Groq llama-3.3-70b-versatile: CEO y decisiones importantes
 * 3. Gemini 2.0-flash-lite: backup gratuito si Groq falla
 * 4. CACHE local de respuestas (TTL 30s)
 * 5. Groq prompt caching automático → -50% input tokens
 * 6. Concurrencia max 2, throttle 30s por símbolo
 */

import Groq from "groq-sdk";
import OpenAI from "openai";
import { _getIoInstance } from "../utils/SwarmEvents";
import { supabase } from "../utils/supabaseClient";
import crypto from "crypto";
import { TelemetryLogger } from "../utils/TelemetryLogger";

// ═══════════════════════════════════════════
// Clients
// ═══════════════════════════════════════════

const geminiClient = new OpenAI({
    apiKey: process.env.GEMINI_API_KEY || "",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

const groqClient = new Groq({
    apiKey: process.env.GROQ_API_KEY || "",
});

// NO OpenRouter — solo Groq + Gemini

// ═══════════════════════════════════════════
// Types
// ═══════════════════════════════════════════

export interface LLMCallOptions {
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    model?: string;
    tools?: any[];
    toolChoice?: "auto" | "required" | "none";
    rawMessages?: any[];
}

export interface LLMUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    provider: "gemini" | "groq" | "openrouter";
    model: string;
    durationMs: number;
}

// ═══════════════════════════════════════════
// 1. RESPONSE CACHE (TTL 30s) — Evita llamadas repetidas
// ═══════════════════════════════════════════

interface CachedResponse {
    data: any;
    usage: LLMUsage;
    timestamp: number;
}

const responseCache = new Map<string, CachedResponse>();
const CACHE_TTL_MS = 30_000; // 30 segundos

function getCacheKey(systemPrompt: string, userPrompt: string): string {
    // Hash basado en las primeras 200 chars del system + user prompt
    // Esto agrupa análisis similares del mismo símbolo
    const input = systemPrompt.slice(0, 200) + "|" + userPrompt.slice(0, 500);
    return crypto.createHash('md5').update(input).digest('hex');
}

function getCachedResponse(key: string): CachedResponse | null {
    const cached = responseCache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
        responseCache.delete(key);
        return null;
    }
    return cached;
}

// Limpiar cache antiguos cada 60s
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of responseCache.entries()) {
        if (now - val.timestamp > CACHE_TTL_MS * 2) responseCache.delete(key);
    }
}, 60_000);

// ═══════════════════════════════════════════
// 2. CONCURRENCY LIMITER (max 2 simultáneas)
// ═══════════════════════════════════════════

let activeCalls = 0;
const MAX_CONCURRENT = 2;
const callQueue: (() => void)[] = [];

function acquireSlot(): Promise<void> {
    if (activeCalls < MAX_CONCURRENT) {
        activeCalls++;
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        callQueue.push(() => { activeCalls++; resolve(); });
    });
}

function releaseSlot() {
    activeCalls--;
    if (callQueue.length > 0) callQueue.shift()!();
}

// ═══════════════════════════════════════════
// 3. PER-SYMBOL THROTTLE (30s entre análisis)
// ═══════════════════════════════════════════

const lastCallPerSymbol = new Map<string, number>();
const SYMBOL_THROTTLE_MS = 30_000;

export function isThrottled(symbol: string): boolean {
    const last = lastCallPerSymbol.get(symbol) || 0;
    if (Date.now() - last < SYMBOL_THROTTLE_MS) return true;
    lastCallPerSymbol.set(symbol, Date.now());
    return false;
}

// ═══════════════════════════════════════════
// Stats
// ═══════════════════════════════════════════

const sessionStats = {
    totalCalls: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    errors: 0,
    cacheHits: 0,
    geminiCalls: 0,
    groqCalls: 0,
};

// ═══════════════════════════════════════════
// PRIMARY: askGroq — Groq 8B first (cheapest) → Gemini backup
// ═══════════════════════════════════════════

export async function askGroq<T = any>(
    systemPrompt: string,
    userPrompt: string,
    opts: LLMCallOptions = {}
): Promise<{ data: T; usage: LLMUsage; rawResponse?: any }> {
    const {
        temperature = 0.1,
        maxTokens = 400,
        jsonMode = true,
        tools,
        toolChoice = "auto",
        rawMessages,
    } = opts;

    // ─── CHECK CACHE ───
    if (!tools) {
        const cacheKey = getCacheKey(systemPrompt, userPrompt);
        const cached = getCachedResponse(cacheKey);
        if (cached) {
            sessionStats.cacheHits++;
            console.log(`[LLM] ♻️ CACHE HIT (${sessionStats.cacheHits} total, cache size: ${responseCache.size})`);
            return { data: cached.data as T, usage: cached.usage };
        }
    }

    await acquireSlot();
    const start = Date.now();

    try {
        // Smart routing: si el modelo es "gemini-*", usar Gemini primero
        const isGeminiModel = opts.model?.startsWith("gemini") || false;

        if (isGeminiModel) {
            // ─── RUTA GEMINI PRIMERO (CEO, modelos inteligentes) ───
            return await callGeminiFirst(systemPrompt, userPrompt, opts, start);
        }

        // ─── RUTA GROQ PRIMERO (rutina, cheapest) ───
        try {
            const groqModel = opts.model || "llama-3.1-8b-instant";
            const messages = rawMessages && rawMessages.length > 0
                ? rawMessages
                : [
                    { role: "system" as const, content: systemPrompt },
                    { role: "user" as const, content: userPrompt },
                ];

            const params: any = {
                model: groqModel,
                messages,
                temperature,
                max_tokens: maxTokens,
            };

            if (jsonMode && !tools) {
                params.response_format = { type: "json_object" as const };
            }
            if (tools && tools.length > 0) {
                params.tools = tools;
                params.tool_choice = toolChoice;
            }

            const response = await groqClient.chat.completions.create(params);
            const content = response.choices[0]?.message?.content;

            const usage: LLMUsage = {
                promptTokens: response.usage?.prompt_tokens || 0,
                completionTokens: response.usage?.completion_tokens || 0,
                totalTokens: response.usage?.total_tokens || 0,
                provider: "groq",
                model: groqModel,
                durationMs: Date.now() - start,
            };

            sessionStats.groqCalls++;
            trackUsage(usage);

            if (tools) return { data: (content || "") as any, usage, rawResponse: response };
            if (!content) throw new Error("Groq empty");

            const parsed = jsonMode ? JSON.parse(content) : content;

            // Cache response
            if (!tools) {
                const cacheKey = getCacheKey(systemPrompt, userPrompt);
                responseCache.set(cacheKey, { data: parsed, usage, timestamp: Date.now() });
            }

            return { data: parsed as T, usage };

        } catch (groqErr: any) {
            console.warn(`[LLM] Groq falló: ${groqErr.message?.slice(0, 80)}. → Gemini backup...`);

            // ─── INTENTO 2: Gemini (backup gratuito) ───
            try {
                const geminiModel = "gemini-2.0-flash-lite";
                const effectiveSystemPrompt = jsonMode && !tools
                    ? systemPrompt + "\n\nResponde SOLO con JSON válido. Sin markdown ni texto extra."
                    : systemPrompt;

                const messages = rawMessages && rawMessages.length > 0
                    ? rawMessages
                    : [
                        { role: "system" as const, content: effectiveSystemPrompt },
                        { role: "user" as const, content: userPrompt },
                    ];

                const params: any = {
                    model: geminiModel,
                    messages,
                    temperature,
                    max_tokens: maxTokens,
                };

                if (tools && tools.length > 0) {
                    params.tools = tools;
                    params.tool_choice = toolChoice;
                }

                const response = await geminiClient.chat.completions.create(params);
                const content = response.choices[0]?.message?.content;

                const usageRaw = response.usage as any;
                const usage: LLMUsage = {
                    promptTokens: usageRaw?.prompt_tokens || 0,
                    completionTokens: usageRaw?.completion_tokens || 0,
                    totalTokens: usageRaw?.total_tokens || 0,
                    provider: "gemini",
                    model: geminiModel,
                    durationMs: Date.now() - start,
                };

                sessionStats.geminiCalls++;
                trackUsage(usage);

                if (tools) return { data: (content || "") as any, usage, rawResponse: response };
                if (!content) throw new Error("Gemini empty");

                const parsed = parseJsonRobust(content, jsonMode);

                if (!tools) {
                    const cacheKey = getCacheKey(systemPrompt, userPrompt);
                    responseCache.set(cacheKey, { data: parsed, usage, timestamp: Date.now() });
                }

                return { data: parsed as T, usage };

            } catch (geminiErr: any) {
                console.error(`[LLM] AMBOS FALLARON. Groq: ${groqErr.message?.slice(0, 60)}, Gemini: ${geminiErr.message?.slice(0, 60)}`);
                sessionStats.errors++;
                throw groqErr;
            }
        }

    } finally {
        releaseSlot();
    }
}

// ═══════════════════════════════════════════
// callGeminiFirst — Para CEO (modelo inteligente primero)
// Gemini 2.5 Pro → Groq 70B fallback
// ═══════════════════════════════════════════

async function callGeminiFirst<T>(
    systemPrompt: string,
    userPrompt: string,
    opts: LLMCallOptions,
    start: number
): Promise<{ data: T; usage: LLMUsage; rawResponse?: any }> {
    const { temperature = 0.3, maxTokens = 1000, jsonMode = false, tools, toolChoice = "auto", rawMessages } = opts;
    const geminiModel = opts.model || "gemini-3.1-pro-preview";

    // ─── INTENTO 1: Gemini (modelo inteligente) ───
    try {
        const effectiveSystemPrompt = jsonMode && !tools
            ? systemPrompt + "\n\nResponde SOLO con JSON válido."
            : systemPrompt;

        const messages = rawMessages && rawMessages.length > 0
            ? rawMessages
            : [
                { role: "system" as const, content: effectiveSystemPrompt },
                { role: "user" as const, content: userPrompt },
            ];

        const params: any = { model: geminiModel, messages, temperature, max_tokens: maxTokens };
        if (tools && tools.length > 0) { params.tools = tools; params.tool_choice = toolChoice; }

        const response = await geminiClient.chat.completions.create(params);
        const content = response.choices[0]?.message?.content;
        const usageRaw = response.usage as any;

        const usage: LLMUsage = {
            promptTokens: usageRaw?.prompt_tokens || 0,
            completionTokens: usageRaw?.completion_tokens || 0,
            totalTokens: usageRaw?.total_tokens || 0,
            provider: "gemini",
            model: geminiModel,
            durationMs: Date.now() - start,
        };
        sessionStats.geminiCalls++;
        trackUsage(usage);

        if (tools) return { data: (content || "") as any, usage, rawResponse: response };
        if (!content) throw new Error("Gemini empty");

        const parsed = parseJsonRobust(content, jsonMode);
        return { data: parsed as T, usage, rawResponse: response };

    } catch (geminiErr: any) {
        console.warn(`[LLM] Gemini ${geminiModel} falló: ${geminiErr.message?.slice(0, 80)}. → Groq 70B...`);

        // ─── FALLBACK: Groq 70B ───
        try {
            const messages = rawMessages && rawMessages.length > 0
                ? rawMessages
                : [
                    { role: "system" as const, content: systemPrompt },
                    { role: "user" as const, content: userPrompt },
                ];

            const params: any = { model: "llama-3.3-70b-versatile", messages, temperature, max_tokens: maxTokens };
            if (jsonMode && !tools) params.response_format = { type: "json_object" as const };
            if (tools && tools.length > 0) { params.tools = tools; params.tool_choice = toolChoice; }

            const response = await groqClient.chat.completions.create(params);
            const content = response.choices[0]?.message?.content;

            const usage: LLMUsage = {
                promptTokens: response.usage?.prompt_tokens || 0,
                completionTokens: response.usage?.completion_tokens || 0,
                totalTokens: response.usage?.total_tokens || 0,
                provider: "groq",
                model: "llama-3.3-70b-versatile",
                durationMs: Date.now() - start,
            };
            sessionStats.groqCalls++;
            trackUsage(usage);

            if (tools) return { data: (content || "") as any, usage, rawResponse: response };
            if (!content) throw new Error("Groq 70B empty");

            const parsed = jsonMode ? JSON.parse(content) : content;
            return { data: parsed as T, usage, rawResponse: response };

        } catch (groqErr: any) {
            console.error(`[LLM] CEO: AMBOS FALLARON. Gemini: ${geminiErr.message?.slice(0, 50)}, Groq: ${groqErr.message?.slice(0, 50)}`);
            sessionStats.errors++;
            throw geminiErr;
        }
    }
}

// ═══════════════════════════════════════════
// Quick anomaly check (cheapest possible)
// ═══════════════════════════════════════════

export async function quickAnomalyCheck(marketDataSummary: string): Promise<boolean> {
    try {
        const response = await geminiClient.chat.completions.create({
            model: "gemini-2.0-flash-lite",
            messages: [
                { role: "system", content: "Respond YES or NO only." },
                { role: "user", content: `Is this a market anomaly? ${marketDataSummary}` },
            ],
            temperature: 0.0,
            max_tokens: 3,
        });
        return response.choices[0]?.message?.content?.trim().toUpperCase().includes("YES") || false;
    } catch { return false; }
}

// ═══════════════════════════════════════════
// Stats
// ═══════════════════════════════════════════

export function getLLMSessionStats() {
    return {
        ...sessionStats,
        activeCalls,
        queueLength: callQueue.length,
        cacheSize: responseCache.size,
    };
}

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════

function parseJsonRobust(content: string, isJson: boolean): any {
    if (!isJson) return content;
    // Strip markdown code fences
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
}

function trackUsage(usage: LLMUsage) {
    sessionStats.totalCalls++;
    sessionStats.totalPromptTokens += usage.promptTokens;
    sessionStats.totalCompletionTokens += usage.completionTokens;

    console.log(
        `[LLM] ${usage.provider.toUpperCase()} ${usage.model}: ${usage.promptTokens}→${usage.completionTokens} tok | ${usage.durationMs}ms | Cache: ${responseCache.size} | Calls: G${sessionStats.geminiCalls}/Q${sessionStats.groqCalls}`
    );

    let costPer1kPrompt = 0;
    let costPer1kCompletion = 0;
    if (usage.model.includes('70b') || usage.model.includes('70B')) {
        costPer1kPrompt = 0.00059;
        costPer1kCompletion = 0.00079;
    } else if (usage.model.includes('8b') || usage.model.includes('8B')) {
        costPer1kPrompt = 0.00005;
        costPer1kCompletion = 0.00008;
    }
    const realCost = ((usage.promptTokens / 1000) * costPer1kPrompt) + ((usage.completionTokens / 1000) * costPer1kCompletion);

    const io = _getIoInstance();
    if (io) {
        io.emit('api_cost_update', {
            model: usage.model,
            input_tokens: usage.promptTokens,
            output_tokens: usage.completionTokens,
            cost_usd: realCost,
            latency_ms: usage.durationMs,
            timestamp: new Date().toISOString()
        });
    }

    TelemetryLogger.logApiUsage(usage.model, usage.promptTokens, usage.completionTokens).catch(() => {});
}
