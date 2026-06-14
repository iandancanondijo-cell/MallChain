Tuning and Benchmarking Notes
=============================

This folder contains scripts to tune a local node for higher throughput and
to run simple tx benchmarks.

Scripts:
- `scripts/tune_node_for_throughput.sh` — tune config.toml, app.toml, and genesis.json.
  - Supports flags: `--mempool-size`, `--mempool-cache`, `--timeout-propose`, `--timeout-commit`,
    `--send-rate`, `--recv-rate`, `--indexer`, `--max-open-connections`, `--max-bytes`, `--max-gas`,
    `--dry-run`, and `--rollback`.
  - Example: `./scripts/tune_node_for_throughput.sh --home /tmp/mpnode --mempool-size 100000 --dry-run`

- `scripts/sequence_tx_batch.sh` — sequence-aware small batch script for mixed buys/sells.

- `scripts/benchmark_tx_generator.sh` — sequential tx generator (single-account). Use multiple
  instances or multiple accounts to scale concurrency.

Safety:
- Always run with `--dry-run` first to inspect changes.
- Backups are written to `$HOME/config/backup` before modifications.
- Use `--rollback` to restore backups if needed.

Recommendations to reach 10k+ TPS:
- Use many validator nodes on high-end hardware (NVMe, many cores, high network bandwidth).
- Optimize app code: minimize state writes, batch operations, and use parallel processing where safe.
- Use dedicated load-testing tools that generate raw txs and distribute them across multiple signing accounts.
