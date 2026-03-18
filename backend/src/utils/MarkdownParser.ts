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
     * Extrae el manual de teoría dinámica de la Serie D.
     * Busca el archivo POLICY_D.md dentro de la carpeta del ecosistema.
     * @param ecosystem Ecosistema (ej. "1_axi_forex")
     */
    static getPolicyDContext(ecosystem: string): string {
        const cacheKey = `POLICY_D_${ecosystem}`;
        if (this.cache[cacheKey]) {
            return this.cache[cacheKey];
        }

        try {
            // Nota: en la arquitectura L1-L5 las skills viven en src/skills/
            const absolutePath = path.join(__dirname, '..', 'skills', ecosystem, 'POLICY_D.md');
            if (!fs.existsSync(absolutePath)) {
                console.warn(`\x1b[33m[MarkdownParser]\x1b[0m ALERTA ONTOLÓGICA: Falta el manual de la Serie D para ${ecosystem} -> ${absolutePath}`);
                return `[ADVERTENCIA] El manual teórico POLICY_D no fue encontrado para ${ecosystem}. Se asume teoría estándar institucional.`;
            }

            const content = fs.readFileSync(absolutePath, 'utf8');
            this.cache[cacheKey] = content;
            return content;
            
        } catch (err) {
            console.error(`\x1b[31m[MarkdownParser]\x1b[0m Fallo crítico leyendo POLICY_D para ${ecosystem}`, err);
            return `ERROR LEER POLICY_D: ${err}`;
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
