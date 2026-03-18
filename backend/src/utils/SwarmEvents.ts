import { Server as SocketIOServer } from "socket.io";
import http from "http";

let io: SocketIOServer | null = null;

export const _setIoInstance = (serverIo: SocketIOServer) => {
    io = serverIo;

    io.on("connection", (socket) => {
        console.log("[SwarmEvents] New Dashboard Client Connected! ID:", socket.id);

        socket.on("disconnect", () => {
            console.log("[SwarmEvents] Dashboard Client Disconnected:", socket.id);
        });
    });
};

export const _getIoInstance = () => io;

// ⚡ PERFORMANCE: Throttle maps for backend-side emission control
const agentStateThrottle: Record<string, number> = {};
const agentLogThrottle: Record<string, number> = {};

/**
 * Emite los estados de los agentes de IA al Frontend (Pixel-Agents view)
 * ⚡ Throttled: max 1 emit per agent per 500ms
 */
export const broadcastAgentState = (
    agentId: string,
    action: string,
    target?: string,
    status: "idle" | "active" | "success" | "error" = "active",
    payload?: any,
    tokens?: { prompt: number; completion: number }
) => {
    if (!io) {
        console.warn("[SwarmEvents] Socket.io no inicializado", agentId, action);
        return;
    }

    const now = Date.now();
    const last = agentStateThrottle[agentId] || 0;
    if (now - last < 500) return; // ⚡ Skip if too soon
    agentStateThrottle[agentId] = now;

    io.emit("agent_state", {
        agent_id: agentId,
        action,
        target,
        status,
        payload,
        tokens,
        timestamp: now
    });
};

/**
 * Emite texto de log de un agente al LiveTerminal del Dashboard.
 * ⚡ Throttled: max 1 log emit per agent per 500ms
 */
export const broadcastAgentLog = (
    agentId: string,
    text: string,
    level: "info" | "warn" | "error" | "success" = "info"
) => {
    if (!io) return;

    const now = Date.now();
    const last = agentLogThrottle[agentId] || 0;
    if (now - last < 500) return; // ⚡ Skip if too soon
    agentLogThrottle[agentId] = now;

    io.emit("agent_log", {
        agent_id: agentId,
        text,
        level,
        timestamp: now
    });
};
