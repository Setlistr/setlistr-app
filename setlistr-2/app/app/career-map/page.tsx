'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

const C = {
  bg: '#0a0908', card: '#141210',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
}

type ShowLocation = {
  city: string
  country: string
  lat: number
  lng: number
  count: number
  venues: string[]
  firstShow: string | null
  lastShow: string | null
}

export default function CareerMapPage() {
  const router = useRouter()
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const [locations, setLocations] = useState<ShowLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ cities: 0, countries: 0, shows: 0 })

  useEffect(() => {
    const supabase = createClient()
    async function loadLocations() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/auth/login'); return }

      const { data: perfs } = await supabase
        .from('performances')
        .select('city, country, venue_name, started_at')
        .eq('user_id', user.id)
        .in('status', ['complete', 'completed', 'review'])
        .neq('data_source', 'setlistfm_imported')
        .not('city', 'is', null)

      if (!perfs) { setLoading(false); return }

      // Geocode cities using Mapbox Geocoding API
      const cityMap: Record<string, ShowLocation> = {}
      const geocodeCache: Record<string, { lat: number; lng: number }> = {}

      for (const perf of perfs) {
        if (!perf.city) continue
        const key = `${perf.city}__${perf.country || ''}`

        if (!cityMap[key]) {
          // Geocode this city
          if (!geocodeCache[key]) {
            try {
              const query = [perf.city, perf.country].filter(Boolean).join(', ')
              const res = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?types=place&limit=1&access_token=${mapboxgl.accessToken}`
              )
              const data = await res.json()
              if (data.features?.[0]) {
                const [lng, lat] = data.features[0].center
                geocodeCache[key] = { lat, lng }
              }
            } catch { continue }
          }

          if (!geocodeCache[key]) continue

          cityMap[key] = {
            city: perf.city,
            country: perf.country || '',
            lat: geocodeCache[key].lat,
            lng: geocodeCache[key].lng,
            count: 0,
            venues: [],
            firstShow: perf.started_at || null,
            lastShow: perf.started_at || null,
          }
        }

        cityMap[key].count++
        if (perf.started_at) {
          if (!cityMap[key].firstShow || perf.started_at < cityMap[key].firstShow) {
            cityMap[key].firstShow = perf.started_at
          }
          if (!cityMap[key].lastShow || perf.started_at > cityMap[key].lastShow) {
            cityMap[key].lastShow = perf.started_at
          }
        }
        if (perf.venue_name && !cityMap[key].venues.includes(perf.venue_name)) {
          cityMap[key].venues.push(perf.venue_name)
        }
      }

      const locs = Object.values(cityMap)
      setLocations(locs)
      setStats({
        cities: locs.length,
        countries: new Set(locs.map(l => l.country).filter(Boolean)).size,
        shows: locs.reduce((sum, l) => sum + l.count, 0),
      })
      setLoading(false)
    }
    loadLocations()
  }, [])

  useEffect(() => {
    if (loading || !mapContainer.current || map.current) return
    if (locations.length === 0) return

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [locations[0].lng, locations[0].lat],
      zoom: 3,
      attributionControl: false,
    })

    map.current.on('load', () => {
      if (!map.current) return

      // Override map background to match app
      map.current.setPaintProperty('background', 'background-color', '#0a0908')

      // Add dots for each city
      locations.forEach(loc => {
        const el = document.createElement('div')
        const size = Math.min(8 + loc.count * 2, 24)
        el.style.cssText = `
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          background: #c9a84c;
          border: 2px solid rgba(201,168,76,0.4);
          box-shadow: 0 0 ${size * 2}px rgba(201,168,76,0.4);
          cursor: pointer;
        `

        const popup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          className: 'setlistr-popup',
        }).setHTML(`
          <div style="background:#141210;border:1px solid rgba(201,168,76,0.3);border-radius:10px;padding:12px 16px;font-family:'DM Sans',sans-serif;min-width:160px;">
            <p style="font-size:15px;font-weight:800;color:#f0ece3;margin:0 0 6px;letter-spacing:-0.01em">${loc.city}${loc.country && loc.country !== 'United States' ? `<span style="font-size:11px;color:#8a7a68;font-weight:400;margin-left:6px">${loc.country}</span>` : ''}</p>
            <p style="font-size:22px;font-weight:800;color:#c9a84c;margin:0 0 2px;letter-spacing:-0.02em;line-height:1">${loc.count}<span style="font-size:12px;font-weight:600;color:#8a7a68;margin-left:4px">${loc.count === 1 ? 'show' : 'shows'}</span></p>
            ${loc.firstShow ? `<p style="font-size:11px;color:#8a7a68;margin:0 0 8px">First show ${new Date(loc.firstShow).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</p>` : '<div style="margin-bottom:8px"></div>'}
            <div style="border-top:1px solid rgba(255,255,255,0.07);padding-top:8px">
              ${loc.venues.slice(0, 3).map(v => `<p style="font-size:11px;color:#b8a888;margin:0 0 2px">· ${v}</p>`).join('')}
            </div>
          </div>
        `)

        const marker = new mapboxgl.Marker(el)
          .setLngLat([loc.lng, loc.lat])
          .setPopup(popup)
          .addTo(map.current!)

        el.addEventListener('mouseenter', () => popup.addTo(map.current!))
        el.addEventListener('mouseleave', () => popup.remove())
      })

      // Fit bounds to all locations
      if (locations.length > 1) {
        const bounds = new mapboxgl.LngLatBounds()
        locations.forEach(loc => bounds.extend([loc.lng, loc.lat]))
        map.current.fitBounds(bounds, { padding: 60, maxZoom: 8 })
      }
    })

    return () => { map.current?.remove(); map.current = null }
  }, [loading, locations])

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 20, padding: 0, lineHeight: 1 }}>
          ←
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>Career Map</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Every city you've played</p>
        </div>
      </div>

      {/* Stats row */}
      {!loading && stats.shows > 0 && (
        <div style={{ display: 'flex', gap: 8, padding: '16px 24px 0' }}>
          {[
            { value: stats.shows, label: 'shows' },
            { value: stats.cities, label: 'cities' },
            { value: stats.countries, label: stats.countries === 1 ? 'country' : 'countries' },
          ].map((stat, i) => (
            <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 16px', flex: 1, textAlign: 'center' }}>
              <p style={{ fontSize: 20, fontWeight: 800, color: C.gold, margin: 0, letterSpacing: '-0.02em' }}>{stat.value}</p>
              <p style={{ fontSize: 11, color: C.muted, margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Map */}
      <div style={{ padding: '16px 24px', height: 'calc(100svh - 200px)', minHeight: 400 }}>
        {loading ? (
          <div style={{ height: '100%', background: C.card, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', border: `1.5px solid ${C.gold}`, animation: 'breathe 1.8s ease-in-out infinite' }} />
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Mapping your career...</p>
          </div>
        ) : locations.length === 0 ? (
          <div style={{ height: '100%', background: C.card, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', padding: '0 40px' }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: C.secondary, margin: '0 0 8px' }}>
                No location data yet.
              </p>
              <p style={{ fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.5 }}>
                Make sure to add a city when starting a show. Your map builds automatically from there.
              </p>
            </div>
          </div>
        ) : (
          <div ref={mapContainer} style={{ width: '100%', height: '100%', borderRadius: 16 }} />
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&display=swap');
        @keyframes breathe { 0%,100%{transform:scale(1);opacity:.3} 50%{transform:scale(1.2);opacity:.8} }
        .mapboxgl-ctrl-bottom-left, .mapboxgl-ctrl-bottom-right { display: none !important; }
        .setlistr-popup .mapboxgl-popup-content { background: transparent; padding: 0; box-shadow: none; }
        .setlistr-popup .mapboxgl-popup-tip { display: none; }
        .mapboxgl-canvas { border-radius: 12px !important; }
        .mapboxgl-map { background: #0a0908 !important; border-radius: 12px !important; }
        .mapboxgl-canvas-container { border-radius: 12px !important; overflow: hidden !important; }
      `}</style>
    </div>
  )
}
