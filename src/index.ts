import { Connection } from '@solana/web3.js';
import { SignatureCollector } from './collectors/signatureCollector';
import { TransactionFilter } from './filters/transactionFilter';
import { ValidatorAnalyzer } from './analyzers/validatorAnalyzer';
import * as fs from 'fs';
import * as path from 'path';

async function getLeaderSchedule(connection: Connection, slot: number): Promise<Record<string, string>> {
    const schedule = await connection.getLeaderSchedule(slot);
    if (!schedule) throw new Error('Failed to get leader schedule');
    
    const slotLeaders: Record<string, string> = {};
    for (const [pubkey, slots] of Object.entries(schedule)) {
        for (const slot of slots) {
            slotLeaders[slot.toString()] = pubkey;
        }
    }
    
    // Save the slot leader data
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(
        path.join(dataDir, 'slot-leader.json'),
        JSON.stringify(slotLeaders, null, 4)
    );

    return slotLeaders;
}

async function main() {
    const rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) throw new Error('RPC_URL environment variable not set');

    const SANDWICHER_ADDRESS = process.env.SANDWICHER_ADDRESS;
    if (!SANDWICHER_ADDRESS) throw new Error('SANDWICHER_ADDRESS environment variable not set');

    const connection = new Connection(rpcUrl);
    
    try {
        // Step 1: Collect all transactions from the sandwicher
        const collector = new SignatureCollector(rpcUrl, SANDWICHER_ADDRESS);
        const signatureToSlot = await collector.collectSignatures();
        SignatureCollector.saveToFile(signatureToSlot);
        
        // Steps 2-4: Filter and analyze transactions
        const filter = new TransactionFilter(rpcUrl);
        const signatures = Object.keys(signatureToSlot);
        console.log(`Processing ${signatures.length} transactions...`);
        
        // Filter out transactions that don't have a Raydium trade and Jito tip
        const sandwiches = await filter.filterTransactions(signatures);
        TransactionFilter.saveResults(sandwiches);
        console.log('Filtered transactions:', sandwiches);

        // Get leader schedule for the relevant slots
        const slots = Object.keys(sandwiches).map(Number);
        if (slots.length > 0) {
            const minSlot = Math.min(...slots);
            try {
                await getLeaderSchedule(connection, minSlot);
            } catch (error) {
                console.error('Error getting leader schedule:', error);
                return; // Exit if we can't get the leader schedule
            }
        } else {
            console.log('No sandwiches found, skipping validator analysis');
            return;
        }
        
        // Step 5: Analyze validators
        console.log('\nAnalyzing validators...');
        const analyzer = new ValidatorAnalyzer();
        const analysis = await analyzer.analyzeValidators();
        ValidatorAnalyzer.saveResults(analysis);
        
    } catch (error) {
        console.error('Error in main:', error);
    }
}

main().catch(console.error); 