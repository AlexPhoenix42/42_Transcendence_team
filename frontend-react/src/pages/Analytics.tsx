// frontend-react/src/pages/Analytics.tsx

import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { api } from "../api/client.ts"
import { useI18n } from "../i18n/I18nProvider.tsx"
import {
    LineChart, Line, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer,
} from "recharts"

interface AnalyticsData {
    total_games: number
    win_rate: number
    games_this_week: number
    games_this_month: number
    white_wins: number
    white_total: number
    black_wins: number
    black_total: number
    ai_wins: number
    ai_total: number
    human_wins: number
    human_total: number
    avg_moves: number
    recent_form: string[]
    most_played: { username: string; games: number }[]
    longest_win_streak: number
    current_streak: { type: string; count: number }
    rating_history: { date: string; rating: number; result: string }[]
    daily_results: { date: string; wins: number; losses: number; draws: number }[]
}

export default function Analytics() {
    const { t, tn } = useI18n()
    const navigate = useNavigate()
    const [data, setData] = useState<AnalyticsData | null>(null)
    const [error, setError] = useState("")
    const [dateFrom, setDateFrom] = useState("")
    const [dateTo, setDateTo] = useState("")
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

    const fetchData = useCallback(async () => {
        try {
            let url = "/api/analytics/"
            const params: string[] = []
            if (dateFrom) params.push(`from=${dateFrom}`)
            if (dateTo) params.push(`to=${dateTo}`)
            if (params.length) url += `?${params.join("&")}`

            const resp = await api(url)
            if (resp.ok) {
                setData(await resp.json())
                setLastUpdate(new Date())
                setError("")
            } else {
                setError(t("analytics.error.load"))
            }
        } catch {
            setError(t("common.error.networkShort"))
        }
    }, [dateFrom, dateTo])

    // Initial fetch + auto-refresh every 30s
    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, 30000)
        return () => clearInterval(interval)
    }, [fetchData])

    function exportCSV() {
        if (!data) return
        const lines: string[] = []

        lines.push("Metric,Value")
        lines.push(`Total Games,${data.total_games}`)
        lines.push(`Win Rate,${data.win_rate}%`)
        lines.push(`Games This Week,${data.games_this_week}`)
        lines.push(`Games This Month,${data.games_this_month}`)
        lines.push(`White Wins,${data.white_wins}/${data.white_total}`)
        lines.push(`Black Wins,${data.black_wins}/${data.black_total}`)
        lines.push(`vs Human,${data.human_wins}/${data.human_total}`)
        lines.push(`vs AI,${data.ai_wins}/${data.ai_total}`)
        lines.push(`Avg Moves,${data.avg_moves}`)
        lines.push(`Longest Win Streak,${data.longest_win_streak}`)
        lines.push("")

        if (data.rating_history.length) {
            lines.push("Date,Rating,Result")
            for (const r of data.rating_history) {
                lines.push(`${r.date},${r.rating},${r.result}`)
            }
            lines.push("")
        }

        if (data.daily_results.length) {
            lines.push("Date,Wins,Losses,Draws")
            for (const d of data.daily_results) {
                lines.push(`${d.date},${d.wins},${d.losses},${d.draws}`)
            }
        }

        const blob = new Blob([lines.join("\n")], { type: "text/csv" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = "analytics.csv"
        a.click()
        URL.revokeObjectURL(url)
    }

    if (error) return <p className="text-red-400 text-center mt-10">{error}</p>
    if (!data) return <p className="text-gray-400 text-center mt-10">{t("common.loading")}</p>

    function winRate(wins: number, total: number): string {
        if (total === 0) return "—"
        return `${Math.round((wins / total) * 100)}%`
    }

    function formIcon(result: string) {
        if (result === "win") return <span className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-bold">W</span>
        if (result === "loss") return <span className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center text-white text-xs font-bold">L</span>
        return <span className="w-7 h-7 rounded-full bg-gray-600 flex items-center justify-center text-white text-xs font-bold">D</span>
    }

    function streakLabel(streak: { type: string; count: number }): string {
        if (streak.count === 0) return t("analytics.streak.none")
        const labels: Record<string, string> = { win: t("analytics.streak.win"), loss: t("analytics.streak.loss"), draw: t("analytics.streak.draw") }
        return t("analytics.streak.fmt", { count: streak.count, type: labels[streak.type] || streak.type })
    }

    function streakColor(type: string): string {
        if (type === "win") return "text-green-400"
        if (type === "loss") return "text-red-400"
        return "text-gray-400"
    }

    return (
        <div className="max-w-4xl mx-auto">
            {/* Header with controls */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <h1 className="text-3xl font-bold text-white">{t("analytics.title")}</h1>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={exportCSV}
                        className="px-4 py-2 bg-green-700 text-white rounded hover:bg-green-600 text-sm"
                    >
                        {t("analytics.exportCSV")}
                    </button>
					<button
                        onClick={() => window.print()}
                        className="px-4 py-2 bg-blue-700 text-white rounded hover:bg-blue-600 text-sm print:hidden"
                    >
                        {t("analytics.exportPDF")}
                    </button>
                    <button
                        onClick={() => navigate("/profile")}
                        className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm"
                    >
                        {t("analytics.backToProfile")}
                    </button>
                </div>
            </div>

            {/* Date range filters */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 mb-6">
                <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-gray-400 text-sm">{t("analytics.dateRange")}:</span>
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-1.5 text-sm"
                    />
                    <span className="text-gray-500">→</span>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-1.5 text-sm"
                    />
                    {(dateFrom || dateTo) && (
                        <button
                            onClick={() => { setDateFrom(""); setDateTo("") }}
                            className="text-gray-400 hover:text-white text-sm underline"
                        >
                            {t("analytics.clearFilter")}
                        </button>
                    )}
                    <span className="text-gray-600 text-xs ml-auto">
                        {t("analytics.autoRefresh", { time: lastUpdate.toLocaleTimeString() })}
                    </span>
                </div>
            </div>

            {/* Overview cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-center">
                    <p className="text-3xl font-bold text-white">{data.total_games}</p>
                    <p className="text-gray-400 text-sm">{t("analytics.totalGames")}</p>
                </div>
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-center">
                    <p className="text-3xl font-bold text-blue-400">{data.win_rate}%</p>
                    <p className="text-gray-400 text-sm">{t("analytics.winRate")}</p>
                </div>
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-center">
                    <p className="text-3xl font-bold text-yellow-400">{data.games_this_week}</p>
                    <p className="text-gray-400 text-sm">{t("analytics.thisWeek")}</p>
                </div>
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-center">
                    <p className="text-3xl font-bold text-purple-400">{data.games_this_month}</p>
                    <p className="text-gray-400 text-sm">{t("analytics.thisMonth")}</p>
                </div>
            </div>

            {/* Rating progression chart */}
            {data.rating_history.length > 0 && (
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-5 mb-6">
                    <h2 className="text-lg font-semibold text-white mb-4">{t("analytics.ratingProgression")}</h2>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={data.rating_history}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="date" stroke="#9CA3AF" tick={{ fontSize: 12 }} />
                            <YAxis stroke="#9CA3AF" tick={{ fontSize: 12 }} domain={["dataMin - 50", "dataMax + 50"]} />
                            <Tooltip
                                contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: "8px" }}
                                labelStyle={{ color: "#9CA3AF" }}
                                itemStyle={{ color: "#60A5FA" }}
                            />
                            <Line
                                type="monotone"
                                dataKey="rating"
                                stroke="#60A5FA"
                                strokeWidth={2}
                                dot={{ fill: "#60A5FA", r: 3 }}
                                activeDot={{ r: 5 }}
                                name={t("analytics.rating")}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Daily win/loss bar chart */}
            {data.daily_results.length > 0 && (
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-5 mb-6">
                    <h2 className="text-lg font-semibold text-white mb-4">{t("analytics.dailyResults")}</h2>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={data.daily_results}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="date" stroke="#9CA3AF" tick={{ fontSize: 12 }} />
                            <YAxis stroke="#9CA3AF" tick={{ fontSize: 12 }} allowDecimals={false} />
                            <Tooltip
                                contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: "8px" }}
                                labelStyle={{ color: "#9CA3AF" }}
                            />
                            <Legend />
                            <Bar dataKey="wins" fill="#22C55E" name={t("analytics.wins")} />
                            <Bar dataKey="losses" fill="#EF4444" name={t("analytics.losses")} />
                            <Bar dataKey="draws" fill="#6B7280" name={t("analytics.draws")} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Color performance */}
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-5">
                    <h2 className="text-lg font-semibold text-white mb-4">{t("analytics.byColor")}</h2>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-full bg-white border-2 border-gray-400"></div>
                                <span className="text-gray-300">{t("analytics.white")}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-green-400 font-semibold">{data.white_wins}W</span>
                                <span className="text-gray-500">/</span>
                                <span className="text-gray-400">{tn("analytics.games", data.white_total)}</span>
                                <span className="text-white font-bold w-12 text-end">{winRate(data.white_wins, data.white_total)}</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-full bg-gray-900 border-2 border-gray-500"></div>
                                <span className="text-gray-300">{t("analytics.black")}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-green-400 font-semibold">{data.black_wins}W</span>
                                <span className="text-gray-500">/</span>
                                <span className="text-gray-400">{tn("analytics.games", data.black_total)}</span>
                                <span className="text-white font-bold w-12 text-end">{winRate(data.black_wins, data.black_total)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Opponent type performance */}
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-5">
                    <h2 className="text-lg font-semibold text-white mb-4">{t("analytics.byOpponent")}</h2>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-gray-300">{t("analytics.vsHumans")}</span>
                            <div className="flex items-center gap-3">
                                <span className="text-green-400 font-semibold">{data.human_wins}W</span>
                                <span className="text-gray-500">/</span>
                                <span className="text-gray-400">{tn("analytics.games", data.human_total)}</span>
                                <span className="text-white font-bold w-12 text-end">{winRate(data.human_wins, data.human_total)}</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-gray-300">{t("analytics.vsAI")}</span>
                            <div className="flex items-center gap-3">
                                <span className="text-green-400 font-semibold">{data.ai_wins}W</span>
                                <span className="text-gray-500">/</span>
                                <span className="text-gray-400">{tn("analytics.games", data.ai_total)}</span>
                                <span className="text-white font-bold w-12 text-end">{winRate(data.ai_wins, data.ai_total)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Recent form */}
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-5">
                    <h2 className="text-lg font-semibold text-white mb-4">{t("analytics.last10")}</h2>
                    {data.recent_form.length === 0 ? (
                        <p className="text-gray-400">{t("analytics.noGames")}</p>
                    ) : (
                        <div className="flex gap-2 flex-wrap">
                            {data.recent_form.map((r, i) => (
                                <div key={i}>{formIcon(r)}</div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Streaks & averages */}
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-5">
                    <h2 className="text-lg font-semibold text-white mb-4">{t("analytics.stats")}</h2>
                    <div className="space-y-3">
                        <div className="flex justify-between">
                            <span className="text-gray-400">{t("analytics.avgLength")}</span>
                            <span className="text-white font-semibold">{tn("history.moves", data.avg_moves)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400">{t("analytics.longestStreak")}</span>
                            <span className="text-green-400 font-semibold">{data.longest_win_streak}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400">{t("analytics.currentStreak")}</span>
                            <span className={`font-semibold ${streakColor(data.current_streak.type)}`}>
                                {streakLabel(data.current_streak)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Most played opponents */}
            {data.most_played.length > 0 && (
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-5">
                    <h2 className="text-lg font-semibold text-white mb-4">{t("analytics.mostPlayed")}</h2>
                    <div className="space-y-2">
                        {data.most_played.map((opp) => (
                            <div
                                key={opp.username}
                                onClick={() => navigate(`/profile/${opp.username}`)}
                                className="flex items-center justify-between py-2 px-3 rounded hover:bg-gray-700/50 cursor-pointer"
                            >
                                <span className="text-white font-semibold"><bdi>{opp.username}</bdi></span>
                                <span className="text-gray-400 text-sm">{tn("analytics.games", opp.games)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

