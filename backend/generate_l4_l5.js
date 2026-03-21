const fs = require('fs');
const path = require('path');

const skillsDir = path.join(__dirname, 'src', 'skills');
const skills = fs.readdirSync(skillsDir).filter(f => fs.statSync(path.join(skillsDir, f)).isDirectory());

const getMarketId = (skill) => {
    if (skill.includes('forex')) return 'forex';
    if (skill.includes('memecoins')) return 'memecoins';
    if (skill.includes('equities')) return 'equities';
    if (skill.includes('small_caps')) return 'small_caps';
    return 'crypto';
};

const l4aTemplate = (skill) => `import { L4AExecutionEngine, L4A_CONFIGS } from '../../engine/L4A_execution_engine';
import { PaperExecutionEngine } from '../../engine/PaperExecutionEngine';

/**
 * L4A Execution Engine - ${skill}
 * Specific algorithmic execution for ${skill} ecosystem.
 */
export class EcosystemL4A extends L4AExecutionEngine {
    constructor(engine: PaperExecutionEngine) {
        super(engine);
        // This ecosystem specifically targets: ${getMarketId(skill)}
    }
}
`;

const l4bTemplate = (skill) => `import { L4BPortfolioStrategist } from '../../engine/L4B_portfolio_strategist';
import { PaperExecutionEngine } from '../../engine/PaperExecutionEngine';

/**
 * L4B Portfolio Strategist - ${skill}
 * Specific macro tuning for ${skill} ecosystem.
 */
export class EcosystemL4B extends L4BPortfolioStrategist {
    constructor(engine: PaperExecutionEngine) {
        // We reuse the central L4B logic but can inject ecosystem specific prompts here
        super(engine);
    }
}
`;

const l5Template = (skill) => `import { L5QuantitativeResearcher } from '../../engine/L5_quantitative_researcher';

/**
 * L5 Quantitative Researcher - ${skill}
 * Ecosystem-specific autopsies and regime adaptations.
 */
export class EcosystemL5 extends L5QuantitativeResearcher {
    constructor() {
        // Reuse global L5 metrics but scoped for the specific market segments
        super();
    }
}
`;

skills.forEach(skill => {
    fs.writeFileSync(path.join(skillsDir, skill, 'L4A_execution_engine.ts'), l4aTemplate(skill));
    fs.writeFileSync(path.join(skillsDir, skill, 'L4B_portfolio_strategist.ts'), l4bTemplate(skill));
    fs.writeFileSync(path.join(skillsDir, skill, 'L5_quantitative_researcher.ts'), l5Template(skill));
    console.log("Written for " + skill);
});
