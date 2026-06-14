type QRCodeScannerProps = {
  onResult: (data: string | null) => void;
  onClose: () => void;
};

export default function QRCodeScanner({ onResult, onClose }: QRCodeScannerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="bg-slate-900 rounded-3xl p-8 w-full max-w-lg">
        <h2 className="text-xl font-black text-white mb-4">Scan QR Code</h2>
        <p className="text-slate-400 mb-6">This is a placeholder scanner component.</p>
        <div className="grid gap-4">
          <button
            onClick={() => onResult('mocked-wallet-address')}
            className="rounded-2xl bg-indigo-600 px-4 py-3 text-white font-bold"
          >
            Use Mock Address
          </button>
          <button
            onClick={onClose}
            className="rounded-2xl bg-white/10 px-4 py-3 text-slate-200 font-bold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
