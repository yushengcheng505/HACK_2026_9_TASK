import { useEffect, useState } from 'react'

/** agents — граф агентов и их работа, pult — пульт с трассировочной картой и таблицей. */
export type RunMode = 'agents' | 'pult'

/** Разделы консоли без параметров. */
export type ConsoleSection = 'launch' | 'runs' | 'models' | 'prompts' | 'bench'

export type ConsoleRoute = { name: ConsoleSection } | { name: 'run'; id: string; mode?: RunMode }

const SECTIONS: ConsoleSection[] = ['runs', 'models', 'prompts', 'bench']

function parse(hash: string): ConsoleRoute {
  const path = hash.replace(/^#/, '')
  const run = path.match(/^\/run\/([\w-]+)(\/pult)?/)
  if (run) return { name: 'run', id: run[1], mode: run[2] ? 'pult' : 'agents' }
  const section = SECTIONS.find((s) => path.startsWith(`/${s}`))
  return { name: section ?? 'launch' }
}

export function routeHref(route: ConsoleRoute): string {
  if (route.name === 'run') return `#/run/${route.id}${route.mode === 'pult' ? '/pult' : ''}`
  if (route.name === 'launch') return '#/'
  return `#/${route.name}`
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
