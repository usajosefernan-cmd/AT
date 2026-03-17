import fs from 'fs';
import path from 'path';

export class MarkdownParser {
    private static cache: Record<string, string> = {};

    /**
     * Devuelve el contenido purificado de un archivo .md 
     * ubicado en src/agents/skills/
     * @param skillPath Ejemplo: "1_axi_forex/L3_Strategic_Risk"
     */
    static getSkillContext(skillPath: string): string {
        if (this.cache[skillPath]) {
            return this.cache[skillPath];
        }

        try {
            const absolutePath = path.join(__dirname, '..', 'agents', 'skills', `${skillPath}.md`);
            if (!fs.existsSync(absolutePath)) {
                console.warn(`[OpenClaw Parser] ALERTA ONTOLÓGICA: El archivo de mente no existe -> ${absolutePath}`);
                return `Rol genérico. El archivo Markdown para ${skillPath} no fue encontrado.`;
            }

            const content = fs.readFileSync(absolutePath, 'utf8');
            this.cache[skillPath] = content;
            return content;
            
        } catch (err) {
            console.error(`[OpenClaw Parser] Fallo crítico leyendo ${skillPath}`, err);
            return `ERROR LEER SOUL: ${err}`;
        }
    }

    /**
     * Purga la mente de los agentes (Para Hot Reloads sin reiniciar el servidor)
     */
    static purgeCache() {
        this.cache = {};
        console.log(`[OpenClaw Parser] Memoria de agentes purgada. Mente lista para ser rescrita.`);
    }
}
