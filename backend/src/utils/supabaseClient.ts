import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
    throw new Error("[Supabase] SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env");
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

// ═══════════════════════════════════════════
// Paper Trading DB Operations
// ═══════════════════════════════════════════

export async function savePaperPosition(position: any) {
    const { data, error } = await supabase
        .from("paper_positions")
        .upsert({
            id: position.id,
            symbol: position.symbol,
            side: position.side,
            entry_price: position.entryPrice,
            quantity: position.quantity,
            notional_value: position.notionalValue,
            stop_loss: position.stopLoss,
            take_profit: position.takeProfit,
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

export async function updatePaperBalance(balance: number, equity: number, dailyDD: number, maxDD: number) {
    const { error } = await supabase
        .from("paper_account")
        .upsert({
            id: "main",
            balance,
            equity,
            daily_drawdown: dailyDD,
            max_drawdown: maxDD,
            updated_at: new Date().toISOString(),
        }, { onConflict: "id" });

    if (error) console.error("[Supabase] Error updating balance:", error.message);
}

export async function getPaperBalance() {
    const { data, error } = await supabase
        .from("paper_account")
        .select("*")
        .eq("id", "main")
        .single();

    if (error && !error.message.includes('coerce')) {
        console.error("[Supabase] Error fetching balance:", error.message);
    }
    return data;
}

// ═══════════════════════════════════════════
// Agent Memory (Long-term context files)
// ═══════════════════════════════════════════

export async function saveAgentMemory(agentId: string, key: string, content: string) {
    const { error } = await supabase
        .from("agent_memory")
        .upsert({
            agent_id: agentId,
            key,
            content,
            updated_at: new Date().toISOString(),
        }, { onConflict: "agent_id,key" });

    if (error && !error.message.includes('row-level security')) {
        console.error("[Supabase] Error saving memory:", error.message);
    }
}

export async function getAgentMemory(agentId: string, key: string) {
    const { data, error } = await supabase
        .from("agent_memory")
        .select("content, updated_at")
        .eq("agent_id", agentId)
        .eq("key", key)
        .single();

    if (error && error.code !== "PGRST116") {
        console.error("[Supabase] Error fetching memory:", error.message);
    }
    return data;
}

export async function getAllAgentMemories(agentId: string) {
    const { data, error } = await supabase
        .from("agent_memory")
        .select("*")
        .eq("agent_id", agentId)
        .order("updated_at", { ascending: false });

    if (error) console.error("[Supabase] Error fetching memories:", error.message);
    return data || [];
}

// ═══════════════════════════════════════════
// System Config (Kill switches, mode, etc.)
// ═══════════════════════════════════════════

export async function getSystemConfig() {
    const { data, error } = await supabase
        .from("system_config")
        .select("*")
        .eq("id", "global")
        .single();

    if (error && error.code !== "PGRST116") {
        console.error("[Supabase] Error fetching config:", error.message);
    }
    return data;
}

export async function updateSystemConfig(updates: Record<string, any>) {
    const { error } = await supabase
        .from("system_config")
        .upsert({
            id: "global",
            ...updates,
            updated_at: new Date().toISOString(),
        }, { onConflict: "id" });

    if (error) console.error("[Supabase] Error updating config:", error.message);
}

// ═══════════════════════════════════════════
// Market Rules Persistence (MARKET_RULES)
// ═══════════════════════════════════════════

export async function saveMarketRules(rules: Record<string, any>) {
    const { error } = await supabase
        .from("agent_memory")
        .upsert({
            agent_id: "system",
            key: "market_rules",
            content: JSON.stringify(rules),
            updated_at: new Date().toISOString(),
        }, { onConflict: "agent_id,key" });

    if (error) console.error("[Supabase] Error saving market rules:", error.message);
    else console.log("[Supabase] ✅ MARKET_RULES guardadas en Supabase.");
}

export async function loadMarketRules(): Promise<Record<string, any> | null> {
    const { data, error } = await supabase
        .from("agent_memory")
        .select("content")
        .eq("agent_id", "system")
        .eq("key", "market_rules")
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

