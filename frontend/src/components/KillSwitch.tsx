import React, { useState } from "react";
import { useStore } from "../store/useStore";
import { OctagonX, AlertTriangle, Loader2 } from "lucide-react";

const KillSwitch: React.FC = () => {
    const [confirming, setConfirming] = useState(false);
    const [firing, setFiring] = useState(false);
    const killSwitchActive = useStore((s) => s.killSwitchActive);

    const handleClick = async () => {
        if (!confirming) {
            setConfirming(true);
            setTimeout(() => setConfirming(false), 5000);
            return;
        }

        setFiring(true);
        try {
            const backendUrl = import.meta.env.VITE_API_URL || "http://localhost:8080";
            await fetch(`${backendUrl}/api/killswitch`, { method: "POST" });
            useStore.getState().setKillSwitch(true);
            useStore.getState().addAgentLog({
                id: crypto.randomUUID(),
                agent_id: "system",
                text: "🛑 KILL SWITCH ACTIVATED — All positions liquidated",
                level: "error",
                timestamp: Date.now(),
            });
        } catch (e: any) {
            console.error(e);
        } finally {
            setFiring(false);
            setConfirming(false);
        }
    };

    return (
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 backdrop-blur-sm overflow-hidden">
            <div className="p-4">
                <button
                    onClick={handleClick}
                    disabled={firing}
                    className={`
            w-full relative rounded-xl font-bold uppercase tracking-wider text-sm py-5 transition-all duration-300
            ${confirming
                            ? "bg-gradient-to-r from-red-600 to-red-700 text-white shadow-2xl shadow-red-500/40 border-2 border-red-400 animate-pulse"
                            : killSwitchActive
                                ? "bg-red-900/50 text-red-400 border-2 border-red-800 cursor-not-allowed"
                                : "bg-gradient-to-r from-red-500/20 to-red-600/20 text-red-400 border border-red-500/30 hover:from-red-500/30 hover:to-red-600/30 hover:shadow-lg hover:shadow-red-500/20"
                        }
          `}
                >
                    {firing ? (
                        <span className="flex items-center justify-center gap-2">
                            <Loader2 size={16} className="animate-spin" />
                            Liquidating...
                        </span>
                    ) : confirming ? (
                        <span className="flex items-center justify-center gap-2">
                            <AlertTriangle size={16} />
                            CONFIRM: LIQUIDATE ALL?
                        </span>
                    ) : killSwitchActive ? (
                        <span className="flex items-center justify-center gap-2">
                            <OctagonX size={16} />
                            SYSTEM HALTED
                        </span>
                    ) : (
                        <span className="flex items-center justify-center gap-2">
                            <OctagonX size={16} />
                            KILL SWITCH
                        </span>
                    )}
                </button>
                <p className="text-center text-[10px] text-slate-600 mt-2">
                    {confirming ? "Click again within 5s to confirm" : "Emergency liquidation of all positions"}
                </p>
            </div>
        </div>
    );
};

export default KillSwitch;
