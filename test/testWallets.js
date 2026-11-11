/**
 * Shared loader for the disposable test-fixture wallets.
 *
 * test/generate-test-wallets.js writes test/test-wallets.json, and that file is
 * deliberately untracked: it holds spending keys, so a funded mnemonic sitting
 * in a tracked file is readable by everyone who clones the repo — which is how
 * three funded test fixtures and four genesis keeper phrases ended up published
 * in the first place. The generator's own header already stated the policy
 * ("Credentials stored in test/ directory, not committed to git"); this module
 * is what makes that policy real instead of aspirational.
 *
 * There is intentionally no fallback that fabricates wallets: an unfunded
 * fixture cannot sign a usable transaction, so inventing one here would just
 * produce a test that fails somewhere less obvious.
 */
const fs = require('fs');
const path = require('path');

const TEST_WALLETS_PATH = path.join(__dirname, 'test-wallets.json');

const MISSING_MESSAGE =
  `${TEST_WALLETS_PATH} is missing. It is intentionally untracked, because it holds ` +
  'spending keys. Create fresh local fixtures with `node test/generate-test-wallets.js`, ' +
  'fund them (faucet or a local genesis), then re-run this script.';

function loadTestWallets() {
  if (!fs.existsSync(TEST_WALLETS_PATH)) {
    const err = new Error(MISSING_MESSAGE);
    err.code = 'TEST_WALLETS_MISSING';
    throw err;
  }
  return JSON.parse(fs.readFileSync(TEST_WALLETS_PATH, 'utf8'));
}

function loadTestWalletData(name) {
  const wallets = loadTestWallets();
  const walletData = wallets[name];
  if (!walletData) {
    throw new Error(
      `${name} is not in ${TEST_WALLETS_PATH}. Re-run \`node test/generate-test-wallets.js\` ` +
        'to regenerate the local fixtures.'
    );
  }
  return walletData;
}

module.exports = { TEST_WALLETS_PATH, loadTestWallets, loadTestWalletData };
