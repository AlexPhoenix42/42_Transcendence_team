// frontend-react/src/pages/Analytics.tsx

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { api } from "../api/client.ts"

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
}

export default function Analytics() {
    const navigate = useNavigate()
    const [data, setData] = useState<AnalyticsData | null>(null)
    const [error, setError] = useState("")

    useEffect(() => {
        async function fetch() {
            try {
                const resp = await api("/api/analytics/")
                if (resp.ok) {
                    setData(await resp.json())
                } else {
                    setError("Failed to load analytics")
                }
            } catch {
                setError("Network error")
            }
        }
        fetch()
    }, [])

    if (error) return <p className="text-red-400 text-center mt-10">{error}</p>
    if (!data) return <p className="text-gray-400 text-center mt-10">Loading...</p>

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
        if (streak.count === 0) return "No games yet"
        const labels: Record<string, string> = { win: "Win", loss: "Loss", draw: "Draw" }
        return `${streak.count} ${labels[streak.type] || streak.type} streak`
    }

    function streakColor(type: string): string {
        if (type === "win") return "text-green-400"
        if (type === "loss") return "text-red-400"
        return "text-gray-400"
    }

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold text-white">Your Analytics</h1>
                <button
                    onClick={() => navigate("/profile")}
                    className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
                >
                    Back to Profile
                </button>
            </div>

            {/* Overview cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-center">
                    <p className="text-3xl font-bold text-white">{data.total_games}</p>
                    <p className="text-gray-400 text-sm">Total Games</p>
                </div>
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-center">
                    <p className="text-3xl font-bold text-blue-400">{data.win_rate}%</p>
                    <p className="text-gray-400 text-sm">Win Rate</p>
                </div>
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-center">
                    <p className="text-3xl font-bold text-yellow-400">{data.games_this_week}</p>
                    <p className="text-gray-400 text-sm">This Week</p>
                </div>
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-center">
                    <p className="text-3xl font-bold text-purple-400">{data.games_this_month}</p>
                    <p className="text-gray-400 text-sm">This Month</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Color performance */}
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-5">
                    <h2 className="text-lg font-semibold text-white mb-4">Performance by Color</h2>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-full bg-white border-2 border-gray-400"></div>
                                <span className="text-gray-300">White</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-green-400 font-semibold">{data.white_wins}W</span>
                                <span className="text-gray-500">/</span>
                                <span className="text-gray-400">{data.white_total} games</span>
                                <span className="text-white font-bold w-12 text-end">{winRate(data.white_wins, data.white_total)}</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-full bg-gray-900 border-2 border-gray-500"></div>
                                <span className="text-gray-300">Black</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-green-400 font-semibold">{data.black_wins}W</span>
                                <span className="text-gray-500">/</span>
                                <span className="text-gray-400">{data.black_total} games</span>
                                <span className="text-white font-bold w-12 text-end">{winRate(data.black_wins, data.black_total)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Opponent type performance */}
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-5">
                    <h2 className="text-lg font-semibold text-white mb-4">Performance by Opponent</h2>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-gray-300">vs Humans</span>
                            <div className="flex items-center gap-3">
                                <span className="text-green-400 font-semibold">{data.human_wins}W</span>
                                <span className="text-gray-500">/</span>
                                <span className="text-gray-400">{data.human_total} games</span>
                                <span className="text-white font-bold w-12 text-end">{winRate(data.human_wins, data.human_total)}</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-gray-300">vs AI</span>
                            <div className="flex items-center gap-3">
                                <span className="text-green-400 font-semibold">{data.ai_wins}W</span>
                                <span className="text-gray-500">/</span>
                                <span className="text-gray-400">{data.ai_total} games</span>
                                <span className="text-white font-bold w-12 text-end">{winRate(data.ai_wins, data.ai_total)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Recent form */}
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-5">
                    <h2 className="text-lg font-semibold text-white mb-4">Last 10 Games Results</h2>
                    {data.recent_form.length === 0 ? (
                        <p className="text-gray-400">No games played yet</p>
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
                    <h2 className="text-lg font-semibold text-white mb-4">Stats</h2>
                    <div className="space-y-3">
                        <div className="flex justify-between">
                            <span className="text-gray-400">Avg. Game Length</span>
                            <span className="text-white font-semibold">{data.avg_moves} moves</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400">Longest Win Streak</span>
                            <span className="text-green-400 font-semibold">{data.longest_win_streak}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400">Current Streak</span>
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
                    <h2 className="text-lg font-semibold text-white mb-4">Most Played Opponents</h2>
                    <div className="space-y-2">
                        {data.most_played.map((opp) => (
                            <div
                                key={opp.username}
                                onClick={() => navigate(`/profile/${opp.username}`)}
                                className="flex items-center justify-between py-2 px-3 rounded hover:bg-gray-700/50 cursor-pointer"
                            >
                                <span className="text-white font-semibold"><bdi>{opp.username}</bdi></span>
                                <span className="text-gray-400 text-sm">{opp.games} game{opp.games !== 1 ? "s" : ""}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

