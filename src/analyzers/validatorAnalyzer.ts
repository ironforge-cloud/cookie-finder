import * as fs from 'fs';
import * as path from 'path';

interface ValidatorStake {
    stake_authority: string;
    active_stake: number;
}

interface Validator {
    identity: string;
    vote_identity: string;
    activated_stake: number;
}

interface AnalysisResult {
    validatorDetails: {
        [identity: string]: {
            voteAccount: string;
            delegatedStake: number;
            sandwichCount: number;
        };
    };
    totalSandwiches: number;
    totalActivatedStake: number;
    totalDelegatedStake: number;
}

export class ValidatorAnalyzer {
    private static STAKE_WIZ_API = 'https://api.stakewiz.com/';
    private static STAKE_AUTH = '6iQKfEyhr3bZMotVkW6beNZz5CPAkiwvgV2CTje9pVSS';
    
    private slotLeaders: Record<string, string>;
    private sandwiches: Record<string, string[][]>;

    constructor() {
        try {
            this.slotLeaders = this.loadJson('slot-leader.json');
            this.sandwiches = this.loadJson('filtered_sandwiches.json');
        } catch (error) {
            console.error('Error loading required JSON files:', error);
            throw new Error('Failed to initialize ValidatorAnalyzer: required files not found');
        }
    }

    private loadJson(filename: string): any {
        const filePath = path.join(process.cwd(), 'data', filename);
        if (!fs.existsSync(filePath)) {
            throw new Error(`Required file not found: ${filename}. Make sure to run all previous steps successfully.`);
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }

    private async checkStakeByVote(voteAccount: string, stakeAuth: string): Promise<number> {
        try {
            const response = await fetch(`${ValidatorAnalyzer.STAKE_WIZ_API}validator_stakes/${voteAccount}`);
            if (!response.ok) {
                console.error(`Error response: ${response.status} ${response.statusText}`);
                return 0;
            }
            
            const stakes: ValidatorStake[] = await response.json();
            const totalStake = stakes
                .filter(stake => stake.stake_authority === stakeAuth)
                .reduce((sum, stake) => sum + stake.active_stake, 0);

            return totalStake / 1e9; // Convert to SOL
        } catch (error) {
            console.error(`Error checking stake for vote account ${voteAccount}:`, error);
            return 0;
        }
    }

    private countSandwiches(identityAccount: string): number {
        return Object.entries(this.sandwiches).reduce((count, [block, sandwichList]) => {
            if (this.slotLeaders[block] === identityAccount) {
                return count + sandwichList.length;
            }
            return count;
        }, 0);
    }

    async analyzeValidators(): Promise<AnalysisResult> {
        const identitySet = new Set(Object.values(this.slotLeaders));
        
        try {
            const response = await fetch(`${ValidatorAnalyzer.STAKE_WIZ_API}validators?sort=-activated_stake`);
            if (!response.ok) {
                throw new Error(`Failed to fetch validators: ${response.status} ${response.statusText}`);
            }
            
            const validators: Validator[] = await response.json();

            const result: AnalysisResult = {
                validatorDetails: {},
                totalSandwiches: 0,
                totalActivatedStake: 0,
                totalDelegatedStake: 0
            };

            for (const validator of validators) {
                if (identitySet.has(validator.identity)) {
                    // Add delay to prevent rate limiting
                    await new Promise(resolve => setTimeout(resolve, 100));

                    const delegatedStake = await this.checkStakeByVote(
                        validator.vote_identity,
                        ValidatorAnalyzer.STAKE_AUTH
                    );

                    if (delegatedStake < 1) continue;

                    const sandwichCount = this.countSandwiches(validator.identity);

                    result.validatorDetails[validator.identity] = {
                        voteAccount: validator.vote_identity,
                        delegatedStake,
                        sandwichCount
                    };

                    result.totalSandwiches += sandwichCount;
                    result.totalActivatedStake += validator.activated_stake;
                    result.totalDelegatedStake += delegatedStake;

                    console.log(
                        validator.identity,
                        validator.vote_identity,
                        delegatedStake.toLocaleString(),
                        sandwichCount
                    );
                }
            }

            return result;
        } catch (error) {
            console.error('Error analyzing validators:', error);
            throw error;
        }
    }

    static saveResults(results: AnalysisResult): void {
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        fs.writeFileSync(
            path.join(dataDir, 'validator-analysis.json'),
            JSON.stringify(results, null, 4)
        );

        // Print summary
        console.log('\nAnalysis Summary:');
        console.log(`Total sandwiches: ${results.totalSandwiches}`);
        console.log(`Total activated stake: ${results.totalActivatedStake.toLocaleString()} SOL`);
        console.log(`Total delegated by ${ValidatorAnalyzer.STAKE_AUTH}: ${results.totalDelegatedStake.toLocaleString()} SOL`);
    }
} 