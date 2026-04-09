import Transport from './Transport'
import { Timeline } from './Timeline/Timeline'
import { Mixer } from './Mixer/Mixer'
import { LoopEditor } from './LoopEditor/LoopEditor'
import { useDAWStore } from '../store/useDAWStore'

export default function DAWLayout() {
  const selectedClipId = useDAWStore(s => s.selectedClipId)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Transport />
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Timeline fills top area */}
        <div className="flex-1 overflow-hidden">
          <Timeline />
        </div>
        {/* Bottom panels */}
        <div className="flex border-t border-gray-800 shrink-0" style={{ height: 200 }}>
          <div className="flex-1 overflow-x-auto overflow-y-hidden border-r border-gray-800">
            <Mixer />
          </div>
          {selectedClipId && (
            <div className="w-96 overflow-hidden">
              <LoopEditor />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
