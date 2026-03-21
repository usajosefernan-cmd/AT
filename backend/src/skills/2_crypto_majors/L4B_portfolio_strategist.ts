import { L4BPortfolioStrategist } from '../../engine/L4B_portfolio_strategist';
import { PaperExecutionEngine } from '../../engine/PaperExecutionEngine';

/**
 * L4B Portfolio Strategist - 2_crypto_majors
 * Specific macro tuning for 2_crypto_majors ecosystem.
 */
export class EcosystemL4B extends L4BPortfolioStrategist {
    constructor(engine: PaperExecutionEngine) {
        // We reuse the central L4B logic but can inject ecosystem specific prompts here
        super(engine);
    }
}
