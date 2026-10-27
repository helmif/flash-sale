import { useEffect, useState } from 'react'
import { getSale, type Sale, type SaleStatus } from '../api'

const POLL_MS = 2_000

/**
 * Live sale status. Polls the server and ticks a local clock corrected by the server's time,
 * so the countdown is right even when the user's clock is off.
 */
export const useSale = () => {
  const [sale, setSale] = useState<Sale>()
  const [clockOffset, setClockOffset] = useState(0) // server time minus local time
  const [connectionLost, setConnectionLost] = useState(false)
  const [now, setNow] = useState(Date.now())

  const refresh = async () => {
    try {
      const next = await getSale()
      setSale(next)
      setClockOffset(Date.parse(next.server_time) - Date.now())
      setConnectionLost(false)
    } catch {
      setConnectionLost(true) // keep showing the last known status; the next poll retries
    }
  }

  useEffect(() => {
    refresh()
    const poll = setInterval(refresh, POLL_MS)
    const tick = setInterval(() => setNow(Date.now()), 250)
    return () => {
      clearInterval(poll)
      clearInterval(tick)
    }
  }, [])

  const serverNow = now + clockOffset
  // Open the button the moment the countdown hits zero instead of waiting for the next poll.
  const status: SaleStatus | undefined =
    sale?.status === 'upcoming' && serverNow >= Date.parse(sale.starts_at) ? 'active' : sale?.status

  return { sale, status, serverNow, connectionLost, refresh }
}
