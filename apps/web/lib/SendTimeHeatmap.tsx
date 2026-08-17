'use client'

import { useEffect, useState } from 'react'

interface SendTimeSlot {
  dayOfWeek: number
  hourOfDay: number
  opens: number
  clicks: number
  totalActivity: number
  score: number
}

interface SendTimeData {
  slots: SendTimeSlot[]
  totalEventsAnalyzed: number
  peakRecommendation?: {
    dayOfWeek: number
    hourOfDay: number
    score: number
  }
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS = Array.from({ length: 24 }, (_, i) => {
  const ampm = i >= 12 ? 'PM' : 'AM'
  const h = i % 12 === 0 ? 12 : i % 12
  return `${h}${ampm}`
})

export function SendTimeHeatmap({ apiHost, token }: { apiHost: string; token: string }) {
  const [data, setData] = useState<SendTimeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [hoveredSlot, setHoveredSlot] = useState<SendTimeSlot | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${apiHost}/v1/analytics/send-time`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const json = await res.json()
          setData(json)
        }
      } catch (err) {
        console.error('Failed to load send-time analytics:', err)
      } finally {
        setLoading(false)
      }
    }
    if (token) void load()
  }, [apiHost, token])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-800 bg-[#0f172a] p-6 text-slate-400">
        Analyzing engagement time patterns...
      </div>
    )
  }

  const slotMap = new Map<string, SendTimeSlot>()
  data?.slots.forEach((s) => {
    slotMap.set(`${s.dayOfWeek}:${s.hourOfDay}`, s)
  })

  const peakDay = data?.peakRecommendation ? DAYS[data.peakRecommendation.dayOfWeek] : 'Tue'
  const peakHour = data?.peakRecommendation ? HOURS[data.peakRecommendation.hourOfDay] : '10AM'

  return (
    <div className="rounded-2xl border border-slate-800 bg-gradient-to-b from-[#0f172a] to-[#090d16] p-6 shadow-2xl">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-white">Send-Time Intelligence Heatmap</h3>
          <p className="text-xs text-slate-400">
            Historical engagement breakdown by day and hour ({data?.totalEventsAnalyzed ?? 0} events analyzed)
          </p>
        </div>
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/40 px-4 py-2 text-xs text-cyan-300">
          Peak Open Window: <strong className="font-semibold text-cyan-200">{peakDay} at {peakHour} UTC</strong>
        </div>
      </div>

      {/* Heatmap Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Hour labels */}
          <div className="grid grid-cols-25 gap-1 pb-1 text-[10px] text-slate-500">
            <div className="w-10"></div>
            {HOURS.filter((_, idx) => idx % 2 === 0).map((h, i) => (
              <div key={i} className="col-span-2 text-center">
                {h}
              </div>
            ))}
          </div>

          {/* 7 Days */}
          {DAYS.map((dayName, dayIdx) => (
            <div key={dayIdx} className="my-1 flex items-center gap-1">
              <span className="w-10 text-xs font-medium text-slate-400">{dayName}</span>
              <div className="grid flex-1 grid-cols-24 gap-1">
                {Array.from({ length: 24 }).map((_, hourIdx) => {
                  const slot = slotMap.get(`${dayIdx}:${hourIdx}`) || {
                    dayOfWeek: dayIdx,
                    hourOfDay: hourIdx,
                    opens: 0,
                    clicks: 0,
                    totalActivity: 0,
                    score: 0,
                  }

                  // Color intensity based on score
                  let bgClass = 'bg-slate-900 border-slate-800/80'
                  if (slot.score > 75) bgClass = 'bg-cyan-400 border-cyan-300 shadow-[0_0_8px_rgba(0,212,255,0.4)]'
                  else if (slot.score > 50) bgClass = 'bg-cyan-600 border-cyan-500'
                  else if (slot.score > 25) bgClass = 'bg-cyan-900/80 border-cyan-800'
                  else if (slot.score > 0) bgClass = 'bg-slate-800 border-slate-700'

                  return (
                    <div
                      key={hourIdx}
                      onMouseEnter={() => setHoveredSlot(slot)}
                      onMouseLeave={() => setHoveredSlot(null)}
                      className={`h-5 w-full cursor-pointer rounded border transition-all hover:scale-110 ${bgClass}`}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hover Detail Card & Legend */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-800 pt-4 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span>Less Active</span>
          <div className="flex items-center gap-1">
            <span className="h-3 w-3 rounded bg-slate-900 border border-slate-800"></span>
            <span className="h-3 w-3 rounded bg-slate-800"></span>
            <span className="h-3 w-3 rounded bg-cyan-900"></span>
            <span className="h-3 w-3 rounded bg-cyan-600"></span>
            <span className="h-3 w-3 rounded bg-cyan-400"></span>
          </div>
          <span>Peak</span>
        </div>

        <div>
          {hoveredSlot ? (
            <span>
              <strong className="text-white">
                {DAYS[hoveredSlot.dayOfWeek]} {HOURS[hoveredSlot.hourOfDay]}
              </strong>
              : {hoveredSlot.opens} opens · {hoveredSlot.clicks} clicks (Score: {hoveredSlot.score}%)
            </span>
          ) : (
            <span>Hover over any hour block to view stats</span>
          )}
        </div>
      </div>
    </div>
  )
}
