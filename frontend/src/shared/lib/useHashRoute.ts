import { useEffect, useState } from 'react'

export type ConsoleRoute = { name: 'launch' } | { name: 'runs' } | { name: 'run'; id: string }

function parse(hash: string): ConsoleRoute {
  const path = hash.replace(/^#/, '')
  const run = path.match(/^\/run\/([\w-]+)/)
  if (run) return { name: 'run', id: run[1] }
  if (path.startsWith('/runs')) return { name: 'runs' }
  return { name: 'launch' }
}

export function routeHref(route: ConsoleRoute): string {
  if (route.name === 'run') return `#/run/${route.id}`
  if (route.name === 'runs') return '#/runs'
  return '#/'
}

export function navigate(route: ConsoleRoute) {
  window.location.hash = routeHref(route)
}

export function useHashRoute(): ConsoleRoute {
  const [route, setRoute] = useState(() => parse(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
