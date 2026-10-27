// frontend-react/src/pages/MatchHistory.tsx

import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useI18n } from "../i18n/I18nProvider.tsx"
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
    const { t, tn, d } = useI18n()
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
                setError(t("history.error.load"))
            }
        } catch {
            setError(t("common.error.networkShort"))
        }
    }

    function resultBadge(result: string) {
        if (result === "win")
            return <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-900/50 text-green-400">{t("history.result.win")}</span>
        if (result === "loss")
            return <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-900/50 text-red-400">{t("history.result.loss")}</span>
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-gray-700 text-gray-400">{t("history.result.draw")}</span>
    }

    function reasonLabel(reason: string): string {
        const labels: Record<string, string> = {
            CHECKMATE: t("reason.checkmate"),
            RESIGNATION: t("reason.resignation"),
			DISCONNECT: t("chess.reason.disconnect"),
			CANCELLED:  t("chess.reason.cancelled"),
            TIMEOUT: t("reason.timeout"),
            STALEMATE: t("reason.stalemate"),
            REPETITION: t("reason.repetition"),
            "50_MOVES": t("reason.fiftyMoves"),
            INSUFFICIENT_MATERIAL: t("reason.insufficient"),
            DRAW: t("reason.draw"),
            DRAW_REPETITION: t("reason.drawRepetition"),
            DRAW_50_MOVES: t("reason.draw50"),
            DRAW_INSUFFICIENT: t("reason.drawInsufficient"),
        }
		return labels[reason] || t("chess.reason.unknown") || ""
    }

    function formatDate(iso: string): string {
        return d(iso, {
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
                    {isOwnHistory ? t("history.title") : t("history.titleOther", { name: viewingUser ?? "" })}
                </h1>
                <button
                    onClick={() => navigate(-1)}
                    className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
                >
                    {t("common.back")}
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
                    <p className="text-gray-400 text-sm">{t("stats.games")}</p>
                </div>
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-center">
                    <p className="text-2xl font-bold text-green-400">{wins}</p>
                    <p className="text-gray-400 text-sm">{t("stats.wins")}</p>
                </div>
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-center">
                    <p className="text-2xl font-bold text-red-400">{losses}</p>
                    <p className="text-gray-400 text-sm">{t("stats.losses")}</p>
                </div>
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-center">
                    <p className="text-2xl font-bold text-gray-400">{draws}</p>
                    <p className="text-gray-400 text-sm">{t("stats.draws")}</p>
                </div>
            </div>

            {/* Match list */}
			<div className="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
                {matches.length === 0 && (
                    <p className="text-gray-400 text-center py-6">{t("history.empty")}</p>
                )}

                {matches.map((match) => (
                    <div
                        key={match.id}
                        onClick={() => navigate(`/chess/${match.id}`)}
						className="grid grid-cols-[4rem_1fr_2rem_6rem_4rem_8rem] items-center gap-2 px-4 py-3 border-b border-gray-700/50 cursor-pointer hover:bg-gray-700/50 min-w-[600px]"
                    >
					    {/* Result badge */}
                        <div>
                            {resultBadge(match.result)}
                        </div>

                        {/* Opponent */}
                        <div className="flex items-center gap-3 min-w-0">
                            {match.opponent_avatar ? (
                                <img
                                    src={match.opponent_avatar}
                                    alt={match.opponent}
                                    className="w-8 h-8 rounded-full object-cover"
                                />
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                                    {match.opponent[0].toUpperCase()}
                                </div>
                            )}
                            <div className="min-w-0">
                                <span className="text-white text-sm font-semibold truncate block">{match.opponent}</span>
                                {match.player2_is_ai && (
                                    <span className="text-yellow-400 text-xs">{t("history.ai")}</span>
                                )}
                            </div>
                        </div>

                        {/* Color played */}
                        <div className="flex justify-center">
                            <div className={`w-5 h-5 rounded-full border-2 ${
                                match.player_color === "white"
                                    ? "bg-white border-gray-400"
                                    : "bg-gray-900 border-gray-500"
                            }`}></div>
                        </div>

                        {/* Reason */}
                        <div className="text-end">
                            <span className="text-gray-400 text-xs">{reasonLabel(match.result_reason)}</span>
                        </div>

                        {/* Moves */}
                        <div className="text-end">
                            <span className="text-gray-500 text-xs">{tn("history.moves", match.moves_count)}</span>
                        </div>

                        {/* Date */}
                        <div className="text-end">
                            <span className="text-gray-500 text-xs">{formatDate(match.date)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

