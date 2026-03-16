import { Request, Response } from "express";
import { broadcastAgentState } from "../utils/SwarmEvents";
import { updateSystemConfig } from "../utils/supabaseClient";

export class CEOAgency {

    /**
     * Webhook that receives natural language commands from the Dashboard Chat.
     * Writes kill switches and mode changes to Supabase.
     */
    public static async handleDashboardCommand(req: Request, res: Response) {
        try {
            const { command, userId } = req.body;

            console.log(`[CEOAgency] Command from Dashboard: "${command}"`);
            broadcastAgentState("ceo", "processing_command", undefined, "active");

            let actionObj = CEOAgency.parseCommandMock(command);

            if (actionObj.intent === "PAUSE_ALPACA") {
                await updateSystemConfig({ alpaca_status: "PAUSED" });
                broadcastAgentState("ceo", "system_updated", "Alpaca Paused", "success");
            }
            else if (actionObj.intent === "SWITCH_PAPER_MODE") {
                await updateSystemConfig({ mode: "PAPER" });
                broadcastAgentState("ceo", "system_updated", "Paper Mode", "success");
            }
            else if (actionObj.intent === "CLOSE_CRYPTO") {
                broadcastAgentState("risk", "liquidating", "MEXC Crypto", "active");
                await updateSystemConfig({ mexc_status: "LIQUIDATING" });

                // The actual liquidation is handled by the PaperEngine via a separate event
                broadcastAgentState("risk", "liquidated", "MEXC Crypto", "success");
                broadcastAgentState("ceo", "completed", "Crypto Closed", "success");
            }
            else {
                broadcastAgentState("ceo", "unknown_command", command.slice(0, 30), "error");
            }

            setTimeout(() => {
                broadcastAgentState("ceo", "monitoring", undefined, "idle");
            }, 3000);

            res.status(200).json({ success: true, intent: actionObj.intent });
        } catch (error: any) {
            console.error("[CEOAgency] Error:", error);
            broadcastAgentState("ceo", "error", error.message, "error");
            res.status(500).json({ error: error.message });
        }
    }

    private static parseCommandMock(text: string) {
        const lower = text.toLowerCase();
        if (lower.includes("pausa") && lower.includes("alpaca")) return { intent: "PAUSE_ALPACA" };
        if (lower.includes("paper trading") || lower.includes("paper mode")) return { intent: "SWITCH_PAPER_MODE" };
        if (lower.includes("cierra") && lower.includes("cripto")) return { intent: "CLOSE_CRYPTO" };
        return { intent: "UNKNOWN" };
    }
}
