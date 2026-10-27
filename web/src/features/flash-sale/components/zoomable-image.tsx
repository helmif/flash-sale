import { useRef, useState, type PointerEvent } from 'react'
import { cn } from '@/lib/utils'

const ZOOM = 2.5
const TAP_TOLERANCE_PX = 10 // a touch that moves further than this is a drag, not a tap

interface ZoomableImageProps {
  src: string
  alt: string
  className?: string
}

/**
 * Mouse: hovering magnifies around the cursor. Touch: tap to zoom in at that point, drag to pan,
 * tap again to zoom out. One CSS transform on the same image, so no extra download or library.
 */
export const ZoomableImage = ({ src, alt, className }: ZoomableImageProps) => {
  const [zoomed, setZoomed] = useState(false)
  const [origin, setOrigin] = useState('50% 50%')
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const focusOn = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - box.left) / box.width) * 100
    const y = ((e.clientY - box.top) / box.height) * 100
    setOrigin(`${x}% ${y}%`)
  }

  const isMouse = (e: PointerEvent) => e.pointerType === 'mouse'

  return (
    <div
      className={cn('size-full overflow-hidden', zoomed ? 'cursor-zoom-out touch-none' : 'cursor-zoom-in')}
      onPointerEnter={(e) => {
        if (!isMouse(e)) return
        focusOn(e)
        setZoomed(true)
      }}
      onPointerLeave={(e) => {
        if (isMouse(e)) setZoomed(false)
      }}
      onPointerMove={(e) => {
        // Mouse follows the cursor; touch pans only while zoomed (touch-none stops page scroll then).
        if (isMouse(e) || zoomed) focusOn(e)
      }}
      onPointerDown={(e) => {
        if (!isMouse(e)) touchStart.current = { x: e.clientX, y: e.clientY }
      }}
      onPointerUp={(e) => {
        const start = touchStart.current
        touchStart.current = null
        if (isMouse(e) || !start) return
        const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y)
        if (moved > TAP_TOLERANCE_PX) return // that was a pan
        focusOn(e)
        setZoomed((z) => !z)
      }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={cn(
          'size-full select-none transition-transform duration-200 ease-out motion-reduce:transition-none',
          className,
        )}
        style={{ transform: `scale(${zoomed ? ZOOM : 1})`, transformOrigin: origin }}
      />
    </div>
  )
}
