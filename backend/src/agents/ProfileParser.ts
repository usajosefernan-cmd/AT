import fs from 'fs';
import path from 'path';
import { supabase } from '../utils/supabaseClient';

export class ProfileParser {
    private static profilesCache: Record<string, string> = {};
    private static systemConfigCache: Record<string, any> = {};

    /**
     * Carga todos los .md en memoria y cachea la configuración de BD.
     */
    static async bootstrap() {
        const profilesDir = path.join(__dirname, 'profiles');
        if (fs.existsSync(profilesDir)) {
            const files = fs.readdirSync(profilesDir);
            for (const file of files) {
                if (file.endsWith('.md')) {
                    const content = fs.readFileSync(path.join(profilesDir, file), 'utf8');
                    const agentName = file.replace('.md', '');
                    this.profilesCache[agentName] = content;
                }
            }
        }
        await this.reloadConfig();
    }

    /**
     * Refresca la configuración desde Supabase para inyección dinámica.
     */
    static async reloadConfig() {
        const { data } = await supabase.from('system_config').select('*');
        if (data && data.length > 0) {
            // Asumimos estructura KEY-VALUE
            data.forEach(row => {
                this.systemConfigCache[row.key] = row.value;
            });
        }
    }

    /**
     * Obtiene el perfil markdown final, reemplazando {{variables}} del config.
     */
    static getProfile(agentName: string): string {
        let rawContent = this.profilesCache[agentName];
        if (!rawContent) {
            console.warn(`[ProfileParser] Mente de ${agentName} no encontrada. Retornando fallback vacío.`);
            return `Eres ${agentName}. No tienes misión asignada.`;
        }

        // Inyecta variables del config
        // Para cada {{keyword}}, buscaremos en systemConfigCache y lo reemplazaremos
        const matches = rawContent.match(/{{(.*?)}}/g);
        if (matches) {
            matches.forEach(match => {
                const key = match.replace(/[{}]/g, '').trim();
                const replacement = this.systemConfigCache[key] || `[UNDEFINED_CONFIG:${key}]`;
                rawContent = rawContent!.replace(match, String(replacement));
            });
        }

        return rawContent;
    }
}
