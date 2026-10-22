// frontend-react/src/pages/Status.tsx

import { useState, useEffect, useCallback, useRef } from "react"
import { useI18n } from "../i18n/I18nProvider.tsx"

const POLL_INTERVAL = 15_000

interface ServiceInfo {
    status: "healthy" | "degraded" | "unhealthy"
    kind: string
    critical: boolean
    response_time_ms: number
    error?: string
}

interface HealthData {
    status: "healthy" | "degraded" | "unhealthy"
    timestamp: string
    total_time_ms: number
    services: Record<string, ServiceInfo>
}

const STATUS_CONFIG = {
    healthy:   { dot: "bg-green-500",  badge: "bg-green-500/15 text-green-400", labelKey: "status.ok" },
    degraded:  { dot: "bg-yellow-500", badge: "bg-yellow-500/15 text-yellow-400", labelKey: "status.degraded" },
    unhealthy: { dot: "bg-red-500",    badge: "bg-red-500/15 text-red-400", labelKey: "status.outage" },
} as const

const KIND_ICONS: Record<string, string> = {
    database: "🗄️",
    cache:    "⚡",
    secrets:  "🔐",
    proxy:    "🌐",
    service:  "♟️",
	whiteboard: "🎨",
    email:    "📧",
}

const HISTORY_MAX = 60

export default function Status() {
    const { t, n, d } = useI18n()
    const [data, setData] = useState<HealthData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)
    const [history, setHistory] = useState<string[]>([])
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const fetchHealth = useCallback(async () => {
        try {
            const resp = await fetch("/api/health/")
            const json: HealthData = await resp.json()
            setData(json)
            setError(false)
            setHistory(prev => {
                const next = [...prev, json.status]
                return next.length > HISTORY_MAX ? next.slice(-HISTORY_MAX) : next
            })
        } catch {
            setError(true)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchHealth()
        timerRef.current = setInterval(fetchHealth, POLL_INTERVAL)
        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }, [fetchHealth])

    // Sort services: unhealthy first, then degraded, then healthy
    const sortedServices = data
        ? Object.entries(data.services).sort((a, b) => {
            const order = { unhealthy: 0, degraded: 1, healthy: 2 }
            return (order[a[1].status] ?? 9) - (order[b[1].status] ?? 9)
        })
        : []

    return (
		<div className="min-h-screen bg-gray-900">
			<div className="max-w-2xl mx-auto py-10 px-4">
				<h1 className="text-2xl font-bold text-white mb-1">{t("status.title")}</h1>
				<p className="text-sm text-gray-500 mb-8">
					{data
						? `${Object.keys(data.services).length} services monitored · checked in ${data.total_time_ms} ms`
						: t("status.checking")}
				</p>

				{/* Overall banner */}
				{loading ? (
					<div className="rounded-lg border border-gray-700 bg-gray-800 px-5 py-4 mb-8 flex items-center gap-3">
						<span className="w-2.5 h-2.5 rounded-full bg-gray-500 animate-pulse" />
						<span className="text-gray-400 font-medium">{t("status.loading")}</span>
					</div>
				) : error ? (
					<div className="rounded-lg border border-red-500/40 bg-red-500/10 px-5 py-4 mb-8 flex items-center gap-3">
						<span className="w-2.5 h-2.5 rounded-full bg-red-500" />
						<span className="text-red-400 font-medium">{t("status.unreachable")}</span>
					</div>
				) : data && (
					<div className={`rounded-lg border px-5 py-4 mb-8 flex items-center gap-3
						${data.status === "healthy"   ? "border-green-500/40 bg-green-500/10" : ""}
						${data.status === "degraded"  ? "border-yellow-500/40 bg-yellow-500/10" : ""}
						${data.status === "unhealthy" ? "border-red-500/40 bg-red-500/10" : ""}
					`}>
						<span className={`w-2.5 h-2.5 rounded-full ${STATUS_CONFIG[data.status].dot}`} />
						<span className={`font-medium ${
							data.status === "healthy" ? "text-green-400" :
							data.status === "degraded" ? "text-yellow-400" : "text-red-400"
						}`}>
							{t(STATUS_CONFIG[data.status].labelKey as never)}
						</span>
					</div>
				)}

				{/* Services list */}
				<div className="rounded-lg border border-gray-700 bg-gray-800 divide-y divide-gray-700">
					{sortedServices.map(([name, svc]) => {
						const cfg = STATUS_CONFIG[svc.status]
						return (
							<div key={name} className="flex items-center gap-3 px-5 py-3.5">
								<span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
								<div className="flex-1 min-w-0">
									<div className="text-sm text-white font-medium">
										{KIND_ICONS[svc.kind] ?? "📦"} {name}
									</div>
									<div className="text-xs text-gray-500">
										{svc.kind}{svc.critical ? " · critical" : ""}
										{svc.error ? ` · ${svc.error}` : ""}
									</div>
								</div>
								<span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${cfg.badge}`}>
									{svc.status}
								</span>
								<span className="text-xs text-gray-500 w-14 text-end tabular-nums">
									{svc.response_time_ms} ms
								</span>
							</div>
						)
					})}
				</div>

				{/* History sparkline */}
				{history.length > 1 && (
					<div className="mt-8">
						<p className="text-xs text-gray-500 mb-2">
							Last {t("status.checks", { count: n(history.length) })}
						</p>
						<div className="flex gap-0.5 items-end">
							{history.map((s, i) => (
								<div
									key={i}
									title={s}
									className={`w-1.5 h-5 rounded-sm ${
										s === "healthy"   ? "bg-green-500" :
										s === "degraded"  ? "bg-yellow-500" : "bg-red-500"
									}`}
								/>
							))}
						</div>
					</div>
				)}

				{/* Quick links */}
				<div className="mt-8">
					<h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">{t("status.quickLinks")}</h2>
					<div className="grid grid-cols-3 gap-3">
						<a
							href="/grafana"
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-2 px-4 py-3 rounded-lg border border-gray-700 bg-gray-800 hover:border-blue-500/50 hover:bg-gray-750 transition"
						>
							<span>📊</span>
							<span className="text-sm text-white font-medium">Grafana</span>
						</a>
						<a
							href="/mailpit"
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-2 px-4 py-3 rounded-lg border border-gray-700 bg-gray-800 hover:border-blue-500/50 hover:bg-gray-750 transition"
						>
							<span>📧</span>
							<span className="text-sm text-white font-medium">Mailpit</span>
						</a>
						<a
							href="/docs"
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-2 px-4 py-3 rounded-lg border border-gray-700 bg-gray-800 hover:border-blue-500/50 hover:bg-gray-750 transition"
						>
							<span>📚</span>
							<span className="text-sm text-white font-medium">API Docs</span>
						</a>
					</div>
				</div>

				{/* Footer */}
				<div className="mt-8 pt-4 border-t border-gray-700 flex justify-between items-center">
					<span className="text-xs text-gray-500">
						{data
							? t("status.lastUpdated", { time: d(data.timestamp) })
							: "—"}
					</span>
					<button
						onClick={() => { setLoading(true); fetchHealth() }}
						className="text-xs text-gray-400 border border-gray-700 px-3 py-1 rounded hover:text-white hover:border-gray-500 transition"
					>
						{t("status.refresh")}
					</button>
				</div>
			</div>
		</div>
    )
}

