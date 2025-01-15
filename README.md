# Malicious Validators

Disclaimer: This is a work in progress, and the original version followed the work of [a-guard](https://github.com/a-guard/malicious-validators/)

### Methodology

1. Collect transactions from the sandwicher
2. Filter out transactions that don't have a Raydium trade and Jito tip
3. Group transactions by slot
4. Analyze the balances of the validators that signed the transactions
5. Compare the balances with the leader schedule to find malicious validators

### Setup

1. Install Bun
2. Install `direnv`
3. Run `direnv allow` to load the environment variables
4. Run `bun run src/index.ts` to start the analysis

### Environment Variables

- `RPC_URL`: The URL of the Solana RPC endpoint
- `SANDWICHER_ADDRESS`: The address of the sandwicher
- `MAX_TRANSACTIONS`: The maximum number of transactions to collect (optional, defaults to 100)
