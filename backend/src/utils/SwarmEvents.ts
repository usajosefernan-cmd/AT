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

/**
 * Emite los estados de los agentes de IA al Frontend (Pixel-Agents view)
 * Payload Type: {"agent_id": "risk_manager", "action": "evaluating_trade", "target": "BTC/USDT", "status": "active"}
 */
export const broadcastAgentState = (
    agentId: string,
    action: string,
    target?: string,
    status: "idle" | "active" | "success" | "error" = "active",
    payload?: any,
    tokens?: { prompt: number; completion: number }
) => {
    if (io) {
        const eventPayload = {
            agent_id: agentId,
            action,
            target,
            status,
            payload,
            tokens,
            timestamp: Date.now()
        };
        io.emit("agent_state", eventPayload);
    } else {
        console.warn("[SwarmEvents] Socket.io no inicializado", agentId, action);
    }
};

/**
 * Emite texto de log de un agente al LiveTerminal del Dashboard.
 * Esto es lo que el usuario ve como "el agente pensando en tiempo real".
 */
export const broadcastAgentLog = (
    agentId: string,
    text: string,
    level: "info" | "warn" | "error" | "success" = "info"
) => {
    if (io) {
        io.emit("agent_log", {
            agent_id: agentId,
            text,
            level,
            timestamp: Date.now()
        });
    }
};
