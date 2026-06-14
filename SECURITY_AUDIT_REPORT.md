Security Audit Report - Mallchain

Summary:
- Removed hardcoded mnemonics from scripts and now require MNEMONIC/TEST_MNEMONIC env vars.
- Hardened `backend/src/controllers/sendController.js` to reject `privateKey` payloads in production; dev opt-in requires `ALLOW_INSECURE_PRIVATE_KEY=true`.
- Centralized runtime secret checks in `backend/src/config/index.js` and added `validateRuntimeSecrets()` called at startup.
- Hardened faucet usage: `FAUCET_MNEMONIC` preferred; use of `OPERATOR_MNEMONIC` requires `ALLOW_OPERATOR_MNEMONIC=true` opt-in.
- Prevented implicit usage of `OPERATOR_MNEMONIC` in `backend/src/utils/cosmosClient.js` unless explicitly allowed in dev.
- Added request sanitization middleware `backend/src/middleware/sanitizeSensitive.js` and updated logging to include redacted request bodies.
- Rejected plaintext `password` fields in `vault` create/update endpoints unless `ALLOW_PLAINTEXT_VAULT_PASSWORDS=true` is set (dev-only opt-in).

Findings (remaining/high-priority):
- `frontend_legacy/dist` bundles and some E2E tests rely on insecure AES encryption with empty keys and localStorage storage for private keys/tokens. These artifacts should be removed or replaced with a secure WebCrypto keystore or a wallet provider integration.
- Multiple places use env-set operator/faucet mnemonics; ensure secrets are stored in a secure secret manager and not in code or unprotected env in production.
- Protobuf-generated files (e.g., `marketplace/vault/v1/tx.pb.go`) contain `Password` fields. Do NOT accept plaintext vault passwords over API without field-level encryption; enforce client-side encryption or use envelope encryption.
- Several docs and example files contain placeholder credentials (e.g., `OPERATOR_MNEMONIC=your_operator_mnemonic_here`). Ensure examples do not get committed with live credentials.
- Logging and monitoring should be audited to verify no plaintext secrets are persisted in logs (sanitizer added but review for other log sinks).

Recommended Next Actions (prioritized):
1. Replace `frontend_legacy` wallet storage with a secure WebCrypto-based keystore or integrate with wallet extensions (Metamask/Cosmos wallet providers). Remove legacy bundles from production builds.
2. Adopt a secrets manager (Vault/Azure KeyVault/GCP Secret Manager) for `OPERATOR_MNEMONIC`, `FAUCET_MNEMONIC`, `JWT_SECRET`, `SESSION_SECRET`, `ADMIN_API_KEY` and rotate keys periodically.
3. Add CI checks to forbid hardcoded mnemonics, private keys, RSA keys, and high-entropy secrets in the repo (pre-commit or CI scanning using trivy/semgrep).
4. Enforce TLS for all endpoints handling secrets; require clients to encrypt vault password fields before sending.
5. Run dependency vulnerability scans (`trivy`) regularly and after any dependency changes; schedule automated scans.
6. Replace any `localStorage` plaintext token usage with secure, HttpOnly cookies for auth tokens where appropriate; for wallet private keys, never persist them client-side.
7. Audit all dev/test scripts and CI jobs for accidental secret exposure (e.g., `/tmp/*.txt` mnemonics).

Files changed in this run:
- `scripts/gen_address.js`
- `scripts/cosmjs_send.js`
- `scripts/send_mlcoin_msg.js`
- `scripts/derive_mall_addr.js`
- `backend/src/controllers/sendController.js`
- `backend/src/config/index.js`
- `backend/src/services/faucetService.js`
- `backend/src/utils/cosmosClient.js`
- `backend/src/middleware/sanitizeSensitive.js`
- `backend/src/index.js`
- `backend/src/utils/logger.js`
- `backend/src/controllers/vaultController.js`

If you want, I can:
- Continue and implement a WebCrypto keystore in `frontend/src` as a drop-in replacement for legacy storage.
- Remove or quarantine `frontend_legacy/dist` from production assets.
- Run a targeted `trivy` and `semgrep` scan and produce findings.


