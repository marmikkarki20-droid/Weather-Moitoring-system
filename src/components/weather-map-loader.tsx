'use client'
import dynamic from 'next/dynamic'
const WeatherMap = dynamic(() => import('./weather-map').then(module => module.WeatherMap), { ssr: false, loading: () => <div className="h-96 animate-pulse rounded-lg border p-6">Loading map…</div> })
export default function WeatherMapLoader() { return <WeatherMap /> }
