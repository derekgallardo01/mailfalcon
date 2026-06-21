/** Pure-SVG sparkline. No chart-lib dependency.
 *  Bins are equal-width along x; height scales linearly to max.
 *  Tooltip is the title attribute on each bar. */
export function Sparkline({
  points,
  width = 320,
  height = 48,
  label,
  startTs,
}: {
  points: number[]
  width?: number
  height?: number
  label?: string
  /** Epoch ms for the first bin. Used to render a per-bar tooltip. */
  startTs?: number
}) {
  const max = Math.max(1, ...points)
  const n = points.length
  if (n === 0) {
    return (
      <div className="rounded-md border border-falcon-200 bg-white px-3 py-4 text-center text-xs text-falcon-400">
        no data
      </div>
    )
  }
  const barW = width / n
  const dayMs = 86_400_000

  return (
    <div className="rounded-md border border-falcon-200 bg-white p-3">
      {label && (
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-falcon-500">
          {label}
        </p>
      )}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full"
        preserveAspectRatio="none"
      >
        {points.map((v, i) => {
          const h = Math.max(1, Math.round((v / max) * (height - 4)))
          const x = i * barW
          const y = height - h
          const dayTs = startTs ? startTs + i * dayMs : null
          const dayLabel = dayTs
            ? new Date(dayTs).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })
            : `day ${i + 1}`
          return (
            <rect
              key={i}
              x={x + 0.5}
              y={y}
              width={Math.max(1, barW - 1)}
              height={h}
              className="fill-falcon-500"
            >
              <title>{`${dayLabel}: ${v}`}</title>
            </rect>
          )
        })}
      </svg>
    </div>
  )
}
