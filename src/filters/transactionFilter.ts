import { Connection, PublicKey } from '@solana/web3.js';
import type { VersionedMessage, MessageV0 } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

interface TokenBalance {
    mint: string;
    owner: string;
    uiTokenAmount: {
        amount: string;
    };
}

interface TransactionData {
    slot: number;
    transaction: {
        message: {
            accountKeys: { pubkey: PublicKey; }[];
        };
    };
    meta: {
        preTokenBalances: TokenBalance[];
        postTokenBalances: TokenBalance[];
    };
}

export class TransactionFilter {
    private connection: Connection;
    private static JITO_TIP_ACCOUNTS = [
        'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
        'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
        '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
        'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
        'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
        'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
        '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
        'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL'
    ];
    private static RAYDIUM_ACCOUNT = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
    private static RAYDIUM_AUTH = '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1';
    private static WSOL_MINT = 'So11111111111111111111111111111111111111112';

    constructor(rpcUrl: string) {
        this.connection = new Connection(rpcUrl);
    }

    async filterTransactions(signatures: string[]): Promise<Record<number, string[][]>> {
        const balanceFlow: Record<number, Record<string, Record<number, string[]>>> = {};
        
        // Process transactions in chunks to avoid rate limiting
        const chunkSize = 100;
        for (let i = 0; i < signatures.length; i += chunkSize) {
            const chunk = signatures.slice(i, i + chunkSize);
            await Promise.all(chunk.map(sig => this.processTransaction(sig, balanceFlow)));
            console.log(`Processed ${i + chunk.length}/${signatures.length} transactions`);
        }

        return this.identifySandwiches(balanceFlow);
    }

    private async processTransaction(
        signature: string, 
        balanceFlow: Record<number, Record<string, Record<number, string[]>>>
    ): Promise<void> {
        try {
            const tx = await this.connection.getTransaction(signature, {
                maxSupportedTransactionVersion: 0
            });
            if (!tx?.transaction?.message) return;

            // Get account keys safely, handling different message formats
            let accountKeys: string[] = [];
            if ('accountKeys' in tx.transaction.message) {
                accountKeys = tx.transaction.message.accountKeys.map(key => 
                    typeof key === 'string' ? key : key.toString()
                );
            } else if ('staticAccountKeys' in tx.transaction.message) {
                accountKeys = tx.transaction.message.staticAccountKeys.map(key => 
                    key.toString()
                );
            }

            // Check for Raydium transactions
            const hasRaydium = accountKeys.includes(TransactionFilter.RAYDIUM_ACCOUNT);
            // Check for Jito tip accounts (disabled for now)
            // const hasJito = accountKeys.some(acc => TransactionFilter.JITO_TIP_ACCOUNTS.includes(acc));
            
            if (!hasRaydium) {
                // Log only when we find a Raydium transaction
                return;
            }
            // Full check including Jito (disabled for now):
            // if (hasJito) {
            //     return;
            // }

            // Process token balances
            if (!tx.meta?.preTokenBalances || !tx.meta?.postTokenBalances) return;

            // Find matching balances for the same mint/owner combination
            const preBalance = tx.meta.preTokenBalances.find(balance => 
                balance.mint !== TransactionFilter.WSOL_MINT && 
                balance.owner === TransactionFilter.RAYDIUM_AUTH
            );
            const postBalance = tx.meta.postTokenBalances.find(balance => 
                balance.mint === preBalance?.mint && 
                balance.owner === TransactionFilter.RAYDIUM_AUTH
            );
            
            if (!preBalance || !postBalance) return;
            
            const txCoinFlow = Math.abs(
                parseInt(preBalance.uiTokenAmount.amount) - parseInt(postBalance.uiTokenAmount.amount)
            );
            if (txCoinFlow === 0) return;

            // Store the transaction data
            this.updateBalanceFlow(balanceFlow, tx.slot, preBalance.mint, txCoinFlow, signature);

        } catch (error) {
            console.error(`Error processing transaction ${signature}:`, error);
        }
    }

    private updateBalanceFlow(
        balanceFlow: Record<number, Record<string, Record<number, string[]>>>,
        slot: number,
        txMint: string,
        txCoinFlow: number,
        signature: string
    ): void {
        if (!balanceFlow[slot]) balanceFlow[slot] = {};
        if (!balanceFlow[slot][txMint]) balanceFlow[slot][txMint] = {};
        if (!balanceFlow[slot][txMint][txCoinFlow]) balanceFlow[slot][txMint][txCoinFlow] = [];
        balanceFlow[slot][txMint][txCoinFlow].push(signature);
    }

    private identifySandwiches(
        balanceFlow: Record<number, Record<string, Record<number, string[]>>>
    ): Record<number, string[][]> {
        const sandwiches: Record<number, string[][]> = {};

        for (const [slot, mintData] of Object.entries(balanceFlow)) {
            const slotNum = parseInt(slot);
            for (const [, flowData] of Object.entries(mintData)) {
                for (const [, signatures] of Object.entries(flowData)) {
                    if (signatures.length === 2) {
                        if (!sandwiches[slotNum]) sandwiches[slotNum] = [];
                        sandwiches[slotNum].push(signatures);
                    }
                }
            }
        }

        return sandwiches;
    }

    static saveResults(results: Record<number, string[][]>): void {
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        fs.writeFileSync(
            path.join(dataDir, 'filtered_sandwiches.json'),
            JSON.stringify(results, null, 4)
        );
    }
} 