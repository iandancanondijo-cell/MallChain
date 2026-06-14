const { DirectSecp256k1HdWallet } = require("@cosmjs/proto-signing");

const MNEMONIC = process.env.MNEMONIC;
if (!MNEMONIC) {
  console.error('ERROR: MNEMONIC environment variable is required for this script. Do NOT rely on default/fallback mnemonics.');
  console.error('Set MNEMONIC="..." in your shell or CI secrets and re-run.');
  process.exit(1);
}
const PREFIX = process.env.PREFIX || "mall";

async function main() {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(MNEMONIC, { prefix: PREFIX });
  const [first] = await wallet.getAccounts();
  console.log("ADDRESS=", first.address);
  console.log("PUBKEY=", first.pubkey && Buffer.from(first.pubkey).toString('base64'));
}

main().catch((e) => { console.error(e); process.exit(1); });
