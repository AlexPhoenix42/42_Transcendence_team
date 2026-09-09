// frontend-react/src/pages/MatchHistory.tsx

import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { api } from "../api/client.ts"
import { useAuth } from "../context/AuthContext.tsx"

interface MatchEntry {
    id: number
    opponent: string
    opponent_avatar: string | null
    result: "win" | "loss" | "draw"
    result_reason: string
    player_color: "white" | "black"
    moves_count: number
    date: string
    player2_is_ai: boolean
}

export default function MatchHistory() {
    const { user } = useAuth()
    const { username } = useParams()
    const navigate = useNavigate()

    const [matches, setMatches] = useState<MatchEntry[]>([])
    const [error, setError] = useState("")

    const viewingUser = username || user?.username || ""
    const isOwnHistory = !username || username === user?.username

    useEffect(() => {
        fetchHistory()
    }, [username])

    async function fetchHistory() {
        try {
            const url = username
                ? `/api/match-history/${username}/`
                : "/api/match-history/"
            const resp = await api(url)
            if (resp.ok) {
                const data = await resp.json()
                setMatches(data)
            } else {
                setError("Failed to load match history")
            }
        } catch {
            setError("Network error")
        }
    }

    function resultBadge(result: string) {
        if (result === "win")
            return <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-900/50 text-green-400">WIN</span>
        if (result === "loss")
            return <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-900/50 text-red-400">LOSS</span>
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-gray-700 text-gray-400">DRAW</span>
    }

    function reasonLabel(reason: string): string {
        const labels: Record<string, string> = {
            CHECKMATE: "Checkmate",
            RESIGNATION: "Resignation",
            TIMEOUT: "Timeout",
            STALEMATE: "Stalemate",
            REPETITION: "Repetition",
            "50_MOVES": "50-move rule",
            INSUFFICIENT_MATERIAL: "Insufficient material",
            DRAW: "Draw",
            DRAW_REPETITION: "Draw (repetition)",
            DRAW_50_MOVES: "Draw (50-move)",
            DRAW_INSUFFICIENT: "Draw (insufficient material)",
        }
        return labels[reason] || reason || ""
    }

    function formatDate(iso: string): string {
        const d = new Date(iso)
        return d.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        })
    }

    // Stats summary
    const wins = matches.filter((m) => m.result === "win").length
    const losses = matches.filter((m) => m.result === "loss").length
    const draws = matches.filter((m) => m.result === "draw").length

    return (
        <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold text-white">
                    {isOwnHistory ? "Match History" : `${viewingUser}'s Matches`}
                </h1>
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

            {/* Stats summary */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-center">
                    <p className="text-2xl font-bold text-white">{matches.length}</p>
                    <p className="text-gray-400 text-sm">Games</p>
                </div>
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-center">
                    <p className="text-2xl font-bold text-green-400">{wins}</p>
                    <p className="text-gray-400 text-sm">Wins</p>
                </div>
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-center">
                    <p className="text-2xl font-bold text-red-400">{losses}</p>
                    <p className="text-gray-400 text-sm">Losses</p>
                </div>
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-center">
                    <p className="text-2xl font-bold text-gray-400">{draws}</p>
                    <p className="text-gray-400 text-sm">Draws</p>
                </div>
            </div>

            {/* Match list */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                {matches.length === 0 && (
                    <p className="text-gray-400 text-center py-6">No matches played yet</p>
                )}

                {matches.map((match) => (
                    <div
                        key={match.id}
                        onClick={() => navigate(`/chess/${match.id}`)}
                        className="flex items-center gap-4 px-4 py-3 border-b border-gray-700/50 cursor-pointer hover:bg-gray-700/50"
                    >
                        {/* Result badge */}
                        <div className="w-16">
                            {resultBadge(match.result)}
                        </div>

                        {/* Opponent */}
                        <div className="flex items-center gap-3 flex-1">
                            {match.opponent_avatar ? (
                                <img
                                    src={match.opponent_avatar}
                                    alt={match.opponent}
                                    className="w-8 h-8 rounded-full object-cover"
                                />
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white text-sm font-bold">
                                    {match.opponent[0].toUpperCase()}
                                </div>
                            )}
                            <div>
                                <span className="text-white text-sm font-semibold">{match.opponent}</span>
                                {match.player2_is_ai && (
                                    <span className="text-yellow-400 text-xs ml-1">(AI)</span>
                                )}
                            </div>
                        </div>

                        {/* Color played */}
                        <div className="w-8 flex justify-center">
                            <div className={`w-5 h-5 rounded-full border-2 ${
                                match.player_color === "white"
                                    ? "bg-white border-gray-400"
                                    : "bg-gray-900 border-gray-500"
                            }`}></div>
                        </div>

                        {/* Reason */}
                        <div className="w-32 text-right">
                            <span className="text-gray-400 text-xs">{reasonLabel(match.result_reason)}</span>
                        </div>

                        {/* Moves */}
                        <div className="w-16 text-right">
                            <span className="text-gray-500 text-xs">{match.moves_count} moves</span>
                        </div>

                        {/* Date */}
                        <div className="w-36 text-right">
                            <span className="text-gray-500 text-xs">{formatDate(match.date)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

