import React, { useState, useEffect } from "react";
import { Settings, Shield, RefreshCw, Key, Database, Eye, EyeOff, Save, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "../utils/supabaseClient";

// Use dynamic keys — supports global config + per-market rules
type ConfigState = Record<string, string>;

const defaultConfig: ConfigState = {
    // Per-market defaults
    market_crypto_daily_dd: "5", market_crypto_total_dd: "10", market_crypto_max_notional: "5000", market_crypto_balance: "10000",
    market_crypto_leverage: "10", market_crypto_position_pct: "30", market_crypto_risk_per_trade: "3", market_crypto_hold_minutes: "0",
    
    market_memecoins_daily_dd: "5", market_memecoins_total_dd: "10", market_memecoins_max_notional: "5000", market_memecoins_balance: "10000",
    market_memecoins_leverage: "1", market_memecoins_position_pct: "10", market_memecoins_risk_per_trade: "2", market_memecoins_hold_minutes: "60",
    
    market_equities_daily_dd: "5", market_equities_total_dd: "10", market_equities_max_notional: "5000", market_equities_balance: "10000",
    market_equities_leverage: "1", market_equities_position_pct: "25", market_equities_risk_per_trade: "3", market_equities_hold_minutes: "0",
    
    market_forex_daily_dd: "5", market_forex_total_dd: "10", market_forex_max_notional: "5000", market_forex_balance: "10000",
    market_forex_leverage: "30", market_forex_position_pct: "20", market_forex_risk_per_trade: "2", market_forex_hold_minutes: "480",
    
    market_small_caps_daily_dd: "5", market_small_caps_total_dd: "10", market_small_caps_max_notional: "5000", market_small_caps_balance: "10000",
    market_small_caps_leverage: "1", market_small_caps_position_pct: "10", market_small_caps_risk_per_trade: "2", market_small_caps_hold_minutes: "30",
    // API keys
    mexc_api_key: "",
    mexc_api_secret: "",
    hyperliquid_wallet: "",
    hyperliquid_private_key: "",
    alpaca_api_key: "",
    alpaca_api_secret: "",
    // Agent missions
    agent_ceo_mission: "Dirigir el enjambre hacia la rentabilidad máxima protegiendo el capital.",
    agent_sentinel_mission: "Detectar anomalías de volumen y momentum en milisegundos.",
    agent_risk_mission: "Audit de cumplimiento estricto de las reglas de Axi Select.",
    agent_perp_mission: "Maximizar trades asimétricos en cripto perps de alta liquidez.",
    agent_sniper_mission: "Detectar y ejecutar en memecoins antes de la explosión de volumen retail.",
    agent_equity_mission: "Analizar correlaciones del SPY y NVDA para trades institucionales.",
    agent_forex_mission: "Explotar ineficiencias macro en pares mayores y el Oro.",
};

const AdminConsole: React.FC = () => {
    const [configs, setConfigs] = useState<ConfigState>(defaultConfig);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
    const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
    const [activeMarket, setActiveMarket] = useState("crypto");

    const loadConfig = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const API = import.meta.env.VITE_API_URL || "http://localhost:8080";
            
            // Load general config from Supabase
            const response = await fetch(`${API}/api/config`);
            const data = await response.json();
            const loadedConfig = { ...defaultConfig };
            if (data.success && data.config) {
                data.config.forEach((row: any) => {
                    if (row.key in loadedConfig) {
                        (loadedConfig as any)[row.key] = String(row.value);
                    }
                });
            }

            // Load market rules from backend (in-memory MARKET_RULES)
            try {
                const riskRes = await fetch(`${API}/api/config/risk`);
                const riskData = await riskRes.json();
                if (riskData.markets) {
                    for (const [marketId, rules] of Object.entries(riskData.markets)) {
                        const r = rules as any;
                        loadedConfig[`market_${marketId}_daily_dd`] = String(r.maxDailyDrawdownPct ?? "5");
                        loadedConfig[`market_${marketId}_total_dd`] = String(r.maxTotalDrawdownPct ?? "10");
                        loadedConfig[`market_${marketId}_max_notional`] = String(r.maxNotionalPerTrade ?? "5000");
                        loadedConfig[`market_${marketId}_balance`] = String(r.initialBalance ?? "10000");
                        loadedConfig[`market_${marketId}_leverage`] = String(r.maxLeverage ?? "");
                        loadedConfig[`market_${marketId}_position_pct`] = String(r.maxPositionPct ?? "");
                        loadedConfig[`market_${marketId}_risk_per_trade`] = String(r.maxRiskPerTradePct ?? "");
                        loadedConfig[`market_${marketId}_hold_minutes`] = String(r.maxHoldMinutes ?? 0);
                    }
                }
            } catch {}

            setConfigs(loadedConfig);
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

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage(null);

        try {
            const API = import.meta.env.VITE_API_URL || "http://localhost:8080";
            
            // 1) Guardar TODOS los params en Supabase (persistencia)
            const savePromises = Object.entries(configs)
                .filter(([key]) => !key.startsWith("market_")) // market_* se guardan via /api/config/risk
                .map(([key, value]) =>
                    fetch(`${API}/api/config`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ key, value: String(value) }),
                    }).then(res => res.json())
                );
            const results = await Promise.all(savePromises);
            const failures = results.filter(r => !r.success);

            // 2) Hot-reload: enviar risk_* Y market_* al backend para actualizar MARKET_RULES + AXI_SELECT_RULES
            const payload: any = {
            // Agent directives
            agent_ceo_mission: configs.agent_ceo_mission,
            agent_risk_strict: configs.agent_risk_strict,
            agent_sentiment_threshold: Number(configs.agent_sentiment_threshold),
            // API keys
            mexc_api_key: configs.mexc_api_key,
            mexc_api_secret: configs.mexc_api_secret,
            openai_api_key: configs.openai_api_key,
            hyperliquid_wallet: configs.hyperliquid_wallet,
            hyperliquid_private_key: configs.hyperliquid_private_key,
            market_rules: {}
        };

        const marketRules: Record<string, any> = {};
        for (const [key, val] of Object.entries(configs)) {
            if (key.startsWith('market_')) {
                const parts = key.split('_');
                // Could be market_crypto_daily_dd or market_small_caps_leverage
                const typeIndex = parts.indexOf('crypto') !== -1 ? parts.indexOf('crypto') :
                                  parts.indexOf('memecoins') !== -1 ? parts.indexOf('memecoins') :
                                  parts.indexOf('equities') !== -1 ? parts.indexOf('equities') :
                                  parts.indexOf('forex') !== -1 ? parts.indexOf('forex') :
                                  parts.indexOf('caps') !== -1 ? parts.indexOf('caps') : -1;
                
                if (typeIndex !== -1) {
                    const marketId = parts.slice(1, typeIndex + 1).join('_');
                    const field = parts.slice(typeIndex + 1).join('_');
                    
                    if (!marketRules[marketId]) marketRules[marketId] = {};
                    
                    if (field === 'daily_dd') marketRules[marketId].maxDailyDrawdownPct = Number(val);
                    if (field === 'total_dd') marketRules[marketId].maxTotalDrawdownPct = Number(val);
                    if (field === 'max_notional') marketRules[marketId].maxNotionalPerTrade = Number(val);
                    if (field === 'balance') marketRules[marketId].initialBalance = Number(val);
                    
                    if (field === 'leverage') marketRules[marketId].maxLeverage = Number(val);
                    if (field === 'position_pct') marketRules[marketId].maxPositionPct = Number(val);
                    if (field === 'risk_per_trade') marketRules[marketId].maxRiskPerTradePct = Number(val);
                    if (field === 'hold_minutes') marketRules[marketId].maxHoldMinutes = Number(val);
                }
            }
        }
        payload.markets = marketRules;
            
            await fetch(`${API}/api/config/risk`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (failures.length > 0) {
                setMessage({ text: `Atención: ${failures.length} parámetros no sincronizados.`, type: 'error' });
            } else {
                setMessage({ text: "✅ Config actualizada y guardada en Supabase. Agentes notificados.", type: 'success' });
            }
        } catch (err) {
            console.error("Failed to save config:", err);
            setMessage({ text: "Fallo crítico en la sincronización.", type: 'error' });
        } finally {
            setSaving(false);
            setTimeout(() => setMessage(null), 4000);
        }
    };

    const toggleSecret = (key: string) => {
        setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const renderConfigField = (label: string, k: string, type = "text") => {
        const isSecret = k.includes('key') || k.includes('secret') || k.includes('private') || k.includes('wallet');
        const show = showSecrets[k];

        return (
            <div key={k} className="flex flex-col gap-2 mb-4 group">
                <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-[#5a6577] uppercase tracking-widest group-hover:text-[#4a6cf7] transition-colors">
                        {label}
                    </label>
                    {configs[k] === defaultConfig[k] && configs[k] !== "" && (
                        <span className="text-[8px] font-mono text-[#3a4555] bg-white/5 px-2 py-0.5 rounded">DEFECTO</span>
                    )}
                </div>
                <div className="relative group/input">
                    <input
                        type={isSecret && !show ? "password" : "text"}
                        value={configs[k] || ""}
                        onChange={(e) => handleChange(k, e.target.value)}
                        className="w-full bg-[#0b0e14] border border-[#1a1f2e] group-hover/input:border-[#4a6cf7]/30 rounded-xl px-4 py-3 text-[11px] font-mono text-white focus:outline-none focus:ring-1 focus:ring-[#4a6cf7]/30 transition-all placeholder-[#2a3545]"
                        placeholder={`Ingresar ${label.toLowerCase()}...`}
                    />
                    {isSecret && (
                        <button 
                            type="button"
                            onClick={() => toggleSecret(k)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3a4555] hover:text-[#4a6cf7] transition-colors"
                        >
                             {show ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                    )}
                    {k.includes('pct') && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-[#3a4555] font-mono">%</span>}
                    {k.includes('notional') && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-[#3a4555] font-mono">$</span>}
                </div>
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col bg-[#060a10] overflow-hidden">
            {/* Professional Header */}
            <div className="px-10 py-8 border-b border-[#1a1f2e] bg-[#0b0e14]/50 flex items-center justify-between backdrop-blur-xl">
                <div className="flex items-center gap-6">
                    <div className="w-14 h-14 rounded-2xl bg-[#ef4444]/10 border border-[#ef4444]/20 flex items-center justify-center text-[#ef4444] shadow-[0_0_20px_rgba(239,68,68,0.1)]">
                        <Settings size={28} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-white uppercase tracking-[0.4em] mb-1">CONSOLA DE MANDO</h1>
                        <div className="flex items-center gap-3">
                            <span className="flex h-2 w-2 rounded-full bg-[#22c55e] animate-pulse" />
                            <p className="text-[10px] text-[#5a6577] font-mono uppercase tracking-[0.2em]">Configuración de Grado Operativo • V4.2</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button 
                        onClick={loadConfig}
                        disabled={loading}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#111622] border border-[#1a1f2e] text-[#8a95a7] text-[10px] font-black uppercase tracking-widest hover:text-white hover:bg-[#1a1f2e] transition-all disabled:opacity-30"
                    >
                        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                        RECUPERAR NÚCLEO
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-10 no-scrollbar">
                <form onSubmit={handleSave} className="max-w-6xl mx-auto space-y-10">
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                        {/* UNIFIED RISK SECTION */}
                        <div className="space-y-8 animate-in fade-in slide-in-from-left duration-700">
                            <div className="flex items-center gap-3 mb-2 px-2">
                                <Shield size={18} className="text-[#4a6cf7]" />
                                <h3 className="text-[12px] font-black text-white uppercase tracking-[0.3em]">Gestión de Riesgo por Ecosistema</h3>
                            </div>
                            
                            {/* Unified Per-Market Rules */}
                            <div className="bg-[#0b0e14]/60 border border-[#1a1f2e] rounded-3xl backdrop-blur-sm relative overflow-hidden flex min-h-[450px] shadow-xl">
                                {/* Sidebar for Market Selection */}
                                <div className="w-[180px] border-r border-[#1a1f2e] bg-[#060a10]/80 p-4 space-y-2 shrink-0">
                                    <div className="text-[8px] font-black text-[#5a6577] uppercase tracking-[0.3em] mb-4">Ecosistemas</div>
                                    {[
                                        { id: "crypto", label: "Cripto", icon: "₿", color: "#a78bfa" },
                                        { id: "memecoins", label: "Memecoins", icon: "🐸", color: "#f472b6" },
                                        { id: "equities", label: "Acciones", icon: "📊", color: "#22c55e" },
                                        { id: "forex", label: "Forex", icon: "💱", color: "#f59e0b" },
                                        { id: "small_caps", label: "Small Caps", icon: "🔬", color: "#06b6d4" },
                                    ].map(market => (
                                        <button
                                            key={market.id}
                                            type="button"
                                            onClick={() => setActiveMarket(market.id)}
                                            className={`w-full text-left px-3 py-3 rounded-xl transition-all border-l-4 group flex items-center gap-2 ${activeMarket === market.id ? 'bg-white/5' : 'border-transparent hover:bg-white/5 opacity-50 hover:opacity-100'}`}
                                            style={{ borderLeftColor: activeMarket === market.id ? market.color : 'transparent' }}
                                        >
                                            <span className="text-[14px]" style={{ color: market.color }}>{market.icon}</span>
                                            <span className="text-[10px] font-black text-white tracking-widest uppercase">{market.label}</span>
                                        </button>
                                    ))}
                                </div>
                                
                                {/* Active Market Config */}
                                <div className="flex-1 p-6 relative">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#4a6cf7]/5 blur-3xl rounded-full opacity-50 pointer-events-none" />
                                    {(() => {
                                        const m = [
                                            { id: "crypto", label: "Criptomonedas", icon: "₿", color: "#a78bfa", desc: "Perpetuos de alta liquidez con apalancamiento." },
                                            { id: "memecoins", label: "Memecoins", icon: "🐸", color: "#f472b6", desc: "Spot trading para explosiones intra-día." },
                                            { id: "equities", label: "Acciones US", icon: "📊", color: "#22c55e", desc: "Mid/Large caps sin apalancamiento." },
                                            { id: "forex", label: "Forex / Oro", icon: "💱", color: "#f59e0b", desc: "Axi Prop Firm con gestión de riesgo estricta." },
                                            { id: "small_caps", label: "Small Caps", icon: "🔬", color: "#06b6d4", desc: "Penny stocks sin apalancamiento, alta volatilidad." },
                                        ].find(x => x.id === activeMarket)!;
                                        
                                        return (
                                            <div className="animate-in fade-in zoom-in-95 duration-300 h-full flex flex-col">
                                                <div className="flex items-center gap-4 mb-8">
                                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#111622] border border-[#1a1f2e] text-[16px] shadow-lg" style={{ color: m.color }}>
                                                        {m.icon}
                                                    </div>
                                                    <div>
                                                        <h4 className="text-[12px] font-black text-white uppercase tracking-widest">{m.label}</h4>
                                                        <p className="text-[9px] text-[#5a6577] font-mono mt-0.5">{m.desc}</p>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 gap-y-2 flex-1 overflow-y-auto pr-2 no-scrollbar">
                                                    <div className="col-span-1 md:col-span-2 pt-2 border-b border-[#1a1f2e]/50 pb-2 mb-2">
                                                        <span className="text-[8px] font-black text-[#5a6577] uppercase tracking-widest">Protección de Capital</span>
                                                    </div>
                                                    {renderConfigField("Drawdown Diario (%)", `market_${m.id}_daily_dd`)}
                                                    {renderConfigField("Drawdown Total (%)", `market_${m.id}_total_dd`)}
                                                    {renderConfigField("Notional Máximo ($)", `market_${m.id}_max_notional`)}
                                                    {renderConfigField("Balance Inicial Simulado ($)", `market_${m.id}_balance`)}

                                                    <div className="col-span-1 md:col-span-2 mt-2 pt-4 border-t border-[#1a1f2e]/50 pb-2 mb-2">
                                                        <span className="text-[8px] font-black text-[#5a6577] uppercase tracking-widest">Reglas Operativas</span>
                                                    </div>
                                                    {renderConfigField("Leverage Máximo", `market_${m.id}_leverage`)}
                                                    {renderConfigField("Tamaño Posición (%)", `market_${m.id}_position_pct`)}
                                                    {renderConfigField("Riesgo / Trade (%)", `market_${m.id}_risk_per_trade`)}
                                                    {renderConfigField("Max Hold (Minutos)", `market_${m.id}_hold_minutes`)}
                                                    
                                                    {m.id === 'forex' && (
                                                        <>
                                                            <div className="col-span-1 md:col-span-2 mt-2 pt-4 border-t border-[#1a1f2e]">
                                                                <span className="text-[8px] font-black text-[#f59e0b] uppercase tracking-widest">Reglas Específicas: Prop Firm</span>
                                                            </div>
                                                            {renderConfigField("SL Dinámico (Bps)", `market_${m.id}_sl_bps`)}
                                                            {renderConfigField("TP Target (Bps)", `market_${m.id}_tp_bps`)}
                                                        </>
                                                    )}
                                                </div>

                                                {/* Emergency Actions for Active Market */}
                                                <div className="mt-6 pt-6 border-t border-[#1a1f2e] flex items-center justify-between">
                                                    <div className="flex gap-3">
                                                        <button
                                                            type="button"
                                                            onClick={async () => {
                                                                const API = import.meta.env.VITE_API_URL || "http://localhost:8080";
                                                                try {
                                                                    const res = await fetch(`${API}/api/paper/reset-dd`, { 
                                                                        method: "POST",
                                                                        headers: { "Content-Type": "application/json" },
                                                                        body: JSON.stringify({ market: m.id })
                                                                    });
                                                                    const data = await res.json();
                                                                    setMessage({ text: `✅ DD Reseteado para ${m.label}`, type: 'success' });
                                                                    setTimeout(() => setMessage(null), 4000);
                                                                } catch { setMessage({ text: "Error al resetear DD", type: 'error' }); }
                                                            }}
                                                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#f59e0b]/10 border border-[#f59e0b]/30 text-[#f59e0b] text-[9px] font-black uppercase tracking-widest hover:bg-[#f59e0b]/20 transition-all font-mono"
                                                        >
                                                            <RefreshCw size={12} />
                                                            Reset DD Diario
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={async () => {
                                                                if (!confirm(`¿Reiniciar balance de ${m.label}? Se cerrarán las posiciones de este mercado.`)) return;
                                                                const API = import.meta.env.VITE_API_URL || "http://localhost:8080";
                                                                try {
                                                                    const bal = parseFloat(configs[`market_${m.id}_balance`]) || 10000;
                                                                    const res = await fetch(`${API}/api/paper/reset-balance`, { 
                                                                        method: "POST", 
                                                                        headers: { "Content-Type": "application/json" },
                                                                        body: JSON.stringify({ market: m.id, balance: bal }) 
                                                                    });
                                                                    const data = await res.json();
                                                                    setMessage({ text: `✅ Balance de ${m.label} reiniciado`, type: 'success' });
                                                                    setTimeout(() => setMessage(null), 4000);
                                                                } catch { setMessage({ text: "Error al resetear balance", type: 'error' }); }
                                                            }}
                                                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] text-[9px] font-black uppercase tracking-widest hover:bg-[#ef4444]/20 transition-all font-mono"
                                                        >
                                                            <AlertTriangle size={12} />
                                                            Reset Balance
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>

                        {/* INFRASTRUCTURE SECTION */}
                        <div className="space-y-8 animate-in fade-in slide-in-from-right duration-700">
                            <div className="flex items-center gap-3 mb-2 px-2">
                                <Key size={18} className="text-[#f59e0b]" />
                                <h3 className="text-[12px] font-black text-white uppercase tracking-[0.3em]">Credenciales de Infraestructura</h3>
                            </div>
                            
                            <div className="p-8 bg-[#0b0e14]/60 border border-[#1a1f2e] rounded-3xl backdrop-blur-sm relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-1.5 h-full bg-[#f59e0b]/20 group-hover:bg-[#f59e0b]/50 transition-all duration-500" />
                                
                                <div className="grid grid-cols-1 gap-2">
                                    {renderConfigField("MEXC API KEY", "mexc_api_key")}
                                    {renderConfigField("MEXC SECRET", "mexc_api_secret")}
                                    {renderConfigField("HYPERLIQUID WALLET", "hyperliquid_wallet")}
                                    {renderConfigField("HYPERLIQUID PRIVATE KEY", "hyperliquid_private_key")}
                                    {renderConfigField("ALPACA API KEY", "alpaca_api_key")}
                                    {renderConfigField("ALPACA API SECRET", "alpaca_api_secret")}
                                </div>
                            </div>

                            {/* WARNING CARD */}
                            <div className="p-6 bg-gradient-to-br from-[#ef4444]/10 to-transparent border border-[#ef4444]/20 rounded-2xl flex items-start gap-4 shadow-lg animate-pulse">
                                <AlertTriangle size={24} className="text-[#ef4444] flex-shrink-0" />
                                <div>
                                    <h4 className="text-[10px] font-black text-white uppercase tracking-widest mb-1 font-mono">Advertencia de Seguridad</h4>
                                    <p className="text-[9px] text-[#8a95a7] leading-relaxed uppercase font-mono">Los cambios en las credenciales afectarán la conexión de los especialistas en el próximo ciclo de escaneo. El Risk Manager monitoriza cualquier alteración de parámetros críticos.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* AGENT DIRECTIVES SECTION */}
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom duration-700">
                        <div className="flex items-center gap-3 mb-2 px-2">
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
                        </div>
                    </div>

                    {/* STATUS MESSAGE & SAVE ACTION */}
                    <div className="flex items-center justify-between pt-10 pb-20">
                        <div className="flex items-center gap-4">
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

                        <button
                            type="submit"
                            disabled={saving}
                            className={`relative px-16 py-5 rounded-2xl font-black text-[14px] uppercase tracking-[0.3em] transition-all overflow-hidden group/btn ${
                                saving ? 'bg-[#1a1f2e] text-[#3a4555] cursor-not-allowed' : 'bg-[#4a6cf7] text-white hover:bg-[#3b82f6] shadow-[0_20px_40px_rgba(74,108,247,0.2)]'
                            }`}
                        >
                            <span className="relative z-10 flex items-center gap-3">
                                {saving ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                        SINCRONIZANDO...
                                    </>
                                ) : (
                                    <>
                                        <Save size={18} />
                                        APLICAR DIRECTIVAS GLOBALES
                                    </>
                                )}
                            </span>
                            <div className="absolute inset-0 bg-white/10 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300"></div>
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default AdminConsole;
