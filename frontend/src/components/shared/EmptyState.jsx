import { Inbox } from 'lucide-react'

/**
 * Generic empty state with icon and message.
 */
export default function EmptyState({ icon: Icon = Inbox, title = 'Nothing here yet', description }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-slate-500" />
      </div>
      <p className="text-white font-semibold">{title}</p>
      {description && (
        <p className="text-slate-400 text-sm mt-2 max-w-sm">{description}</p>
      )}
    </div>
  )
}
