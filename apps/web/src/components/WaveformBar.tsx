interface WaveformBarProps {
  data: number[];
  width?: number;
  height?: number;
  progress?: number; // 0-1
  barColor?: string;
  progressColor?: string;
}

export function WaveformBar({
  data,
  width = 200,
  height = 40,
  progress = 0,
  barColor = "var(--text-3)",
  progressColor = "var(--accent)",
}: WaveformBarProps) {
  if (!data || data.length === 0) {
    return (
      <div
        className="rounded"
        style={{ width, height, background: "var(--bg-input)" }}
      />
    );
  }

  const barCount = data.length;
  const barWidth = Math.max(1, Math.floor(width / barCount) - 1);
  const gap = Math.max(0, width - barCount * barWidth) / Math.max(1, barCount - 1);
  const progressWidth = width * Math.max(0, Math.min(1, progress));

  return (
    <div className="relative overflow-hidden rounded" style={{ width, height }}>
      {/* Background bars */}
      <svg width={width} height={height} className="block">
        {data.map((value, i) => {
          const x = i * (barWidth + gap);
          const barHeight = Math.max(2, value * height);
          const y = (height - barHeight) / 2;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={barWidth / 2}
              fill={barColor}
            />
          );
        })}
      </svg>

      {/* Progress overlay */}
      <div
        className="absolute top-0 left-0 h-full overflow-hidden rounded"
        style={{ width: progressWidth }}
      >
        <svg width={width} height={height} className="block">
          {data.map((value, i) => {
            const x = i * (barWidth + gap);
            const barHeight = Math.max(2, value * height);
            const y = (height - barHeight) / 2;
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={barWidth / 2}
                fill={progressColor}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
