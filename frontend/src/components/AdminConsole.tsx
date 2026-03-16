import React, { useState, useEffect } from "react";
import { Settings, Shield, RefreshCw, Key, Database, Eye, EyeOff, Save, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "../utils/supabaseClient";

interface ConfigState {
    risk_max_daily_dd_pct: string;
    risk_max_total_dd_pct: string;
    risk_max_position_size_pct: string;
    risk_max_leverage_crypto: string;
    risk_max_leverage_forex: string;
    risk_max_open_positions: string;
    risk_max_notional_per_trade: string;
    risk_axi_auto_lock_dd_pct: string;
    paper_initial_balance: string;
    mexc_api_key: string;
    mexc_api_secret: string;
    hyperliquid_wallet: string;
    hyperliquid_private_key: string;
    alpaca_api_key: string;
    alpaca_api_secret: string;
    agent_ceo_mission: string;
    agent_sentinel_mission: string;
    agent_risk_mission: string;
    agent_perp_mission: string;
    agent_sniper_mission: string;
    agent_equity_mission: string;
    agent_forex_mission: string;
}

const defaultConfig: ConfigState = {
    risk_max_daily_dd_pct: "5",
    risk_max_total_dd_pct: "10",
    risk_max_position_size_pct: "20",
    risk_max_leverage_crypto: "10",
    risk_max_leverage_forex: "30",
    risk_max_open_positions: "10",
    risk_max_notional_per_trade: "5000",
    risk_axi_auto_lock_dd_pct: "4.5",
    paper_initial_balance: "10000",
    mexc_api_key: "",
    mexc_api_secret: "",
    hyperliquid_wallet: "",
    hyperliquid_private_key: "",
    alpaca_api_key: "",
    alpaca_api_secret: "",
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

    const loadConfig = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const API = import.meta.env.VITE_API_URL || "http://localhost:8080";
            const response = await fetch(`${API}/api/config`);
            const data = await response.json();

            if (data.success && data.config) {
                const loadedConfig = { ...defaultConfig };
                data.config.forEach((row: any) => {
                    if (row.key in loadedConfig) {
                        (loadedConfig as any)[row.key] = String(row.value);
                    }
                });
                setConfigs(loadedConfig);
            }
        } catch (err) {
            console.error("Failed to load config:", err);
            setMessage({ text: "Error de enlace con el servidor central.", type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadConfig(); }, []);

    const handleChange = (key: keyof ConfigState, value: string) => {
        setConfigs(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage(null);

        try {
            const API = import.meta.env.VITE_API_URL || "http://localhost:8080";
            const savePromises = Object.entries(configs).map(([key, value]) =>
                fetch(`${API}/api/config`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ key, value: String(value) }),
                }).then(res => res.json())
            );

            const results = await Promise.all(savePromises);
            const failures = results.filter(r => !r.success);

            if (failures.length > 0) {
                setMessage({ text: `Atención: ${failures.length} parámetros no sincronizados.`, type: 'error' });
            } else {
                setMessage({ text: "Configuración global actualizada con éxito.", type: 'success' });
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

    const ConfigField = ({ label, k, type = "text" }: { label: string, k: keyof ConfigState, type?: string }) => {
        const isSecret = k.includes('key') || k.includes('secret') || k.includes('private') || k.includes('wallet');
        const show = showSecrets[k];

        return (
            <div className="flex flex-col gap-2 mb-4 group">
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
                        value={configs[k]}
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
                        {/* RISK SECTION */}
                        <div className="space-y-8 animate-in fade-in slide-in-from-left duration-700">
                            <div className="flex items-center gap-3 mb-2 px-2">
                                <Shield size={18} className="text-[#4a6cf7]" />
                                <h3 className="text-[12px] font-black text-white uppercase tracking-[0.3em]">Protocolos de Gestión de Riesgo</h3>
                            </div>
                            
                            <div className="p-8 bg-[#0b0e14]/60 border border-[#1a1f2e] rounded-3xl backdrop-blur-sm relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-1.5 h-full bg-[#4a6cf7]/20 group-hover:bg-[#4a6cf7]/50 transition-all duration-500" />
                                
                                <div className="grid grid-cols-1 gap-2">
                                    <ConfigField label="Drawdown Diario Máximo" k="risk_max_daily_dd_pct" />
                                    <ConfigField label="Drawdown Total Máximo" k="risk_max_total_dd_pct" />
                                    <ConfigField label="Tamaño Máximo de Posición" k="risk_max_position_size_pct" />
                                    <ConfigField label="Notional Máximo por Operación" k="risk_max_notional_per_trade" />
                                    <ConfigField label="Límite de Posiciones Abiertas" k="risk_max_open_positions" />
                                    <ConfigField label="Apalancamiento Máximo Cripto" k="risk_max_leverage_crypto" />
                                    <ConfigField label="Apalancamiento Máximo Forex" k="risk_max_leverage_forex" />
                                    <ConfigField label="Umbral de Auto-Bloqueo Axi" k="risk_axi_auto_lock_dd_pct" />
                                    <ConfigField label="Balance Inicial Simulado" k="paper_initial_balance" />
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
                                    <ConfigField label="MEXC API KEY" k="mexc_api_key" />
                                    <ConfigField label="MEXC SECRET" k="mexc_api_secret" />
                                    <ConfigField label="HYPERLIQUID WALLET" k="hyperliquid_wallet" />
                                    <ConfigField label="HYPERLIQUID PRIVATE KEY" k="hyperliquid_private_key" />
                                    <ConfigField label="ALPACA API KEY" k="alpaca_api_key" />
                                    <ConfigField label="ALPACA API SECRET" k="alpaca_api_secret" />
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
                                <ConfigField label="Misión del CEO" k="agent_ceo_mission" />
                                <ConfigField label="Directiva Sentinel" k="agent_sentinel_mission" />
                                <ConfigField label="Mandato de Riesgo" k="agent_risk_mission" />
                                <ConfigField label="Objetivo Crypto Perp" k="agent_perp_mission" />
                                <ConfigField label="Prioridad Meme Sniper" k="agent_sniper_mission" />
                                <ConfigField label="Estrategia Equities" k="agent_equity_mission" />
                                <ConfigField label="Enfoque Forex Macro" k="agent_forex_mission" />
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
