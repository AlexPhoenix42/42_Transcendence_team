// frontend-react/src/pages/ChessLobby.tsx

import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useI18n } from "../i18n/I18nProvider.tsx"
import { api } from "../api/client.ts"
import { useAuth } from "../context/AuthContext.tsx"

interface GameData {
    id: number
    player1: string
    player2: string | null
    player2_is_ai: boolean
    ai_difficulty: string | null
    status: string
    timer: string | null
    created_by: string
    created_at: string
}

export default function ChessLobby() {
    const { t, ts } = useI18n()
    const { user } = useAuth()
    const navigate = useNavigate()

    const [openGames, setOpenGames] = useState<GameData[]>([])
    const [myGames, setMyGames] = useState<GameData[]>([])
    const [liveGames, setLiveGames] = useState<GameData[]>([])
    const [error, setError] = useState("")
    const [success, setSuccess] = useState("")

    const [pvpTimer, setPvpTimer] = useState<string>("")
    const [pvpFen, setPvpFen] = useState("")

    const [aiDifficulty, setAiDifficulty] = useState<string>("medium")
    const [aiTimer, setAiTimer] = useState<string>("")
    const [aiFen, setAiFen] = useState("")

    const [showCreate, setShowCreate] = useState(false)

	const [pvpPractice, setPvpPractice] = useState(false)
    const [aiPractice, setAiPractice] = useState(false)

    const waitingIdsRef = useRef<Set<number>>(new Set())

    useEffect(() => {
        fetchAll()
        const interval = setInterval(fetchAll, 5000)
        return () => clearInterval(interval)
    }, [])

    async function fetchAll() {
        await Promise.all([
            fetchOpenGames(),
            fetchMyGames(),
            fetchLiveGames(),
        ])
    }

    async function fetchOpenGames() {
        try {
            const resp = await api("/api/chess/?status=WAITING")
            if (resp.ok) {
                const data = await resp.json()
                const games: GameData[] = data.results

                for (const id of waitingIdsRef.current) {
                    const stillWaiting = games.find((g) => g.id === id)
                    if (!stillWaiting) {
                        waitingIdsRef.current.delete(id)
                        navigate(`/chess/${id}`)
                        return
                    }
                }

                setOpenGames(games)
            }
        } catch {
            // Silent fail
        }
    }

    async function fetchMyGames() {
        try {
            const resp = await api("/api/chess/?status=IN_PROGRESS")
            if (resp.ok) {
                const data = await resp.json()
                setMyGames(data.results)
            }
        } catch {
            // Silent fail
        }
    }

    async function fetchLiveGames() {
        try {
            const resp = await api("/api/chess/?status=LIVE")
            if (resp.ok) {
                const data = await resp.json()
                setLiveGames(data.results)
            }
        } catch {
            // Silent fail
        }
    }

    async function createPvP(e: React.FormEvent) {
        e.preventDefault()
        setError("")
        setSuccess("")

        try {
            const body: Record<string, string> = {}
            if (pvpTimer) body.timer = pvpTimer
            if (pvpFen.trim()) body.fen = pvpFen.trim()
			if (pvpPractice) body.is_practice = "true"

            const resp = await api("/api/chess/", {
                method: "POST",
                body: JSON.stringify(body),
            })

            if (resp.ok) {
                const data = await resp.json()
                setSuccess(t("chessLobby.msg.created"))
                setPvpTimer("")
                setPvpFen("")
                setShowCreate(false)
                waitingIdsRef.current.add(data.id)
                fetchAll()
            } else {
                const data = await resp.json()
                setError(ts(data.error, "chessLobby.error.create"))
            }
        } catch {
            setError(t("common.error.network"))
        }
    }

    async function createAI(e: React.FormEvent) {
        e.preventDefault()
        setError("")
        setSuccess("")

        try {
            const body: Record<string, string> = { ai_difficulty: aiDifficulty }
            if (aiTimer) body.timer = aiTimer
            if (aiFen.trim()) body.fen = aiFen.trim()
			if (pvpPractice) body.is_practice = "true"

            const resp = await api("/api/chess/ai/", {
                method: "POST",
                body: JSON.stringify(body),
            })

            if (resp.ok) {
                const data = await resp.json()
                navigate(`/chess/${data.id}`)
            } else {
                const data = await resp.json()
                setError(ts(data.error, "chessLobby.error.createAI"))
            }
        } catch {
            setError(t("common.error.network"))
        }
    }

    async function joinGame(gameId: number) {
        setError("")

        try {
            const resp = await api(`/api/chess/${gameId}/join/`, {
                method: "POST",
            })

            if (resp.ok) {
                navigate(`/chess/${gameId}`)
            } else {
                const data = await resp.json()
                setError(ts(data.error, "chessLobby.error.join"))
            }
        } catch {
            setError(t("common.error.network"))
        }
    }

    async function cancelGame(gameId: number) {
        setError("")

        try {
            const resp = await api(`/api/chess/${gameId}/cancel/`, {
                method: "DELETE",
            })

            if (resp.ok) {
                waitingIdsRef.current.delete(gameId)
                setSuccess("")
                fetchAll()
            } else {
                const data = await resp.json()
                setError(ts(data.error, "chessLobby.error.cancel"))
            }
        } catch {
            setError(t("common.error.network"))
        }
    }

	async function resignGame(gameId: number) {
        setError("")

        try {
            const resp = await api(`/api/chess/${gameId}/leave/`, {
                method: "POST",
            })

            if (resp.ok) {
                fetchAll()
            } else {
                const data = await resp.json()
                setError(ts(data.error, "chessLobby.error.resign"))
            }
        } catch {
            setError(t("common.error.network"))
        }
    }

    function formatTimer(timer: string | null): string {
        if (!timer) return t("chessLobby.unlimited")
        const parts = timer.split("+")
        return `${parts[0]} min + ${parts[1]} sec`
    }

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold text-white">{t("chessLobby.title")}</h1>
                <button
                    onClick={() => setShowCreate(!showCreate)}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                    {showCreate ? t("chessLobby.close") : t("chessLobby.newGame")}
                </button>
            </div>

            {error && (
                <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-2 rounded mb-4">
                    {error}
                </div>
            )}
            {success && (
                <div className="bg-green-900/50 border border-green-500 text-green-300 px-4 py-2 rounded mb-4">
                    {success}
                </div>
            )}

            {showCreate && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {/* PvP */}
                    <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                        <h2 className="text-lg font-semibold text-white mb-4">{t("chessLobby.vsHuman")}</h2>
                        <form onSubmit={createPvP} className="space-y-3">
                            <div>
                                <label className="text-gray-400 text-sm">{t("chessLobby.timeControl")}</label>
                                <select
                                    value={pvpTimer}
                                    onChange={(e) => setPvpTimer(e.target.value)}
                                    className="w-full px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                                >
                                    <option value="">{t("chessLobby.unlimited")}</option>
                                    <option value="3+2">3 min + 2 sec</option>
                                    <option value="5+0">5 min</option>
                                    <option value="10+5">10 min + 5 sec</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-gray-400 text-sm">{t("chessLobby.customFen")}</label>
                                <input
                                    type="text"
                                    value={pvpFen}
                                    onChange={(e) => setPvpFen(e.target.value)}
                                    placeholder={t("chessLobby.fenPlaceholder")}
                                    className="w-full px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500 text-xs"
                                />
								<label className="flex items-center gap-2 text-gray-400 text-sm">
                                <input
                                    type="checkbox"
                                    checked={pvpPractice}
                                    onChange={(e) => setPvpPractice(e.target.checked)}
                                    className="rounded"
                                />
                                Practice mode (allows undo + FEN changes)
								</label>
                            </div>
                            <button type="submit" className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                                {t("chessLobby.createGame")}
                            </button>
                        </form>
                    </div>

                    {/* AI */}
                    <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                        <h2 className="text-lg font-semibold text-white mb-4">{t("chessLobby.vsAI")}</h2>
                        <form onSubmit={createAI} className="space-y-3">
                            <div>
                                <label className="text-gray-400 text-sm">{t("chessLobby.difficulty")}</label>
                                <select
                                    value={aiDifficulty}
                                    onChange={(e) => setAiDifficulty(e.target.value)}
                                    className="w-full px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                                >
                                    <option value="easy">{t("chessLobby.easy")}</option>
                                    <option value="medium">{t("chessLobby.medium")}</option>
                                    <option value="hard">{t("chessLobby.hard")}</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-gray-400 text-sm">{t("chessLobby.timeControl")}</label>
                                <select
                                    value={aiTimer}
                                    onChange={(e) => setAiTimer(e.target.value)}
                                    className="w-full px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                                >
                                    <option value="">{t("chessLobby.unlimited")}</option>
                                    <option value="3+2">3 min + 2 sec</option>
                                    <option value="5+0">5 min</option>
                                    <option value="10+5">10 min + 5 sec</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-gray-400 text-sm">{t("chessLobby.customFen")}</label>
                                <input
                                    type="text"
                                    value={aiFen}
                                    onChange={(e) => setAiFen(e.target.value)}
                                    placeholder={t("chessLobby.fenPlaceholder")}
                                    className="w-full px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500 text-xs"
                                />
								<label className="flex items-center gap-2 text-gray-400 text-sm">
                                <input
                                    type="checkbox"
                                    checked={pvpPractice}
                                    onChange={(e) => setPvpPractice(e.target.checked)}
                                    className="rounded"
                                />
                                Practice mode (allows undo + FEN changes)
								</label>
                            </div>
                            <button type="submit" className="w-full py-2 bg-green-600 text-white rounded hover:bg-green-700">
                                {t("chessLobby.vsAI")}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {myGames.length > 0 && (
                <div className="mb-6">
                    <h2 className="text-xl font-semibold text-white mb-3">{t("chessLobby.activeGames")}</h2>
                    <div className="space-y-2">
                        {myGames.map((game) => (
                            <div key={game.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700 flex items-center gap-3">
                                <span className="text-white flex-1">
                                    {game.player1} vs {game.player2 || "..."} — {formatTimer(game.timer)}
                                    {game.player2_is_ai && ` (AI ${game.ai_difficulty})`}
                                </span>
                                <button
                                    onClick={() => navigate(`/chess/${game.id}`)}
                                    className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                                >
                                    {t("chessLobby.resume")}
                                </button>
								<button
                                    onClick={() => resignGame(game.id)}
                                    className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                                >
                                    {t("chess.resign")}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="mb-6">
                <h2 className="text-xl font-semibold text-white mb-3">{t("chessLobby.openGames")}</h2>
                <div className="space-y-2">
                    {openGames.length === 0 && (
                        <p className="text-gray-400">{t("chessLobby.noOpenGames")}</p>
                    )}
                    {openGames.map((game) => (
                        <div key={game.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700 flex items-center gap-3">
                            <span className="text-white flex-1">
                                {game.created_by} — {formatTimer(game.timer)}
                            </span>
                            {game.created_by === user?.username ? (
                                <button
                                    onClick={() => cancelGame(game.id)}
                                    className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                                >
                                    {t("common.cancel")}
                                </button>
                            ) : (
                                <button
                                    onClick={() => joinGame(game.id)}
                                    className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                                >
                                    {t("chessLobby.join")}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="mb-6">
                <h2 className="text-xl font-semibold text-white mb-3">{t("chessLobby.liveGames")}</h2>
                <div className="space-y-2">
                    {liveGames.length === 0 && (
                        <p className="text-gray-400">{t("chessLobby.noLiveGames")}</p>
                    )}
                    {liveGames.map((game) => (
                        <div key={game.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700 flex items-center gap-3">
                            <span className="text-white flex-1">
                                {game.player1} vs {game.player2} — {formatTimer(game.timer)}
                            </span>
                            <button
                                onClick={() => navigate(`/chess/${game.id}`)}
                                className="px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 text-sm"
                            >
                                {t("chessLobby.watch")}
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

