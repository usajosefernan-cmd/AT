import { L4BPortfolioStrategist } from '../../engine/L4B_portfolio_strategist';
import { PaperExecutionEngine } from '../../engine/PaperExecutionEngine';

/**
 * L4B Portfolio Strategist - 4_equities_large
 * Specific macro tuning for 4_equities_large ecosystem.
 */
export class EcosystemL4B extends L4BPortfolioStrategist {
    constructor(engine: PaperExecutionEngine) {
        // We reuse the central L4B logic but can inject ecosystem specific prompts here
        super(engine);
        console.log("[4_equities_large] L4B Portfolio Strategist initialized.");
    }
}
