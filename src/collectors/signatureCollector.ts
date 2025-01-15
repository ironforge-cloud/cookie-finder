import { Connection, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

export class SignatureCollector {
    private connection: Connection;
    private sandwicherPubkey: PublicKey;
    private maxTransactions: number;

    constructor(rpcUrl: string, sandwicherAddress: string) {
        if (!rpcUrl) throw new Error('RPC URL is required');
        this.connection = new Connection(rpcUrl);
        this.sandwicherPubkey = new PublicKey(sandwicherAddress);
        
        // Default to 100 transactions if MAX_TRANSACTIONS is not set
        this.maxTransactions = parseInt(process.env.MAX_TRANSACTIONS || '100', 10);
        console.log(`Collecting up to ${this.maxTransactions} transactions`);
    }

    async collectSignatures(): Promise<Record<string, number>> {
        const signatureToSlot: Record<string, number> = {};

        try {
            let signatures = await this.connection.getSignaturesForAddress(this.sandwicherPubkey);
            
            while (signatures.length > 0 && Object.keys(signatureToSlot).length < this.maxTransactions) {
                for (const sig of signatures) {
                    if (sig.err !== null) continue;
                    signatureToSlot[sig.signature] = sig.slot;
                    
                    // Check if we've reached the limit
                    if (Object.keys(signatureToSlot).length >= this.maxTransactions) {
                        break;
                    }
                }

                // Break if we've reached the limit
                if (Object.keys(signatureToSlot).length >= this.maxTransactions) {
                    break;
                }

                const lastSig = signatures[signatures.length - 1].signature;
                console.log('lastSig:', lastSig, 'slot:', signatures[signatures.length - 1].slot, 'len:', Object.keys(signatureToSlot).length);

                signatures = await this.connection.getSignaturesForAddress(this.sandwicherPubkey, { before: lastSig });
            }

            return signatureToSlot;
        } catch (error) {
            console.error('Error collecting signatures:', error);
            throw error;
        }
    }

    static saveToFile(data: Record<string, number>, filename: string = 'signature-slot.json'): void {
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        fs.writeFileSync(
            path.join(dataDir, filename),
            JSON.stringify(data, null, 4)
        );
    }
} 