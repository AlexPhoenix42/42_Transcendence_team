// frontend-react/src/pages/GooseGame.tsx

import { useState, useEffect, useRef, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { api } from "../api/client.ts"
import { useAuth } from "../context/AuthContext.tsx"
import { useI18n } from "../i18n/I18nProvider.tsx"
import GooseBoard from "../components/GooseBoard.tsx"
import { wsUrl } from '../ws/utils';

interface PlayerData {
    username: string
    position: number
    turn_order: number
    skip_turns: number
    is_active: boolean
    color: string
}

const PLAYER_TOKENS = ["🐸", "🦊", "🐻", "🐰", "🦉", "🐱"]
const PLAYER_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#a855f7", "#f97316"]

const POLL_INTERVAL = 3000

export default function GooseGame() {
    const { t, ts } = useI18n()
    const { id } = useParams()
    const { user } = useAuth()
    const navigate = useNavigate()

    const [players, setPlayers] = useState<PlayerData[]>([])
    const [currentTurn, setCurrentTurn] = useState<string | null>(null)
    const [gameStatus, setGameStatus] = useState("WAITING")
    const [winner, setWinner] = useState<string | null>(null)
    const [logs, setLogs] = useState<string[]>([])
    const [dice, setDice] = useState<[number, number] | null>(null)
    const [rolling, setRolling] = useState(false)
    const [diceAnim, setDiceAnim] = useState(false)
    const [error, setError] = useState("")
    const [gameInfo, setGameInfo] = useState<{ name: string; created_by: string } | null>(null)
    const [lastMove, setLastMove] = useState<{ player: string; from: number; to: number } | null>(null)
    const [showRules, setShowRules] = useState(false)

    const wsRef = useRef<WebSocket | null>(null)
    const logsEndRef = useRef<HTMLDivElement>(null)

    const isMyTurn = currentTurn === user?.username
    const isPlayer = players.some((p) => p.username === user?.username)

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [logs])

    const applyGameState = useCallback((data: any) => {
        setPlayers(data.players || [])
        setCurrentTurn(data.current_turn)
        setGameStatus(data.status)
        if (data.winner) setWinner(data.winner)
    }, [])

    // Fetch game info
    useEffect(() => {
        async function fetchGame() {
            try {
                const resp = await api(`/api/goose/${id}/`)
                if (resp.ok) {
                    const data = await resp.json()
                    setGameInfo({ name: data.name, created_by: data.created_by })
                    setGameStatus(data.status)

                    if (data.players) {
                        const playerData: PlayerData[] = data.players.map((p: PlayerData, i: number) => ({
                            ...p,
                            color: PLAYER_COLORS[i % PLAYER_COLORS.length],
                        }))
                        setPlayers(playerData)
                    }
                }
            } catch {}
        }
        fetchGame()
    }, [id])

    // WebSocket connection
    useEffect(() => {
        if (!id) return
		if (gameStatus == "FINISHED") return

        //const wsHost = window.location.hostname + ":9000"
        //const ws = new WebSocket(`ws://${wsHost}/ws/goose/${id}/`)
		const ws = new WebSocket(wsUrl(`/ws/goose/${id}/`))

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data)

            if (data.type === "game_state") {
                applyGameState(data)
            }

            if (data.type === "turn_result") {
                setDiceAnim(true)
                setTimeout(() => {
                    setDice([data.die1, data.die2])
                    setDiceAnim(false)
                    setRolling(false)

                    setLastMove({
                        player: data.player,
                        from: data.old_position,
                        to: data.new_position,
                    })

                    setTimeout(() => {
                        setPlayers(data.players || [])
                    }, Math.abs(data.new_position - data.old_position) * 150 + 200)

                    setLogs((prev) => [...prev, data.message])

                    if (data.next_turn) setCurrentTurn(data.next_turn)
                    if (data.game_over && data.winner) {
                        setWinner(data.winner)
                        setGameStatus("FINISHED")
                    }
                }, 600)
            }

            if (data.type === "game_over") {
                setWinner(data.winner)
                setGameStatus("FINISHED")
                setLogs((prev) => [...prev, `🏆 ${data.winner} wins!`])
            }

            if (data.error) {
                setError(ts(data.error))
                setRolling(false)
            }
        }

        ws.onerror = () => setError(t("goose.error.websocket"))
        wsRef.current = ws

        return () => { ws.close() }
    }, [id, applyGameState, gameStatus])

    // Polling fallback
    useEffect(() => {
        if (!id || gameStatus === "FINISHED") return

        const interval = setInterval(() => {
            const ws = wsRef.current
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ action: "get_state" }))
            }
        }, POLL_INTERVAL)

        return () => clearInterval(interval)
    }, [id, gameStatus])

    function rollDice() {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        setRolling(true)
        setError("")
        wsRef.current.send(JSON.stringify({ action: "roll_dice" }))
    }

    async function startGame() {
        try {
            const resp = await api(`/api/goose/${id}/start/`, { method: "POST" })
            if (resp.ok) {
                setGameStatus("IN_PROGRESS")
                wsRef.current?.send(JSON.stringify({ action: "get_state" }))
            } else {
                const data = await resp.json()
                setError(ts(data.error, "goose.error.start"))
            }
        } catch {}
    }

    return (
        <div className="max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">
                        {gameInfo?.name || t("goose.title")}
                    </h1>
                    <p className="text-gray-400 text-sm">
                        {gameStatus === "WAITING" && t("goose.waitingForPlayers")}
                        {gameStatus === "IN_PROGRESS" && currentTurn && (
                            <>
                                {PLAYER_TOKENS[players.find(p => p.username === currentTurn)?.turn_order ?? 0]}{" "}
                                <span className="font-semibold text-white">{currentTurn}</span>'s turn
                            </>
                        )}
                        {gameStatus === "FINISHED" && winner && `🏆 ${winner} wins!`}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowRules(!showRules)}
                        className="px-3 py-1.5 md:px-4 md:py-2 bg-amber-700 text-white rounded hover:bg-amber-600 text-sm"
                    >
                        {showRules ? t("goose.hideRules") : t("goose.showRules")}
                    </button>
					<button
                        onClick={() => window.history.length > 1 ? navigate(-1) : navigate("/goose")}
                        className="px-3 py-1.5 md:px-4 md:py-2 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm"
                    >
                        {t("common.back")}
                    </button>
                </div>
            </div>

            {/* How to Play */}
            {showRules && (
                <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-4 mb-4 text-sm text-gray-300 space-y-2">
                    <h2 className="text-amber-400 font-bold text-base">{t("goose.rules.title")}</h2>
                    <p>
                        {t("goose.rules.intro", { from: 0, to: 63 })}
                    </p>
                    <h3 className="text-amber-400 font-semibold pt-1">{t("goose.rules.specialTitle")}</h3>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                        <li>🪿 <strong className="text-white">{t("square.goose")}</strong> (5, 9, 14, 18, 23, 27, 32, 36, 41, 45, 50, 54, 59) — {t("goose.rules.goose")}</li>
                        <li>🌉 <strong className="text-white">{t("square.bridge")}</strong> (6) — {t("goose.rules.bridge")}</li>
                        <li>🏨 <strong className="text-white">{t("square.inn")}</strong> (19) — {t("goose.rules.inn")}</li>
                        <li>🕳️ <strong className="text-white">{t("square.well")}</strong> (31) — {t("goose.rules.well")}</li>
                        <li>🌀 <strong className="text-white">{t("square.maze")}</strong> (42) — {t("goose.rules.maze")}</li>
                        <li>⛓️ <strong className="text-white">{t("square.prison")}</strong> (52) — {t("goose.rules.prison")}</li>
                        <li>💀 <strong className="text-white">{t("square.death")}</strong> (58) — {t("goose.rules.death")}</li>
                        <li>🏁 <strong className="text-white">{t("square.finish")}</strong> (63) — {t("goose.rules.finish")}</li>
                    </ul>
                </div>
            )}

            {error && (
                <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-2 rounded mb-4 text-sm">
                    {error}
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-4">
                {/* Board */}
                <div className="flex-1">
                    <GooseBoard players={players} lastMove={lastMove} />
                </div>

                {/* Sidebar */}
                <div className="w-full lg:w-72 space-y-4">
                    {/* Players */}
                    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                        <h3 className="text-white font-semibold mb-3 text-sm">{t("goose.players")}</h3>
                        <div className="space-y-2">
                            {players.map((p) => (
                                <div
                                    key={p.username}
                                    className={`flex items-center gap-2 p-2 rounded ${
                                        p.username === currentTurn ? "bg-gray-700 ring-1 ring-blue-500" : ""
                                    }`}
                                >
                                    <span className="text-lg">
                                        {PLAYER_TOKENS[p.turn_order % PLAYER_TOKENS.length]}
                                    </span>
                                    <span
                                        className={`text-sm flex-1 cursor-pointer hover:text-blue-400 ${
                                            p.username === currentTurn ? "text-white font-semibold" : "text-gray-300"
                                        }`}
                                        onClick={() => navigate(`/profile/${p.username}`)}
                                    >
                                        <bdi>{p.username}</bdi>
                                    </span>
                                    <span className="text-xs text-gray-500">sq {p.position}</span>
                                    {p.skip_turns > 0 && (
                                        <span className="text-xs text-red-400">⏸ {p.skip_turns}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Dice & Actions */}
                    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                        {gameStatus === "WAITING" && gameInfo?.created_by === user?.username && (
                            <button
                                onClick={startGame}
                                className="w-full py-2 bg-green-600 text-white rounded hover:bg-green-700 font-semibold mb-3"
                            >
                                {t("goose.startGame")}
                            </button>
                        )}

                        {gameStatus === "WAITING" && gameInfo?.created_by !== user?.username && (
                            <p className="text-gray-400 text-center text-sm">
                                {t("goose.waitingForHost")}
                            </p>
                        )}

                        {gameStatus === "IN_PROGRESS" && (
                            <>
                                {/* Dice display */}
                                <div className="flex justify-center gap-4 mb-3">
                                    <div className={`w-14 h-14 bg-white rounded-xl flex items-center justify-center text-3xl font-bold text-gray-900 shadow-lg ${
                                        diceAnim ? "animate-spin" : ""
                                    }`}>
                                        {diceAnim ? "?" : dice ? dice[0] : "·"}
                                    </div>
                                    <div className={`w-14 h-14 bg-white rounded-xl flex items-center justify-center text-3xl font-bold text-gray-900 shadow-lg ${
                                        diceAnim ? "animate-spin" : ""
                                    }`}>
                                        {diceAnim ? "?" : dice ? dice[1] : "·"}
                                    </div>
                                </div>

                                {isMyTurn && isPlayer && (
                                    <button
                                        onClick={rollDice}
                                        disabled={rolling}
                                        className="w-full py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-bold text-lg disabled:opacity-50 active:scale-95 transition-transform"
                                    >
                                        {rolling ? t("goose.rolling") : t("goose.rollDice")}
                                    </button>
                                )}

                                {!isMyTurn && isPlayer && (
                                    <p className="text-gray-400 text-center text-sm">
                                        Waiting for {PLAYER_TOKENS[players.find(p => p.username === currentTurn)?.turn_order ?? 0]} {currentTurn}...
                                    </p>
                                )}

                                {!isPlayer && (
                                    <p className="text-gray-500 text-center text-sm italic">
                                        👁 Spectating
                                    </p>
                                )}
                            </>
                        )}

                        {gameStatus === "FINISHED" && winner && (
                            <div className="text-center">
                                <p className="text-yellow-400 text-xl font-bold mb-1">🏆 Winner!</p>
                                <p className="text-white text-lg">
                                    {PLAYER_TOKENS[players.find(p => p.username === winner)?.turn_order ?? 0]} {winner}
                                </p>
                                <button
                                    onClick={() => navigate("/goose")}
                                    className="mt-3 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm"
                                >
                                    {t("goose.backToLobby")}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Game Log */}
                    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                        <h3 className="text-white font-semibold mb-2 text-sm">{t("goose.gameLog")}</h3>
                        <div className="h-40 lg:h-48 overflow-y-auto space-y-1">
                            {logs.length === 0 && (
                                <p className="text-gray-500 text-xs">{t("goose.noMoves")}</p>
                            )}
                            {logs.map((log, i) => (
                                <p key={i} className="text-xs text-gray-400">{log}</p>
                            ))}
                            <div ref={logsEndRef} />
                        </div>
                    </div>

                    {/* Legend */}
                    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                        <h3 className="text-white font-semibold mb-2 text-sm">{t("goose.legend")}</h3>
                        <div className="grid grid-cols-2 gap-1 text-xs text-gray-400">
                            <span>🪿 Goose (double)</span>
                            <span>🌉 Bridge (→12)</span>
                            <span>🏨 Inn (skip 1)</span>
                            <span>🕳️ Well (skip 1)</span>
                            <span>🌀 Maze (→30)</span>
                            <span>⛓️ Prison (skip 2)</span>
                            <span>💀 Death (→start)</span>
                            <span>🏁 Finish (63)</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

