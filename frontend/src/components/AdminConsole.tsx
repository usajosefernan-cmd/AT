import React, { useState, useEffect, useCallback } from "react";
import { Settings, Shield, RefreshCw, Database, Eye, EyeOff, Save, AlertTriangle, CheckCircle2, Trash2, FolderOpen, Plus } from "lucide-react";

// Use dynamic keys — supports global config + per-market rules
type ConfigState = Record<string, string>;

// Profile type
interface EcoProfile {
    name: string;
    data: Record<string, string>;
}

// ── No exchange dropdown needed, intrinsic to the ecosystem ──

// Fields that belong to each ecosystem (without the market_{id}_ prefix)
const ECO_FIELDS = [
    "daily_dd", "total_dd", "max_notional", "balance",
    "leverage", "position_pct", "risk_per_trade", "hold_minutes",
    "mode", "enabled", "sl_bps", "tp_bps",
    // Cripto fields
    "hl_wallet", "hl_pk", "hl_wss",
    "aster_key", "aster_secret", "aster_wss",
    // Memecoins fields
    "mexc_key", "mexc_secret", "mexc_wss",
    // Equities fields
    "alpaca_key", "alpaca_secret", "alpaca_wss",
    // Forex fields
    "axi_account", "axi_password", "axi_server",
    // Small Caps fields
    "alpaca_sc_key", "alpaca_sc_secret", "alpaca_sc_wss"
];

const defaultConfig: ConfigState = {
    market_crypto_daily_dd: "5", market_crypto_total_dd: "10", market_crypto_max_notional: "5000", market_crypto_balance: "10000",
    market_crypto_leverage: "10", market_crypto_position_pct: "30", market_crypto_risk_per_trade: "3", market_crypto_hold_minutes: "0",
    market_crypto_mode: "paper", market_crypto_enabled: "true",
    market_crypto_hl_wallet: "", market_crypto_hl_pk: "", market_crypto_hl_wss: "wss://api.hyperliquid.xyz/ws",
    market_crypto_aster_key: "", market_crypto_aster_secret: "", market_crypto_aster_wss: "wss://api.aster.exchange/ws",

    market_meme_daily_dd: "5", market_meme_total_dd: "10", market_meme_max_notional: "5000", market_meme_balance: "10000",
    market_meme_leverage: "1", market_meme_position_pct: "10", market_meme_risk_per_trade: "2", market_meme_hold_minutes: "60",
    market_meme_mode: "paper", market_meme_enabled: "true",
    market_meme_mexc_key: "", market_meme_mexc_secret: "", market_meme_mexc_wss: "wss://wbs.mexc.com/ws",

    market_trad_free_daily_dd: "5", market_trad_free_total_dd: "10", market_trad_free_max_notional: "5000", market_trad_free_balance: "10000",
    market_trad_free_leverage: "1", market_trad_free_position_pct: "25", market_trad_free_risk_per_trade: "3", market_trad_free_hold_minutes: "0",
    market_trad_free_mode: "paper", market_trad_free_enabled: "true",
    market_trad_free_alpaca_key: "", market_trad_free_alpaca_secret: "", market_trad_free_alpaca_wss: "wss://stream.data.alpaca.markets/v2/iex",

    market_axi_daily_dd: "5", market_axi_total_dd: "10", market_axi_max_notional: "5000", market_axi_balance: "10000",
    market_axi_leverage: "30", market_axi_position_pct: "20", market_axi_risk_per_trade: "2", market_axi_hold_minutes: "480",
    market_axi_mode: "paper", market_axi_enabled: "true",
    market_axi_axi_account: "", market_axi_axi_password: "", market_axi_axi_server: "AxiTrader-Live",
    market_axi_sl_bps: "15", market_axi_tp_bps: "45",

    market_small_caps_daily_dd: "5", market_small_caps_total_dd: "10", market_small_caps_max_notional: "5000", market_small_caps_balance: "10000",
    market_small_caps_leverage: "1", market_small_caps_position_pct: "10", market_small_caps_risk_per_trade: "2", market_small_caps_hold_minutes: "30",
    market_small_caps_mode: "paper", market_small_caps_enabled: "true",
    market_small_caps_alpaca_sc_key: "", market_small_caps_alpaca_sc_secret: "", market_small_caps_alpaca_sc_wss: "wss://stream.data.alpaca.markets/v2/sip",

    // Agent missions
    agent_ceo_mission: "Dirigir el enjambre hacia la rentabilidad máxima protegiendo el capital.",
    agent_sentinel_mission: "Detectar anomalías de volumen y momentum en milisegundos.",
    agent_risk_mission: "Audit de cumplimiento estricto de las reglas de Axi Select.",
    agent_perp_mission: "Maximizar trades asimétricos en cripto perps de alta liquidez.",
    agent_sniper_mission: "Detectar y ejecutar en memecoins antes de la explosión de volumen retail.",
    agent_equity_mission: "Analizar correlaciones del SPY y NVDA para trades institucionales.",
    agent_forex_mission: "Explotar ineficiencias macro en pares mayores y el Oro.",
};

// ── Define visual configuration for per-ecosystem credentials ──
type CredentialField = { key: string; label: string; secret: boolean; placeholder?: string; readonly?: boolean; readonlyVal?: string };
type ExchangeCreds = { title: string; fields: CredentialField[] }[];

const ECO_CREDENTIALS: Record<string, ExchangeCreds> = {
    crypto: [
        {
            title: "HYPERLIQUID (DEX Perp)",
            fields: [
                { key: "hl_wallet", label: "Wallet Address (L1)", secret: false },
                { key: "hl_pk", label: "Private Key", secret: true },
                { key: "hl_wss", label: "WSS/API Endpoint (Monitor/Paper)", secret: false, readonly: true, readonlyVal: "wss://api.hyperliquid.xyz/ws" }
            ]
        },
        {
            title: "ASTER.EXCHANGE (DEX Spot/Perp)",
            fields: [
                { key: "aster_key", label: "Aster API Key / Wallet", secret: false },
                { key: "aster_secret", label: "Aster API Secret / PK", secret: true },
                { key: "aster_wss", label: "WSS/API Endpoint (Monitor/Paper)", secret: false, readonly: true, readonlyVal: "wss://api.aster.exchange/ws" }
            ]
        }
    ],
    meme: [
        {
            title: "MEXC (Spot CEX)",
            fields: [
                { key: "mexc_key", label: "MEXC API Key", secret: false, placeholder: "mx0..." },
                { key: "mexc_secret", label: "MEXC API Secret", secret: true },
                { key: "mexc_wss", label: "WSS/API Endpoint (Monitor/Paper)", secret: false, readonly: true, readonlyVal: "wss://wbs.mexc.com/ws" }
            ]
        }
    ],
    trad_free: [
        {
            title: "ALPACA (Tradicional FREE)",
            fields: [
                { key: "alpaca_key", label: "Alpaca API Key", secret: false, placeholder: "PK..." },
                { key: "alpaca_secret", label: "Alpaca API Secret", secret: true },
                { key: "alpaca_wss", label: "WSS Data Endpoint (Monitor/Paper)", secret: false, readonly: true, readonlyVal: "wss://stream.data.alpaca.markets/v2/iex" }
            ]
        }
    ],
    axi: [
        {
            title: "AXI SELECT (Prop Firm MT4/MT5)",
            fields: [
                { key: "axi_account", label: "Account ID (Login)", secret: false },
                { key: "axi_password", label: "Password", secret: true },
                { key: "axi_server", label: "Server Name", secret: false, placeholder: "AxiTrader-Live" }
            ]
        }
    ],
    small_caps: [
        {
            title: "ALPACA (Small Caps intradía)",
            fields: [
                { key: "alpaca_sc_key", label: "Alpaca API Key", secret: false, placeholder: "PK..." },
                { key: "alpaca_sc_secret", label: "Alpaca API Secret", secret: true },
                { key: "alpaca_sc_wss", label: "WSS Data Endpoint (Monitor/Paper)", secret: false, readonly: true, readonlyVal: "wss://stream.data.alpaca.markets/v2/sip" }
            ]
        }
    ]
};

const API = () => import.meta.env.VITE_API_URL || "http://localhost:8080";

const AdminConsole: React.FC = () => {
    const [configs, setConfigs] = useState<ConfigState>(defaultConfig);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
    const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
    const [activeMarket, setActiveMarket] = useState("crypto");

    // ── Profile state per ecosystem ──
    const [profiles, setProfiles] = useState<Record<string, EcoProfile[]>>({});
    const [activeProfile, setActiveProfile] = useState<Record<string, string>>({}); // ecosystem -> profile name

    // ── Helpers: extract/inject ecosystem data ──
    const getEcoData = useCallback((eco: string): Record<string, string> => {
        const data: Record<string, string> = {};
        for (const field of ECO_FIELDS) {
            const key = `market_${eco}_${field}`;
            if (configs[key] !== undefined) data[field] = configs[key];
        }
        return data;
    }, [configs]);

    const setEcoData = useCallback((eco: string, data: Record<string, string>) => {
        setConfigs(prev => {
            const next = { ...prev };
            for (const [field, val] of Object.entries(data)) {
                next[`market_${eco}_${field}`] = val;
            }
            return next;
        });
    }, []);

    // ── Load profiles for an ecosystem ──
    const loadProfiles = useCallback(async (eco: string) => {
        try {
            const res = await fetch(`${API()}/api/config/profiles/${eco}`);
            const data = await res.json();
            if (data.success) {
                setProfiles(prev => ({ ...prev, [eco]: data.profiles || [] }));
            }
        } catch {}
    }, []);

    // ── Load config from backend ──
    const loadConfig = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const response = await fetch(`${API()}/api/config`);
            const data = await response.json();
            const loadedConfig = { ...defaultConfig };
            if (data.success && data.config) {
                data.config.forEach((row: any) => {
                    loadedConfig[row.key] = String(row.value);
                });
            }

            // Merge from backend in-memory MARKET_RULES for fields not yet in system_config
            try {
                const riskRes = await fetch(`${API()}/api/config/risk`);
                const riskData = await riskRes.json();
                if (riskData.markets) {
                    for (const [marketId, rules] of Object.entries(riskData.markets)) {
                        const r = rules as any;
                        const k = (f: string) => `market_${marketId}_${f}`;
                        if (!data.config?.find((c: any) => c.key === k('leverage')))
                            loadedConfig[k('leverage')] = String(r.maxLeverage ?? "");
                        if (!data.config?.find((c: any) => c.key === k('position_pct')))
                            loadedConfig[k('position_pct')] = String(r.maxPositionPct ?? "");
                        if (!data.config?.find((c: any) => c.key === k('risk_per_trade')))
                            loadedConfig[k('risk_per_trade')] = String(r.maxRiskPerTradePct ?? "");
                        if (!data.config?.find((c: any) => c.key === k('hold_minutes')))
                            loadedConfig[k('hold_minutes')] = String(r.maxHoldMinutes ?? 0);
                        if (!data.config?.find((c: any) => c.key === k('mode')))
                            loadedConfig[k('mode')] = String(r.mode ?? "paper");
                        if (!data.config?.find((c: any) => c.key === k('enabled')))
                            loadedConfig[k('enabled')] = String(r.enabled ?? "true");
                        
                        if (r.credentials) {
                            for (const [credKey, credVal] of Object.entries(r.credentials)) {
                                if (!data.config?.find((c: any) => c.key === k(credKey))) {
                                    loadedConfig[k(credKey)] = String(credVal);
                                }
                            }
                        }
                    }
                }
            } catch {}

            setConfigs(loadedConfig);

            // Load profiles for all ecosystems
            for (const eco of ["crypto", "meme", "trad_free", "axi", "small_caps"]) {
                loadProfiles(eco);
            }
        } catch (err) {
            console.error("Failed to load config:", err);
            setMessage({ text: "Error de enlace con el servidor central.", type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadConfig(); }, []);

    const handleChange = (key: string, value: string) => {
        setConfigs(prev => ({ ...prev, [key]: value }));
    };

    // ── Save ecosystem to backend (hot-reload + persist) ──
    const saveEcosystem = async (eco: string) => {
        setSaving(true);
        try {
            // Collect all market_{eco}_* keys
            const ecoKeys: Record<string, string> = {};
            for (const [k, v] of Object.entries(configs)) {
                if (k.startsWith(`market_${eco}_`)) ecoKeys[k] = v;
            }
            // Send to backend for hot-reload + Supabase persistence
            await fetch(`${API()}/api/config/risk`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(ecoKeys),
            });

            // If a profile is loaded, also update it
            const profileName = activeProfile[eco];
            if (profileName) {
                await saveProfileAs(eco, profileName);
            }

            setMessage({ text: `✅ ${eco.toUpperCase()} guardado y sincronizado.`, type: 'success' });
        } catch {
            setMessage({ text: "Error al guardar ecosistema.", type: 'error' });
        } finally {
            setSaving(false);
            setTimeout(() => setMessage(null), 4000);
        }
    };

    // ── Profile CRUD ──
    const saveProfileAs = async (eco: string, name: string) => {
        const data = getEcoData(eco);
        try {
            await fetch(`${API()}/api/config/profiles`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ecosystem: eco, name, data }),
            });
            setActiveProfile(prev => ({ ...prev, [eco]: name }));
            await loadProfiles(eco);
            setMessage({ text: `✅ Perfil "${name}" guardado para ${eco}.`, type: 'success' });
            setTimeout(() => setMessage(null), 4000);
        } catch {
            setMessage({ text: "Error al guardar perfil.", type: 'error' });
        }
    };

    const loadProfile = (eco: string, name: string) => {
        const profile = (profiles[eco] || []).find(p => p.name === name);
        if (!profile) return;
        setEcoData(eco, profile.data);
        setActiveProfile(prev => ({ ...prev, [eco]: name }));
        setMessage({ text: `Perfil "${name}" cargado. Pulsa GUARDAR para aplicar.`, type: 'success' });
        setTimeout(() => setMessage(null), 3000);
    };

    const deleteProfile = async (eco: string, name: string) => {
        if (!confirm(`¿Eliminar perfil "${name}" de ${eco}?`)) return;
        try {
            await fetch(`${API()}/api/config/profiles`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ecosystem: eco, name }),
            });
            if (activeProfile[eco] === name) {
                setActiveProfile(prev => { const n = { ...prev }; delete n[eco]; return n; });
            }
            await loadProfiles(eco);
            setMessage({ text: `Perfil "${name}" eliminado.`, type: 'success' });
            setTimeout(() => setMessage(null), 3000);
        } catch {
            setMessage({ text: "Error al eliminar perfil.", type: 'error' });
        }
    };

    const promptSaveAs = (eco: string) => {
        const name = prompt("Nombre del perfil:");
        if (!name || !name.trim()) return;
        saveProfileAs(eco, name.trim());
    };

    // ── Save agent missions (non-market config) ──
    const saveAgentMissions = async () => {
        setSaving(true);
        try {
            const agentEntries = Object.entries(configs).filter(([key]) => key.startsWith("agent_"));
            await Promise.all(agentEntries.map(([key, value]) =>
                fetch(`${API()}/api/config`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ key, value: String(value) }),
                })
            ));
            setMessage({ text: "✅ Directivas de agentes guardadas.", type: 'success' });
        } catch {
            setMessage({ text: "Error al guardar directivas.", type: 'error' });
        } finally {
            setSaving(false);
            setTimeout(() => setMessage(null), 4000);
        }
    };

    const toggleSecret = (key: string) => {
        setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // ── Render helpers ──
    const renderConfigField = (label: string, k: string, opts?: { isSecret?: boolean; placeholder?: string; readonly?: boolean; readonlyVal?: string }) => {
        const isSecret = opts?.isSecret ?? (k.includes('key') || k.includes('secret') || k.includes('private') || k.includes('wallet') || k.includes('password'));
        const show = showSecrets[k];
        const val = opts?.readonly ? (opts.readonlyVal || "") : (configs[k] || "");

        return (
            <div key={k} className="flex flex-col gap-2 mb-4 group w-full">
                <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-[#5a6577] uppercase tracking-widest group-hover:text-[#4a6cf7] transition-colors">{label}</label>
                </div>
                <div className="relative group/input">
                    <input
                        type={isSecret && !show ? "password" : "text"}
                        value={val}
                        readOnly={opts?.readonly}
                        onChange={(e) => !opts?.readonly && handleChange(k, e.target.value)}
                        className={`w-full bg-[#0b0e14] border border-[#1a1f2e] group-hover/input:border-[#4a6cf7]/30 rounded-xl px-4 py-3 text-[11px] font-mono ${opts?.readonly ? 'text-[#5a6577] bg-[#060a10] cursor-not-allowed select-all' : 'text-white'} focus:outline-none focus:ring-1 focus:ring-[#4a6cf7]/30 transition-all placeholder-[#2a3545]`}
                        placeholder={opts?.placeholder || `Ingresar ${label.toLowerCase()}...`}
                    />
                    {isSecret && !opts?.readonly && (
                        <button type="button" onClick={() => toggleSecret(k)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3a4555] hover:text-[#4a6cf7] transition-colors">
                            {show ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                    )}
                    {k.includes('pct') && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-[#3a4555] font-mono">%</span>}
                    {k.includes('notional') && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-[#3a4555] font-mono">$</span>}
                </div>
            </div>
        );
    };

    const renderSelectField = (label: string, k: string, options: string[]) => (
        <div key={k} className="flex flex-col gap-2 mb-4 group">
            <label className="text-[10px] font-black text-[#5a6577] uppercase tracking-widest group-hover:text-[#4a6cf7] transition-colors">{label}</label>
            <select
                value={configs[k] || options[0]}
                onChange={(e) => handleChange(k, e.target.value)}
                className="w-full bg-[#0b0e14] border border-[#1a1f2e] rounded-xl px-4 py-3 text-[11px] font-mono text-white focus:outline-none focus:ring-1 focus:ring-[#4a6cf7]/30 transition-all appearance-none cursor-pointer"
            >
                {options.map(opt => <option key={opt} value={opt} className="bg-[#0b0e14]">{opt}</option>)}
            </select>
        </div>
    );

    const renderToggle = (label: string, k: string) => {
        const isOn = configs[k] === "true" || configs[k] === "1";
        return (
            <div key={k} className="flex items-center justify-between mb-4 group">
                <label className="text-[10px] font-black text-[#5a6577] uppercase tracking-widest group-hover:text-[#4a6cf7] transition-colors">{label}</label>
                <button type="button" onClick={() => handleChange(k, isOn ? "false" : "true")}
                    className={`relative w-12 h-6 rounded-full transition-all duration-300 ${isOn ? 'bg-[#22c55e]' : 'bg-[#1a1f2e]'}`}>
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${isOn ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
            </div>
        );
    };

    // ═══════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════
    const MARKETS = [
        { id: "crypto", label: "Cripto", icon: "₿", color: "#a78bfa", desc: "Hyperliquid y aster.exchange" },
        { id: "meme", label: "Memecoins", icon: "🐸", color: "#f472b6", desc: "MEXC" },
        { id: "trad_free", label: "Tradicional FREE", icon: "📊", color: "#22c55e", desc: "Forex, commodities, acciones, índices (Alpaca)" },
        { id: "axi", label: "Tradicional AXI Select", icon: "💱", color: "#f59e0b", desc: "Axi - Prop Firm con reglas estrictas" },
        { id: "small_caps", label: "Small Caps", icon: "🔬", color: "#06b6d4", desc: "Acciones americanas intradiarias (Alpaca)" },
    ];

    const m = MARKETS.find(x => x.id === activeMarket)!;
    const ecoProfiles = profiles[activeMarket] || [];
    const loadedProfileName = activeProfile[activeMarket] || null;

    return (
        <div className="h-full flex flex-col bg-[#060a10] overflow-hidden">
            {/* Header */}
            <div className="px-10 py-8 border-b border-[#1a1f2e] bg-[#0b0e14]/50 flex items-center justify-between backdrop-blur-xl">
                <div className="flex items-center gap-6">
                    <div className="w-14 h-14 rounded-2xl bg-[#ef4444]/10 border border-[#ef4444]/20 flex items-center justify-center text-[#ef4444] shadow-[0_0_20px_rgba(239,68,68,0.1)]">
                        <Settings size={28} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-white uppercase tracking-[0.4em] mb-1">CONSOLA DE MANDO</h1>
                        <div className="flex items-center gap-3">
                            <span className="flex h-2 w-2 rounded-full bg-[#22c55e] animate-pulse" />
                            <p className="text-[10px] text-[#5a6577] font-mono uppercase tracking-[0.2em]">Configuración de Grado Operativo • V5.0</p>
                        </div>
                    </div>
                </div>
                <button onClick={loadConfig} disabled={loading}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#111622] border border-[#1a1f2e] text-[#8a95a7] text-[10px] font-black uppercase tracking-widest hover:text-white hover:bg-[#1a1f2e] transition-all disabled:opacity-30">
                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                    RECUPERAR NÚCLEO
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-10 no-scrollbar">
                <div className="max-w-6xl mx-auto space-y-10">

                    {/* ══════ ECOSYSTEM CONFIG ══════ */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 px-2">
                            <Shield size={18} className="text-[#4a6cf7]" />
                            <h3 className="text-[12px] font-black text-white uppercase tracking-[0.3em]">Gestión de Riesgo por Ecosistema</h3>
                        </div>

                        <div className="bg-[#0b0e14]/60 border border-[#1a1f2e] rounded-3xl backdrop-blur-sm relative overflow-hidden flex min-h-[600px] shadow-xl">
                            {/* ── Sidebar ── */}
                            <div className="w-[180px] border-r border-[#1a1f2e] bg-[#060a10]/80 p-4 space-y-2 shrink-0">
                                <div className="text-[8px] font-black text-[#5a6577] uppercase tracking-[0.3em] mb-4">Ecosistemas</div>
                                {MARKETS.map(market => {
                                    const isEnabled = configs[`market_${market.id}_enabled`] !== "false";
                                    const modeLabel = configs[`market_${market.id}_mode`] === "live" ? "LIVE" : "PAPER";
                                    const profName = activeProfile[market.id];
                                    return (
                                        <button key={market.id} type="button" onClick={() => setActiveMarket(market.id)}
                                            className={`w-full text-left px-3 py-3 rounded-xl transition-all border-l-4 group flex items-center gap-2 ${activeMarket === market.id ? 'bg-white/5' : 'border-transparent hover:bg-white/5 opacity-50 hover:opacity-100'}`}
                                            style={{ borderLeftColor: activeMarket === market.id ? market.color : 'transparent' }}>
                                            <span className="text-[14px]" style={{ color: market.color }}>{market.icon}</span>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-[10px] font-black text-white tracking-widest uppercase truncate">{market.label}</span>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isEnabled ? 'bg-[#22c55e]' : 'bg-[#ef4444]'}`} />
                                                    <span className={`text-[7px] font-mono uppercase tracking-wider ${modeLabel === 'LIVE' ? 'text-[#f59e0b]' : 'text-[#5a6577]'}`}>{modeLabel}</span>
                                                </div>
                                                {profName && (
                                                    <span className="text-[7px] font-mono text-[#4a6cf7] truncate mt-0.5" title={profName}>📁 {profName}</span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* ── Active Market Panel ── */}
                            <div className="flex-1 p-6 relative flex flex-col">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-[#4a6cf7]/5 blur-3xl rounded-full opacity-50 pointer-events-none" />

                                {/* Header + Profile Bar */}
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#111622] border border-[#1a1f2e] text-[16px] shadow-lg" style={{ color: m.color }}>{m.icon}</div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-[12px] font-black text-white uppercase tracking-widest">{m.label}</h4>
                                        <p className="text-[9px] text-[#5a6577] font-mono mt-0.5">{m.desc}</p>
                                    </div>
                                </div>

                                {/* ── Profile Management Bar ── */}
                                <div className="flex items-center gap-2 mb-5 p-3 bg-[#060a10]/80 border border-[#1a1f2e]/50 rounded-xl">
                                    <FolderOpen size={14} className="text-[#4a6cf7] shrink-0" />
                                    <select
                                        value={loadedProfileName || "__none__"}
                                        onChange={(e) => {
                                            if (e.target.value === "__none__") {
                                                setActiveProfile(prev => { const n = { ...prev }; delete n[activeMarket]; return n; });
                                            } else {
                                                loadProfile(activeMarket, e.target.value);
                                            }
                                        }}
                                        className="flex-1 bg-transparent border-none text-[10px] font-mono text-white focus:outline-none cursor-pointer min-w-0 truncate"
                                    >
                                        <option value="__none__" className="bg-[#0b0e14]">— Sin perfil —</option>
                                        {ecoProfiles.map(p => (
                                            <option key={p.name} value={p.name} className="bg-[#0b0e14]">{p.name}</option>
                                        ))}
                                    </select>

                                    {loadedProfileName && (
                                        <button type="button" onClick={() => deleteProfile(activeMarket, loadedProfileName)}
                                            className="p-1.5 rounded-lg hover:bg-[#ef4444]/20 text-[#5a6577] hover:text-[#ef4444] transition-all" title="Eliminar perfil">
                                            <Trash2 size={12} />
                                        </button>
                                    )}

                                    <div className="w-px h-5 bg-[#1a1f2e] mx-1" />

                                    <button type="button" onClick={() => promptSaveAs(activeMarket)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4a6cf7]/10 border border-[#4a6cf7]/30 text-[#4a6cf7] text-[8px] font-black uppercase tracking-widest hover:bg-[#4a6cf7]/20 transition-all whitespace-nowrap">
                                        <Plus size={10} />
                                        Guardar Como
                                    </button>
                                </div>

                                {/* ── Mode / Enabled ── */}
                                <div className="grid grid-cols-2 gap-4 mb-4 p-3 bg-[#060a10]/50 border border-[#1a1f2e]/50 rounded-xl">
                                    {renderSelectField("Modo", `market_${m.id}_mode`, ["paper", "live"])}
                                    {renderToggle("Activo", `market_${m.id}_enabled`)}
                                </div>

                                {/* ── Risk Parameters ── */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 gap-y-2 flex-1 overflow-y-auto pr-2 no-scrollbar">
                                    <div className="col-span-1 md:col-span-2 pt-2 border-b border-[#1a1f2e]/50 pb-2 mb-2">
                                        <span className="text-[8px] font-black text-[#5a6577] uppercase tracking-widest">Protección de Capital</span>
                                    </div>
                                    {renderConfigField("Drawdown Diario (%)", `market_${m.id}_daily_dd`)}
                                    {renderConfigField("Drawdown Total (%)", `market_${m.id}_total_dd`)}
                                    {renderConfigField("Notional Máximo ($)", `market_${m.id}_max_notional`)}
                                    {renderConfigField("Balance Inicial ($)", `market_${m.id}_balance`)}

                                    <div className="col-span-1 md:col-span-2 mt-2 pt-4 border-t border-[#1a1f2e]/50 pb-2 mb-2">
                                        <span className="text-[8px] font-black text-[#5a6577] uppercase tracking-widest">Reglas Operativas</span>
                                    </div>
                                    {renderConfigField("Leverage Máximo", `market_${m.id}_leverage`)}
                                    {renderConfigField("Tamaño Posición (%)", `market_${m.id}_position_pct`)}
                                    {renderConfigField("Riesgo / Trade (%)", `market_${m.id}_risk_per_trade`)}
                                    {renderConfigField("Max Hold (Min)", `market_${m.id}_hold_minutes`)}

                                    {/* API Keys per ecosystem */}
                                    {ECO_CREDENTIALS[m.id]?.map((exchange, i) => (
                                        <React.Fragment key={exchange.title}>
                                            <div className={`col-span-1 md:col-span-2 pt-4 border-t border-[#1a1f2e]/50 pb-2 mb-2 ${i === 0 ? 'mt-2' : 'mt-4'}`}>
                                                <span className="text-[8px] font-black text-[#f59e0b] uppercase tracking-widest">{exchange.title}</span>
                                            </div>
                                            {exchange.fields.map(field => renderConfigField(
                                                field.label,
                                                `market_${m.id}_${field.key}`,
                                                { isSecret: field.secret, placeholder: field.placeholder, readonly: field.readonly, readonlyVal: field.readonlyVal }
                                            ))}
                                        </React.Fragment>
                                    ))}

                                    {m.id === 'forex' && (
                                        <>
                                            <div className="col-span-1 md:col-span-2 mt-2 pt-4 border-t border-[#1a1f2e]/50">
                                                <span className="text-[8px] font-black text-[#f59e0b] uppercase tracking-widest">Reglas Prop Firm</span>
                                            </div>
                                            {renderConfigField("SL Dinámico (Bps)", `market_${m.id}_sl_bps`)}
                                            {renderConfigField("TP Target (Bps)", `market_${m.id}_tp_bps`)}
                                        </>
                                    )}
                                </div>

                                {/* ── ACTION BAR: Save + Emergency ── */}
                                <div className="mt-6 pt-6 border-t border-[#1a1f2e] flex items-center justify-between">
                                    <div className="flex gap-3">
                                        <button type="button"
                                            onClick={async () => {
                                                try {
                                                    await fetch(`${API()}/api/paper/reset-dd`, {
                                                        method: "POST", headers: { "Content-Type": "application/json" },
                                                        body: JSON.stringify({ market: m.id })
                                                    });
                                                    setMessage({ text: `✅ DD Reseteado para ${m.label}`, type: 'success' });
                                                    setTimeout(() => setMessage(null), 4000);
                                                } catch { setMessage({ text: "Error al resetear DD", type: 'error' }); }
                                            }}
                                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#f59e0b]/10 border border-[#f59e0b]/30 text-[#f59e0b] text-[9px] font-black uppercase tracking-widest hover:bg-[#f59e0b]/20 transition-all font-mono">
                                            <RefreshCw size={12} /> Reset DD
                                        </button>
                                        <button type="button"
                                            onClick={async () => {
                                                if (!confirm(`¿Reiniciar balance de ${m.label}?`)) return;
                                                try {
                                                    const bal = parseFloat(configs[`market_${m.id}_balance`]) || 10000;
                                                    await fetch(`${API()}/api/paper/reset-balance`, {
                                                        method: "POST", headers: { "Content-Type": "application/json" },
                                                        body: JSON.stringify({ market: m.id, balance: bal })
                                                    });
                                                    setMessage({ text: `✅ Balance de ${m.label} reiniciado`, type: 'success' });
                                                    setTimeout(() => setMessage(null), 4000);
                                                } catch { setMessage({ text: "Error al resetear balance", type: 'error' }); }
                                            }}
                                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] text-[9px] font-black uppercase tracking-widest hover:bg-[#ef4444]/20 transition-all font-mono">
                                            <AlertTriangle size={12} /> Reset Balance
                                        </button>
                                    </div>

                                    {/* ══ SAVE ECOSYSTEM BUTTON ══ */}
                                    <button type="button" onClick={() => saveEcosystem(activeMarket)} disabled={saving}
                                        className={`flex items-center gap-2 px-8 py-3 rounded-xl font-black text-[11px] uppercase tracking-[0.2em] transition-all ${
                                            saving ? 'bg-[#1a1f2e] text-[#3a4555] cursor-not-allowed'
                                                    : 'bg-[#4a6cf7] text-white hover:bg-[#3b82f6] shadow-[0_10px_30px_rgba(74,108,247,0.2)]'
                                        }`}>
                                        {saving ? (
                                            <><div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" /> GUARDANDO...</>
                                        ) : (
                                            <><Save size={14} /> 💾 GUARDAR {m.label.toUpperCase()}</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ══════ AGENT DIRECTIVES ══════ */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 px-2">
                            <Database size={18} className="text-[#a78bfa]" />
                            <h3 className="text-[12px] font-black text-white uppercase tracking-[0.3em]">Directivas Estratégicas de los Agentes</h3>
                        </div>

                        <div className="p-8 bg-[#0b0e14]/60 border border-[#1a1f2e] rounded-3xl backdrop-blur-sm relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-1.5 h-full bg-[#a78bfa]/20 group-hover:bg-[#a78bfa]/50 transition-all duration-500" />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-2">
                                {renderConfigField("Misión del CEO", "agent_ceo_mission")}
                                {renderConfigField("Directiva Sentinel", "agent_sentinel_mission")}
                                {renderConfigField("Mandato de Riesgo", "agent_risk_mission")}
                                {renderConfigField("Objetivo Crypto Perp", "agent_perp_mission")}
                                {renderConfigField("Prioridad Meme Sniper", "agent_sniper_mission")}
                                {renderConfigField("Estrategia Equities", "agent_equity_mission")}
                                {renderConfigField("Enfoque Forex Macro", "agent_forex_mission")}
                            </div>
                            <div className="flex justify-end mt-6 pt-6 border-t border-[#1a1f2e]">
                                <button type="button" onClick={saveAgentMissions} disabled={saving}
                                    className={`flex items-center gap-2 px-8 py-3 rounded-xl font-black text-[11px] uppercase tracking-[0.2em] transition-all ${
                                        saving ? 'bg-[#1a1f2e] text-[#3a4555] cursor-not-allowed' : 'bg-[#a78bfa] text-white hover:bg-[#8b5cf6] shadow-[0_10px_30px_rgba(139,92,246,0.2)]'
                                    }`}>
                                    <Save size={14} /> Guardar Directivas
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ══════ STATUS BAR ══════ */}
                    <div className="flex items-center justify-center pb-10">
                        {message ? (
                            <div className={`flex items-center gap-3 px-6 py-3 rounded-2xl border animate-in slide-in-from-bottom duration-500 ${
                                message.type === 'success' ? 'bg-[#22c55e]/10 border-[#22c55e]/30 text-[#22c55e]' : 'bg-[#ef4444]/10 border-[#ef4444]/30 text-[#ef4444]'
                            }`}>
                                {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                                <span className="text-[10px] font-black uppercase tracking-widest">{message.text}</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 text-[#3a4555]">
                                <Database size={16} />
                                <span className="text-[9px] font-black uppercase tracking-[0.3em]">Estado: Sincronización Lista</span>
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
};

export default AdminConsole;
