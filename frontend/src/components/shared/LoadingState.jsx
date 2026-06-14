import { Loader2 } from 'lucide-react'

/**
 * Full-area loading spinner with optional message.
 */
export default function LoadingState({ message = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <Loader2 className="w-10 h-10 text-cyan-500 animate-spin" />
      <p className="text-slate-400 mt-4 text-sm">{message}</p>
    </div>
  )
}
