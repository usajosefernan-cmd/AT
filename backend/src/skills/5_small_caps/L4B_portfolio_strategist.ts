import { L4BPortfolioStrategist } from '../../engine/L4B_portfolio_strategist';
import { PaperExecutionEngine } from '../../engine/PaperExecutionEngine';

/**
 * L4B Portfolio Strategist - 5_small_caps
 * Specific macro tuning for 5_small_caps ecosystem.
 */
export class EcosystemL4B extends L4BPortfolioStrategist {
    constructor(engine: PaperExecutionEngine) {
        // We reuse the central L4B logic but can inject ecosystem specific prompts here
        super(engine);
        console.log("[5_small_caps] L4B Portfolio Strategist initialized.");
    }
}
