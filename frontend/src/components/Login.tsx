import React, { useState } from "react";
import { Cpu, Lock } from "lucide-react";
import { supabase } from "../utils/supabaseClient";

export const Login: React.FC = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [isRegister, setIsRegister] = useState(false);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            if (isRegister) {
                const { error, data } = await supabase.auth.signUp({
                    email,
                    password,
                });
                if (error) throw error;
                if (data.user && data.session === null) {
                    setError("Registro exitoso. Revisa tu email para confirmar o verifica en el dashboard de Supabase (si requiere confirmación).");
                } else if (data.session) {
                    // Logueado automáticamente si no requiere confirmación
                }
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                // Si el login es exitoso, Supabase disparará `onAuthStateChange` en App.tsx
            }
        } catch (err: any) {
            setError(err.message || "Error de autenticación");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-screen w-screen bg-[#060a10] flex flex-col items-center justify-center font-sans">
            <div className="w-full max-w-sm bg-[#0b0e14] border border-[#1a1f2e] p-8 rounded-xl shadow-2xl relative overflow-hidden">
                {/* Accent line top */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#4a6cf7] to-[#a78bfa]" />

                <div className="flex flex-col items-center mb-8">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#4a6cf7] to-[#a78bfa] flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(74,108,247,0.3)]">
                        <Cpu size={24} className="text-white" />
                    </div>
                    <h1 className="text-xl font-bold tracking-widest text-white">CENTRO DE MANDO</h1>
                    <span className="text-xs font-mono text-[#5a6577] tracking-widest mt-1">ACCESO RESTRINGIDO</span>
                </div>

                <form onSubmit={handleAuth} className="flex flex-col gap-4">
                    {error && (
                        <div className="bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] text-[10px] font-mono p-3 rounded">
                            ERROR: {error}
                        </div>
                    )}

                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold tracking-widest text-[#5a6577] uppercase">Identificador</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="bg-[#060a10] border border-[#1a1f2e] rounded px-3 py-2 text-sm text-[#c9d1d9] focus:outline-none focus:border-[#4a6cf7] font-mono transition-colors"
                            placeholder="admin@fund.com"
                            required
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold tracking-widest text-[#5a6577] uppercase">Protocolo de Seguridad</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="bg-[#060a10] border border-[#1a1f2e] rounded px-3 py-2 text-sm text-[#c9d1d9] focus:outline-none focus:border-[#4a6cf7] font-mono transition-colors tracking-[0.2em]"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="mt-4 w-full bg-[#4a6cf7] hover:bg-[#3b5bdb] text-white font-bold text-xs tracking-widest py-3 rounded uppercase transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {loading ? "PROCESANDO..." : <><Lock size={12} /> {isRegister ? "REGISTRAR" : "ENTRAR"}</>}
                    </button>

                    <button
                        type="button"
                        onClick={() => { setIsRegister(!isRegister); setError(null); }}
                        className="mt-2 text-[10px] text-[#5a6577] hover:text-[#4a6cf7] uppercase tracking-widest font-mono text-center transition-colors"
                    >
                        {isRegister ? "¿Ya tienes cuenta? Login" : "¿Nuevo administrador? Regístrate aquí"}
                    </button>
                </form>
            </div>
            <div className="mt-8 text-[9px] font-mono text-[#3a4555] opacity-50 text-center uppercase tracking-widest">
                Sistema monitorizado por Sentinel IA <br />
                El acceso no autorizado está estrictamente prohibido
            </div>
        </div>
    );
};
