import React, { useEffect, useRef, useState } from "react";
import { useStore, getSocket } from "../store/useStore";
import OfficeApp from "../pixel-office/App";

// ═══════════════════════════════════════════
// COMPONENTE PRINCIPAL: AGENT FARM
// Bridges the backend Socket.io data with the pixel-office
// OfficeApp which expects VSCode-style window 'message' events.
// ═══════════════════════════════════════════

/**
 * Dispatch a simulated VSCode-extension MessageEvent.
 * OfficeApp's `useExtensionMessages` hook listens to window 'message'.
 */
function dispatch(payload: Record<string, unknown>) {
    window.dispatchEvent(
        new MessageEvent("message", { data: payload })
    );
}

const AGENT_META: Record<number, { palette: number; folderName: string }> = {
    1: { palette: 0, folderName: "CEO" },
    2: { palette: 1, folderName: "Crypto L3" },
    3: { palette: 2, folderName: "Memes L3" },
    4: { palette: 3, folderName: "Equities L3" },
    5: { palette: 4, folderName: "SmallCaps L3" },
    6: { palette: 5, folderName: "Forex L3" },
};

const AgentFarm: React.FC = () => {
    const [assetsLoaded, setAssetsLoaded] = useState(false);
    const pixelAssets = useStore((state) => state.pixelAssets);
    // Track whether we already injected assets so we never double-fire
    const injectedRef = useRef(false);

    // ─────────────────────────────────────────────
    // STEP 1) Wait for assets from Zustand, then inject them into
    // OfficeApp via window MessageEvents.
    //
    // CRITICAL: We use setTimeout(0) so the dispatch happens on the
    // NEXT microtask — after React has flushed ALL useEffect hooks
    // (including OfficeApp's `useExtensionMessages` listener).
    // Without this, the events fire before the listener is mounted
    // and are silently lost.
    // ─────────────────────────────────────────────
    useEffect(() => {
        if (!pixelAssets || injectedRef.current) return;
        injectedRef.current = true;

        console.log("🎨 [AgentFarm] Pixel Assets received, scheduling injection...");

        // Defer to next tick so OfficeApp's useExtensionMessages listener is ready
        setTimeout(() => {
            console.log("🎨 [AgentFarm] Injecting assets into OfficeApp...");

            if (pixelAssets.wallTiles) {
                dispatch({ type: "wallTilesLoaded", sets: pixelAssets.wallTiles });
            }
            if (pixelAssets.floorTiles) {
                dispatch({ type: "floorTilesLoaded", sprites: pixelAssets.floorTiles });
            }
            if (pixelAssets.characters) {
                dispatch({ type: "characterSpritesLoaded", characters: pixelAssets.characters });
            }
            if (pixelAssets.furnitureAssets) {
                dispatch({
                    type: "furnitureAssetsLoaded",
                    catalog: pixelAssets.furnitureAssets.catalog,
                    sprites: pixelAssets.furnitureAssets.sprites,
                });
            }
            if (pixelAssets.layout) {
                dispatch({ type: "layoutLoaded", layout: pixelAssets.layout });
            }

            // ── Spawn the 6 agents ──
            // Must come AFTER layoutLoaded so seats are built.
            // Use a second setTimeout to ensure layoutLoaded is fully processed.
            setTimeout(() => {
                console.log("🤖 [AgentFarm] Spawning 6 agents...");
                for (const [idStr, meta] of Object.entries(AGENT_META)) {
                    const id = Number(idStr);
                    dispatch({
                        type: "agentCreated",
                        id,
                        folderName: meta.folderName,
                        palette: meta.palette,
                    });
                }
                setAssetsLoaded(true);
            }, 100);
        }, 0);
    }, [pixelAssets]);

    // ─────────────────────────────────────────────
    // STEP 2) Hook into real WSS events to animate agents
    // ─────────────────────────────────────────────
    useEffect(() => {
        if (!assetsLoaded) return;

        const socket = getSocket();
        if (!socket) {
            console.warn("⚠️ [AgentFarm] WSS Socket not ready");
            return;
        }

        const handleHeartbeat = (data: any) => {
            console.log("🔥 [AgentFarm] SWARM HEARTBEAT →", data);

            const agents = [1, 2, 3, 4, 5, 6];
            agents.forEach((id) => {
                dispatch({
                    type: "agentToolStart",
                    id,
                    toolId: "heartbeat_task",
                    status: "Analizando Mercado (Latido)",
                });
            });

            setTimeout(() => {
                agents.forEach((id) => {
                    dispatch({
                        type: "agentToolDone",
                        id,
                        toolId: "heartbeat_task",
                    });
                });
            }, 3000);
        };

        const handleAgentState = (data: any) => {
            let id = 1;
            if (data.agent_id === "l3_crypto") id = 2;
            if (data.agent_id === "l3_memes") id = 3;
            if (data.agent_id === "l3_equities") id = 4;
            if (data.agent_id === "l3_small_caps") id = 5;
            if (data.agent_id === "l3_forex") id = 6;

            if (data.status === "active") {
                dispatch({
                    type: "agentToolStart",
                    id,
                    toolId: "action_task",
                    status: data.action,
                });
            } else if (data.status === "success" || data.status === "idle") {
                dispatch({
                    type: "agentToolDone",
                    id,
                    toolId: "action_task",
                });
            }
        };

        socket.on("swarm_heartbeat_activity", handleHeartbeat);
        socket.on("agent_state", handleAgentState);

        return () => {
            socket.off("swarm_heartbeat_activity", handleHeartbeat);
            socket.off("agent_state", handleAgentState);
        };
    }, [assetsLoaded]);

    return (
        <div className="h-full w-full bg-[#060a10] relative overflow-hidden flex flex-col">
            {!assetsLoaded && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#060a10]/80 backdrop-blur-sm">
                    <div className="w-12 h-12 border-4 border-[#4a6cf7]/20 border-t-[#4a6cf7] rounded-full animate-spin mb-4" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#4a6cf7]">
                        Cargando Assets Estáticos (Oficina Pixel)...
                    </span>
                </div>
            )}

            {/* The actual Pixel Office App */}
            <div className="flex-1 w-full h-full relative">
                <OfficeApp />
            </div>
        </div>
    );
};

export default AgentFarm;
