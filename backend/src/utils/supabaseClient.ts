import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
    throw new Error("[Supabase] SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env");
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

/**
 * Creates a Supabase client scoped to a specific user's JWT.
 * RLS policies will automatically filter rows by auth.uid().
 */
export function createUserClient(accessToken: string): SupabaseClient {
    return createClient(supabaseUrl, supabaseKey, {
        global: {
            headers: { Authorization: `Bearer ${accessToken}` },
        },
    });
}

// ═══════════════════════════════════════════
// Paper Trading DB Operations
// ═══════════════════════════════════════════

export async function savePaperPosition(position: any, marketId: string, userId: string) {
    const { data, error } = await supabase
        .from("paper_positions")
        .upsert({
            id: position.id,
            user_id: userId,
            market_id: marketId,
            exchange: position.exchange || 'unknown',
            symbol: position.symbol,
            side: position.side,
            entry_price: position.entryPrice,
            quantity: position.quantity,
            notional_value: position.notionalValue,
            stop_loss: position.stopLoss,
            take_profit: position.takeProfit,
            leverage: position.leverage || 1,
            trailing_stop_pct: position.trailingStop?.active ? position.trailingStop.callbackPct : null,
            rationale: position.rationale || 'N/A',
            status: position.status,
            unrealized_pnl: position.unrealizedPnl,
            realized_pnl: position.realizedPnl,
            opened_at: new Date(position.openedAt).toISOString(),
            closed_at: position.closedAt ? new Date(position.closedAt).toISOString() : null,
            close_price: position.closePrice ?? null,
        }, { onConflict: "id" });

    if (error) console.error("[Supabase] Error saving position:", error.message);
    return data;
}

export async function updatePaperBalance(marketId: string, balance: number, equity: number, dailyDD: number, maxDD: number, totalPnl: number, initialBalance: number, peakBalance: number, dailyStartBalance: number, userId: string) {
    const { error } = await supabase
        .from("paper_account")
        .upsert({
            id: marketId,
            user_id: userId,
            balance,
            equity,
            daily_drawdown: dailyDD,
            max_drawdown: maxDD,
            total_pnl: totalPnl,
            initial_balance: initialBalance,
            peak_balance: peakBalance,
            daily_start_balance: dailyStartBalance,
            updated_at: new Date().toISOString(),
        }, { onConflict: "id,user_id" });

    if (error) console.error(`[Supabase] Error updating balance for ${marketId}:`, error.message);
}

export async function getAllPaperAccounts(userId: string) {
    const { data, error } = await supabase
        .from("paper_account")
        .select("*")
        .eq("user_id", userId);
    if (error && !error.message.includes('coerce')) {
        console.error("[Supabase] Error fetching all accounts:", error.message);
    }
    return data || [];
}

export async function getOpenPaperPositions(userId: string) {
    const { data, error } = await supabase
        .from("paper_positions")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "OPEN");
    if (error) {
        console.error("[Supabase] Error fetching open positions:", error.message);
    }
    return data || [];
}

// ═══════════════════════════════════════════
// Agent Memory (Long-term context files)
// ═══════════════════════════════════════════

export async function saveAgentMemory(agentId: string, key: string, content: string, userId: string) {
    const { error } = await supabase
        .from("agent_memory")
        .upsert({
            agent_id: agentId,
            key,
            content,
            user_id: userId,
            updated_at: new Date().toISOString(),
        }, { onConflict: "agent_id,key,user_id" });

    if (error && !error.message.includes('row-level security')) {
        console.error("[Supabase] Error saving memory:", error.message);
    }
}

export async function getAgentMemory(agentId: string, key: string, userId: string) {
    const { data, error } = await supabase
        .from("agent_memory")
        .select("content, updated_at")
        .eq("agent_id", agentId)
        .eq("key", key)
        .eq("user_id", userId)
        .single();

    if (error && error.code !== "PGRST116") {
        console.error("[Supabase] Error fetching memory:", error.message);
    }
    return data;
}

export async function getAllAgentMemories(agentId: string, userId: string) {
    const { data, error } = await supabase
        .from("agent_memory")
        .select("*")
        .eq("agent_id", agentId)
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

    if (error) console.error("[Supabase] Error fetching memories:", error.message);
    return data || [];
}

// ═══════════════════════════════════════════
// System Config (Kill switches, mode, etc.)
// ═══════════════════════════════════════════

export async function getSystemConfig(userId: string) {
    const { data, error } = await supabase
        .from("system_config")
        .select("*")
        .eq("user_id", userId);

    if (error) {
        console.error("[Supabase] Error fetching config:", error.message);
    }
    return data || [];
}

export async function updateSystemConfig(key: string, value: string, userId: string) {
    const { error } = await supabase
        .from("system_config")
        .upsert({
            key,
            value,
            user_id: userId,
            updated_at: new Date().toISOString(),
        }, { onConflict: "key,user_id" });

    if (error) console.error("[Supabase] Error updating config:", error.message);
}

// ═══════════════════════════════════════════
// Market Rules Persistence (MARKET_RULES)
// ═══════════════════════════════════════════

export async function saveMarketRules(rules: Record<string, any>, userId: string) {
    const { error } = await supabase
        .from("agent_memory")
        .upsert({
            agent_id: "system",
            key: "market_rules",
            content: JSON.stringify(rules),
            user_id: userId,
            updated_at: new Date().toISOString(),
        }, { onConflict: "agent_id,key,user_id" });

    if (error) console.error("[Supabase] Error saving market rules:", error.message);
    else console.log("[Supabase] ✅ MARKET_RULES guardadas en Supabase.");
}

export async function loadMarketRules(userId: string): Promise<Record<string, any> | null> {
    const { data, error } = await supabase
        .from("agent_memory")
        .select("content")
        .eq("agent_id", "system")
        .eq("key", "market_rules")
        .eq("user_id", userId)
        .single();

    if (error && error.code !== "PGRST116") {
        console.error("[Supabase] Error loading market rules:", error.message);
    }
    if (data?.content) {
        try {
            const rules = typeof data.content === 'string' ? JSON.parse(data.content) : data.content;
            console.log("[Supabase] ✅ MARKET_RULES cargadas desde Supabase.");
            return rules;
        } catch {
            console.error("[Supabase] Error parsing market rules JSON.");
        }
    }
    return null;
}

// ═══════════════════════════════════════════
// User Session Seed — Auto-create accounts for new users
// ═══════════════════════════════════════════

const MARKET_IDS = ["crypto", "meme", "trad_free", "axi", "small_caps"];

export async function seedUserAccounts(userId: string): Promise<void> {
    const existing = await getAllPaperAccounts(userId);
    if (existing.length >= MARKET_IDS.length) return; // Already seeded

    const existingIds = new Set(existing.map(a => a.id));
    const missing = MARKET_IDS.filter(m => !existingIds.has(m));

    if (missing.length === 0) return;

    console.log(`[Supabase] 🌱 Seeding ${missing.length} paper accounts for user ${userId.slice(0, 8)}...`);

    const rows = missing.map(m => ({
        id: m,
        user_id: userId,
        balance: 10000,
        equity: 10000,
        daily_drawdown: 0,
        max_drawdown: 0,
        total_pnl: 0,
        initial_balance: 10000,
        peak_balance: 10000,
        daily_start_balance: 10000,
    }));

    const { error } = await supabase.from("paper_account").insert(rows);
    if (error) console.error("[Supabase] Error seeding accounts:", error.message);
    else console.log(`[Supabase] ✅ ${missing.length} accounts seeded.`);
}
