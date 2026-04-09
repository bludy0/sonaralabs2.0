import { useDAWStore } from '../../store/useDAWStore'

export function MasterStrip() {
  const masterVolume = useDAWStore(s => s.masterVolume)
  const setMasterVolume = useDAWStore(s => s.setMasterVolume)

  return (
    <div className="flex flex-col items-center gap-1 w-20 shrink-0 border-l border-gray-700 px-2 py-2 bg-gray-900/80 h-full">
      <span className="text-xs text-gray-300 font-medium">MASTER</span>
      <div className="flex-1 flex items-center justify-center">
        <input
          type="range" min={0} max={1} step={0.01} value={masterVolume}
          onChange={e => setMasterVolume(Number(e.target.value))}
          className="accent-emerald-500"
          style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 80, width: 20 } as React.CSSProperties}
        />
      </div>
      <span className="text-xs text-gray-500 tabular-nums">{Math.round(masterVolume * 100)}</span>
    </div>
  )
}
