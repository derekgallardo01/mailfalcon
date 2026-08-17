'use client'

import { useEffect, useState } from 'react'

export interface MapEvent {
  id: string | number
  city?: string | null
  regionCode?: string | null
  country?: string | null
  latitude?: string | null
  longitude?: string | null
  type: 'open' | 'click' | 'reply'
  subject?: string | null
  ts: number
}

interface LiveWorldMapProps {
  events: MapEvent[]
  activeNowCount?: number
}

// Equirectangular projection coordinates
function latLonToXY(lat: number, lon: number, width: number, height: number): [number, number] {
  const x = ((lon + 180) * (width / 360))
  const latRad = (lat * Math.PI) / 180
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2))
  const y = height / 2 - (width * mercN) / (2 * Math.PI)
  return [
    Math.max(10, Math.min(width - 10, x)),
    Math.max(10, Math.min(height - 10, y)),
  ]
}

export function LiveWorldMap({ events, activeNowCount = 0 }: LiveWorldMapProps) {
  const [recentPings, setRecentPings] = useState<MapEvent[]>([])

  useEffect(() => {
    setRecentPings(events.slice(0, 15))
  }, [events])

  const mapWidth = 800
  const mapHeight = 420

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-b from-[#0f172a] to-[#090d16] p-6 shadow-2xl">
      {/* Header Info */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-3.5 w-3.5 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-500"></span>
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Live Real-Time Activity Map</h3>
            <p className="text-xs text-slate-400">Streaming active recipient opens &amp; clicks worldwide</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="rounded-lg border border-slate-700/60 bg-slate-800/80 px-3 py-1.5 text-xs text-slate-300">
            Active Listeners: <span className="font-semibold text-cyan-400">{activeNowCount}</span>
          </div>
        </div>
      </div>

      {/* SVG Map Container */}
      <div className="relative flex items-center justify-center">
        <svg
          viewBox={`0 0 ${mapWidth} ${mapHeight}`}
          className="h-auto w-full max-w-4xl"
          style={{ filter: 'drop-shadow(0 4px 20px rgba(0, 212, 255, 0.05))' }}
        >
          {/* Subtle Grid Lat/Lon Lines */}
          <g stroke="#1e293b" strokeWidth="0.6" strokeDasharray="3 3" opacity="0.6">
            <line x1="0" y1="105" x2="800" y2="105" />
            <line x1="0" y1="210" x2="800" y2="210" stroke="#334155" strokeWidth="0.8" />
            <line x1="0" y1="315" x2="800" y2="315" />
            <line x1="200" y1="0" x2="200" y2="420" />
            <line x1="400" y1="0" x2="400" y2="420" stroke="#334155" strokeWidth="0.8" />
            <line x1="600" y1="0" x2="600" y2="420" />
          </g>

          {/* Simplified World Continents Vector Outline */}
          <g fill="#1e293b" stroke="#334155" strokeWidth="1" opacity="0.85">
            {/* North America */}
            <path d="M 120 70 Q 180 50 250 80 Q 280 120 230 180 Q 180 210 140 180 Q 100 130 120 70 Z" />
            {/* South America */}
            <path d="M 230 220 Q 280 230 270 310 Q 240 370 220 380 Q 200 320 210 250 Z" />
            {/* Europe */}
            <path d="M 390 80 Q 460 70 480 110 Q 450 140 400 130 Q 380 100 390 80 Z" />
            {/* Africa */}
            <path d="M 390 150 Q 480 160 480 240 Q 440 330 400 320 Q 370 230 390 150 Z" />
            {/* Asia */}
            <path d="M 490 70 Q 680 60 720 130 Q 680 220 580 200 Q 520 140 490 70 Z" />
            {/* Australia */}
            <path d="M 640 270 Q 720 280 710 340 Q 640 350 630 300 Z" />
          </g>

          {/* Live Pulsing Event Markers */}
          {recentPings.map((ev, idx) => {
            const lat = Number.parseFloat(ev.latitude ?? '37.77')
            const lon = Number.parseFloat(ev.longitude ?? '-122.41')
            if (Number.isNaN(lat) || Number.isNaN(lon)) return null

            const [cx, cy] = latLonToXY(lat, lon, mapWidth, mapHeight)
            const isClick = ev.type === 'click'
            const isReply = ev.type === 'reply'
            const color = isReply ? '#10b981' : isClick ? '#f59e0b' : '#00d4ff'

            return (
              <g key={`${ev.id}-${idx}`} className="transition-all duration-300">
                {/* Outer Ripple */}
                <circle cx={cx} cy={cy} r="14" fill={color} opacity="0.25">
                  <animate
                    attributeName="r"
                    values="4;18;24"
                    dur="2.5s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.6;0.2;0"
                    dur="2.5s"
                    repeatCount="indefinite"
                  />
                </circle>
                {/* Core Dot */}
                <circle
                  cx={cx}
                  cy={cy}
                  r="4"
                  fill={color}
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
              </g>
            )
          })}
        </svg>
      </div>

      {/* Recent Ticker Footer */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3 text-xs">
        <div className="flex items-center gap-4 text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#00d4ff]"></span> Open
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#f59e0b]"></span> Click
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#10b981]"></span> Reply
          </span>
        </div>

        <div className="text-slate-400">
          {recentPings.length > 0 ? (
            <span>
              Latest: <strong className="text-slate-200">{recentPings[0]?.city || recentPings[0]?.country || 'Unknown location'}</strong> · {recentPings[0]?.type}
            </span>
          ) : (
            <span>Waiting for incoming live opens...</span>
          )}
        </div>
      </div>
    </div>
  )
}
