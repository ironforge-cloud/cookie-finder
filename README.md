# Cookie Finder

Cookie Finder helps detect potential malicious validators by analyzing sandwiched transactions. The end goal is to provide an ELO score for each validator based on their behavior every epoch and to provide a list of validators that are likely to be malicious when the ELO score is below a certain threshold.

### Methodology

1. Collect transactions from the sandwicher
2. Filter out transactions that don't have a Raydium trade
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

### Disclaimer

This is a work in progress, and the original version followed the work of [a-guard](https://github.com/a-guard/malicious-validators/)