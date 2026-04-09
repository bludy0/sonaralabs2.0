import { useState } from 'react'
import { EQPanel } from './EQPanel'
import { ReverbPanel } from './ReverbPanel'
import { DelayPanel } from './DelayPanel'

type Tab = 'eq' | 'reverb' | 'delay'

interface Props { trackId: string; onClose: () => void }

export function EffectsPanel({ trackId, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('eq')

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-72 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1">
          {(['eq', 'reverb', 'delay'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1 rounded text-xs font-medium uppercase tracking-wider transition-colors ${
                tab === t ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}>
              {t}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none ml-2">x</button>
      </div>
      {tab === 'eq' && <EQPanel trackId={trackId} />}
      {tab === 'reverb' && <ReverbPanel trackId={trackId} />}
      {tab === 'delay' && <DelayPanel trackId={trackId} />}
    </div>
  )
}
