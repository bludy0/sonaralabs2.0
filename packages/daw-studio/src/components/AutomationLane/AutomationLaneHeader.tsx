import { useDAWStore } from '../../store/useDAWStore'
import { C } from '../../constants'
import { AUTOMATION_PARAM_LABELS, AUTOMATION_PARAM_RANGES } from '../../types'
import type { AutomationLane } from '../../types'
import { LANE_H } from './AutomationLaneView'

interface Props {
  lane: AutomationLane
  trackColor: string
}

export function AutomationLaneHeader({ lane, trackColor }: Props) {
  const toggle = useDAWStore(s => s.toggleAutomationEnabled)
  const remove = useDAWStore(s => s.removeAutomationLane)

  const [min, max] = AUTOMATION_PARAM_RANGES[lane.param]
  const label      = AUTOMATION_PARAM_LABELS[lane.param]

  return (
    <div style={{
      height: LANE_H,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '0 8px 0 14px',
      borderBottom: `1px solid ${C.borderDim}`,
      background: C.bgDeep,
      flexShrink: 0,
    }}>
      {/* Vertical accent bar */}
      <div style={{
        width: 2, height: 28, borderRadius: 1,
        background: lane.enabled ? trackColor : C.borderDim,
        flexShrink: 0,
        transition: 'background 0.15s',
      }}/>

      {/* Label + range */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10, fontWeight: 600,
          color: lane.enabled ? C.text1 : C.text3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {label}
        </div>
        <div style={{ fontSize: 9, color: C.text3, marginTop: 1 }}>
          {min} → {max}
        </div>
      </div>

      {/* Enable toggle */}
      <button
        onClick={() => toggle(lane.id)}
        title={lane.enabled ? 'Disable lane' : 'Enable lane'}
        style={{
          width: 18, height: 18,
          background: lane.enabled ? trackColor + '25' : C.bgSubtle,
          color: lane.enabled ? trackColor : C.text3,
          border: `1px solid ${lane.enabled ? trackColor + '60' : C.borderDim}`,
          borderRadius: 3,
          fontSize: 9, fontWeight: 700,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
          flexShrink: 0,
        }}
      >
        A
      </button>

      {/* Remove */}
      <button
        onClick={() => remove(lane.id)}
        title="Remove automation lane"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: C.text3, fontSize: 14, padding: '0 2px',
          lineHeight: 1, flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  )
}
