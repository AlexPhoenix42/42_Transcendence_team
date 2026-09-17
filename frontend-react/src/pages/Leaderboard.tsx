// frontend-react/src/pages/Leaderboard.tsx

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { api, mediaUrl } from "../api/client.ts"
import { useAuth } from "../context/AuthContext.tsx"

interface LeaderboardEntry {
    rank: number
    username: string
    dispname: string | null
    rating: number
    wins: number
    loss: number
    draw: number
    avatar: string | null
    is_online: boolean
    role: string
}

export default function Leaderboard() {
    const { user } = useAuth()
    const navigate = useNavigate()

    const [entries, setEntries] = useState<LeaderboardEntry[]>([])
    const [error, setError] = useState("")

    useEffect(() => {
        fetchLeaderboard()
    }, [])

    async function fetchLeaderboard() {
        try {
            const resp = await api("/api/leaderboard/")
            if (resp.ok) {
                const data = await resp.json()
                setEntries(data)
            } else {
                setError("Failed to load leaderboard")
            }
        } catch {
            setError("Network error")
        }
    }

    function rankStyle(rank: number): string {
        if (rank === 1) return "text-yellow-400 font-bold"
        if (rank === 2) return "text-gray-300 font-bold"
        if (rank === 3) return "text-amber-600 font-bold"
        return "text-gray-400"
    }

    function rankIcon(rank: number): string {
        if (rank === 1) return "🥇"
        if (rank === 2) return "🥈"
        if (rank === 3) return "🥉"
        return `#${rank}`
    }

    return (
        <div className="max-w-3xl mx-auto mt-0">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold text-white">Leaderboard</h1>
                <button
                    onClick={() => navigate(-1)}
                    className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
                >
                    Back
                </button>
            </div>

            {error && (
                <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-2 rounded mb-4">
                    {error}
                </div>
            )}

            <div className="overflow-x-auto bg-gray-800 rounded-lg border border-gray-700">
                <div className="min-w-[600px]">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-gray-900 text-gray-400 text-sm font-semibold">
                        <div className="col-span-1">Rank</div>
                        <div className="col-span-4">Player</div>
                        <div className="col-span-2 text-center">Rating</div>
                        <div className="col-span-1 text-center text-green-400">W</div>
                        <div className="col-span-1 text-center text-red-400">L</div>
                        <div className="col-span-1 text-center text-gray-400">D</div>
                        <div className="col-span-2 text-center">Games</div>
                    </div>

                    {entries.length === 0 && (
                        <p className="text-gray-400 text-center py-6">No players yet</p>
                    )}

                    {entries.map((entry) => (
                        <div
                            key={entry.username}
                            onClick={() => navigate(`/profile/${entry.username}`)}
                            className={`grid grid-cols-12 gap-2 px-4 py-3 items-center cursor-pointer hover:bg-gray-700/50 border-t border-gray-700/50 ${
                                entry.username === user?.username ? "bg-blue-900/20" : ""
                            }`}
                        >
                            <div className={`col-span-1 text-lg ${rankStyle(entry.rank)}`}>
                                {rankIcon(entry.rank)}
                            </div>

                            <div className="col-span-4 flex items-center gap-3">
                                <div className="relative">
                                    {entry.avatar ? (
                                        <img
                                            src={mediaUrl(entry.avatar) || undefined}
                                            alt={entry.username}
                                            className="w-8 h-8 rounded-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white text-sm font-bold">
                                            {entry.username[0].toUpperCase()}
                                        </div>
                                    )}
                                    <span className={`absolute -bottom-0.5 -end-0.5 w-3 h-3 rounded-full border-2 border-gray-800 ${
                                        entry.is_online ? "bg-green-500" : "bg-gray-500"
                                    }`}></span>
                                </div>
                                <div>
                                    <span className={`text-sm font-semibold ${
                                        entry.username === user?.username ? "text-blue-400" : "text-white"
                                    }`}>
                                        {entry.dispname || entry.username}
                                    </span>
                                    {entry.dispname && (
                                        <span className="text-gray-500 text-xs ms-1">@<bdi>{entry.username}</bdi></span>
                                    )}
                                    {entry.role === "admin" && (
                                        <span className="ms-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-900/50 text-red-400">Admin</span>
                                    )}
                                    {entry.role === "moderator" && (
                                        <span className="ms-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-900/50 text-yellow-400">Mod</span>
                                    )}
                                </div>
                            </div>

                            <div className="col-span-2 text-center">
                                <span className="text-white font-bold text-lg">{entry.rating}</span>
                            </div>

                            <div className="col-span-1 text-center text-green-400 text-sm">{entry.wins}</div>
                            <div className="col-span-1 text-center text-red-400 text-sm">{entry.loss}</div>
                            <div className="col-span-1 text-center text-gray-400 text-sm">{entry.draw}</div>

                            <div className="col-span-2 text-center text-gray-400 text-sm">
                                {entry.wins + entry.loss + entry.draw}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

