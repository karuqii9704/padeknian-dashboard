import * as React from "react"

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function langganan(cb: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", cb)
  return () => mql.removeEventListener("change", cb)
}

/** Lebar layar < 768px. Server/hidrasi awal: false. */
export function useIsMobile() {
  return React.useSyncExternalStore(
    langganan,
    () => window.matchMedia(QUERY).matches,
    () => false
  )
}
