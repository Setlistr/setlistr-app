'use client'
import { useEffect } from 'react'

export default function CursorEffect() {
  useEffect(() => {
    const cursor = document.getElementById('sl-cursor')
    const ring   = document.getElementById('sl-cursor-ring')
    if (!cursor || !ring) return

    let mx = 0, my = 0, rx = 0, ry = 0
    let frame: number

    const onMove = (e: MouseEvent) => {
      mx = e.clientX
      my = e.clientY
      cursor.style.left = mx + 'px'
      cursor.style.top  = my + 'px'
    }

    const animate = () => {
      rx += (mx - rx) * 0.12
      ry += (my - ry) * 0.12
      ring.style.left = rx + 'px'
      ring.style.top  = ry + 'px'
      frame = requestAnimationFrame(animate)
    }

    document.addEventListener('mousemove', onMove)
    frame = requestAnimationFrame(animate)

    return () => {
      document.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(frame)
    }
  }, [])

  return null
}
