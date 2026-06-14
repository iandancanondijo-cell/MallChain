import TransactionRow from "@/components/wallet/TransactionRow";

export default function Transactions() {
  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Transactions</h2>
      <TransactionRow type="income" title="Received" amount="KES 1,200" meta="Order #9901" />
      <TransactionRow type="expense" title="Sent" amount="KES 200" meta="Transfer to 0722xxxxxx" />
      <TransactionRow type="conversion" title="Converted" amount="0.5 MLCN" meta="From KES Balance" />
    </div>
  );
}