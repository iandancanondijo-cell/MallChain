export default function WalletHistory({ txs }) {
  return (
    <div>
      {txs.map(tx => (
        <div key={tx.hash}>
          <p>{tx.hash}</p>
          <p>{tx.amount}</p>
          <p>{tx.status}</p>
        </div>
      ))}
    </div>
  )
}