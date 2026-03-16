---
description: Cómo gestionar llamadas a APIs LLM (Groq, Gemini, OpenRouter) de forma responsable
---

# Gestión Responsable de Llamadas a APIs LLM

## Reglas de Oro

1. **NUNCA lanzar llamadas en paralelo** (`Promise.all` con múltiples LLM calls está PROHIBIDO)
2. **Siempre procesar secuencialmente** — una llamada a la vez, con `await`
3. **Usar cache de respuestas** — misma pregunta = misma respuesta (TTL 30s mínimo)
4. **Throttle por símbolo** — no analizar el mismo activo más de 1 vez cada 30 segundos
5. **Concurrencia máxima: 2** — nunca más de 2 llamadas LLM simultáneas en todo el sistema

## Orden de Prioridad de Proveedores

| Prioridad | Proveedor | Modelo | Costo/1M tokens | Uso |
|-----------|-----------|--------|-----------------|-----|
| 1 (rutina) | **Groq** | `llama-3.1-8b-instant` | $0.05 in / $0.08 out | Sentinel, Scanner, análisis rutinario |
| 2 (CEO) | **Gemini** | `gemini-3.1-pro-preview` | $2/M in, $12/M out | CEO decisiones, tool calling (MODELO TOP) |
| 3 (backup) | **Gemini** | `gemini-2.0-flash-lite` | GRATIS (1000/día) | Fallback automático si Groq falla |

> **⚠️ NO USAR OPENROUTER** — Solo Groq y Gemini.

## Implementación del Cache

```typescript
// Hash MD5 del prompt → respuesta cacheada (TTL 30s)
const cacheKey = crypto.createHash('md5').update(systemPrompt.slice(0,200) + userPrompt.slice(0,500)).digest('hex');
const cached = responseCache.get(cacheKey);
if (cached && Date.now() - cached.timestamp < 30_000) return cached; // Cache hit!
```

## Groq Prompt Caching Automático

Groq aplica **50% descuento automático** cuando el mismo system prompt se repite.
- No necesita configuración extra
- El mismo system prompt del Sentinel se cachea automáticamente
- Reducción real: de $0.05 a $0.025 por millón de input tokens

## Patrón Correcto para Procesamiento de Anomalías

```typescript
// ✅ CORRECTO: Secuencial con pausa
for (const anomaly of anomalies.slice(0, 5)) {
    await analyzeAnomaly(anomaly);        // await, no fire-and-forget
    await new Promise(r => setTimeout(r, 3000)); // 3s entre llamadas
}

// ❌ INCORRECTO: Paralelo masivo
await Promise.all(anomalies.map(a => analyzeAnomaly(a))); // PROHIBIDO
```

## Patrón Correcto para Scanner

```typescript
// ✅ CORRECTO: Solo el MEJOR candidato por ciclo
hotAssets.sort((a, b) => b.score - a.score);
const best = hotAssets[0];
if (best) await analyzeHotAsset(best); // Solo 1

// ❌ INCORRECTO: Todos los candidatos en paralelo
hotAssets.forEach(a => analyzeHotAsset(a).catch(console.error)); // PROHIBIDO
```

## Límites de Rate

| Proveedor | Free Tier | Límite RPM | Límite RPD |
|-----------|-----------|------------|------------|
| Groq | Sí | 30 RPM | 14,400/día |
| Gemini | Sí | 15 RPM | 1,000/día |
| OpenRouter | No | Varía | Varía |

## Checklist Antes de Hacer Cambios en LLM

- [ ] ¿Estoy usando `await` en cada llamada LLM?
- [ ] ¿Hay un throttle por símbolo (mín 30s)?
- [ ] ¿El cache de respuestas está activo?
- [ ] ¿La concurrencia máxima es ≤ 2?
- [ ] ¿Estoy usando el modelo MÁS BARATO posible?
- [ ] ¿Evité `Promise.all` con múltiples LLM calls?
