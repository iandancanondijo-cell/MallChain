const { DirectSecp256k1HdWallet } = require("@cosmjs/proto-signing");
const { SigningStargateClient, assertIsBroadcastTxSuccess } = require("@cosmjs/stargate");

const MNEMONIC = process.env.MNEMONIC;
if (!MNEMONIC) {
  console.error('ERROR: MNEMONIC environment variable is required for this script. Do NOT rely on default/fallback mnemonics.');
  console.error('Set MNEMONIC="..." in your shell or CI secrets and re-run.');
  process.exit(1);
}
const PREFIX = process.env.PREFIX || "mall";
const RPC = process.env.RPC || "http://localhost:26657"; // tendermint RPC
const GAS = process.env.GAS || "200000";

async function main() {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(MNEMONIC, { prefix: PREFIX });
  const [account] = await wallet.getAccounts();
  console.log("Using account:", account.address);

  const client = await SigningStargateClient.connectWithSigner(RPC, wallet, { gasPrice: "0.0mlc" });

  const to = process.env.TO || "mall1akw5s03a6sda4nk73jx5a5yyf3ntjtcstk6jqp"; // default validator acct
  const amount = [ { denom: "mlc", amount: "100" } ];

  const result = await client.sendTokens(account.address, to, amount, { amount: [{ denom: "mlc", amount: "0" }], gas: GAS });
  try {
    assertIsBroadcastTxSuccess(result);
    console.log("Tx success. TxHash:", result.transactionHash);
  } catch (e) {
    console.error("Tx failed:", e);
    process.exit(2);
  }

  client.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
