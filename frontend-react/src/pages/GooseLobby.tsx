// frontend-react/src/pages/GooseLobby.tsx

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { api } from "../api/client.ts"
import { useAuth } from "../context/AuthContext.tsx"

interface Player {
    username: string
    position: number
    turn_order: number
}

interface GooseGame {
    id: number
    name: string
    status: string
    min_players: number
    max_players: number
    created_by: string
    player_count: number
    players: Player[]
}

export default function GooseLobby() {
    const { user } = useAuth()
    const navigate = useNavigate()

    const [games, setGames] = useState<GooseGame[]>([])
    const [name, setName] = useState("")
    const [maxPlayers, setMaxPlayers] = useState("4")
    const [error, setError] = useState("")

    useEffect(() => {
        fetchGames()
        const interval = setInterval(fetchGames, 5000)
        return () => clearInterval(interval)
    }, [])

    async function fetchGames() {
        try {
            const resp = await api("/api/goose/")
            if (resp.ok) setGames(await resp.json())
        } catch {}
    }

    async function createGame(e: React.FormEvent) {
        e.preventDefault()
        setError("")
        try {
            const resp = await api("/api/goose/", {
                method: "POST",
                body: JSON.stringify({
                    name: name.trim(),
                    max_players: parseInt(maxPlayers),
                }),
            })
            if (resp.ok) {
                const data = await resp.json()
                navigate(`/goose/${data.id}`)
            } else {
                const data = await resp.json()
                setError(data.error || "Failed to create game")
            }
        } catch {
            setError("Network error")
        }
    }

    async function joinGame(gameId: number) {
        try {
            const resp = await api(`/api/goose/${gameId}/join/`, { method: "POST" })
            if (resp.ok) {
                navigate(`/goose/${gameId}`)
            } else {
                const data = await resp.json()
                setError(data.error || "Failed to join")
            }
        } catch {}
    }

    async function cancelGame(gameId: number) {
        setError("")
        try {
            const resp = await api(`/api/goose/${gameId}/cancel/`, { method: "DELETE" })
            if (resp.ok) {
                fetchGames()
            } else {
                const data = await resp.json().catch(() => ({}))
                setError(data.error || "Failed to delete room")
            }
        } catch {
            setError("Network error")
        }
    }

    return (
        <div className="max-w-3xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-6">Game of the Goose</h1>

            {error && (
                <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-2 rounded mb-4">
                    {error}
                </div>
            )}

            {/* Create game */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-5 mb-6">
                <h2 className="text-lg font-semibold text-white mb-3">Create Game</h2>
                <form onSubmit={createGame} className="flex gap-3 items-end">
                    <div className="flex-1">
                        <label className="text-gray-400 text-sm block mb-1">Game Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="My game"
                            className="w-full px-3 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label className="text-gray-400 text-sm block mb-1">Players</label>
                        <select
                            value={maxPlayers}
                            onChange={(e) => setMaxPlayers(e.target.value)}
                            className="px-3 py-2 bg-gray-900 text-white border border-gray-700 rounded"
                        >
                            {[2, 3, 4, 5, 6].map((n) => (
                                <option key={n} value={n}>{n} players</option>
                            ))}
                        </select>
                    </div>
                    <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        Create
                    </button>
                </form>
            </div>

            {/* Game list */}
            <div className="space-y-3">
                {games.length === 0 && (
                    <p className="text-gray-400 text-center py-8">No games available. Create one!</p>
                )}
                {games.map((game) => {
                    const isInGame = game.players.some((p) => p.username === user?.username)
                    const isFull = game.player_count >= game.max_players

                    return (
                        <div
                            key={game.id}
                            className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex items-center justify-between"
                        >
                            <div>
                                <h3 className="text-white font-semibold">{game.name}</h3>
                                <div className="flex items-center gap-3 mt-1">
                                    <span className="text-gray-400 text-sm">
                                        {game.player_count}/{game.max_players} players
                                    </span>
                                    <span className={`text-xs px-2 py-0.5 rounded ${
                                        game.status === "WAITING"
                                            ? "bg-yellow-900/50 text-yellow-400"
                                            : "bg-green-900/50 text-green-400"
                                    }`}>
                                        {game.status === "WAITING" ? "Waiting" : "In Progress"}
                                    </span>
                                    <span className="text-gray-500 text-xs">
                                        by {game.created_by}
                                    </span>
                                </div>
                                <div className="flex gap-1 mt-2">
                                    {game.players.map((p) => (
                                        <span key={p.username} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                                            {p.username}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {isInGame ? (
                                    <button
                                        onClick={() => navigate(`/goose/${game.id}`)}
                                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                                    >
                                        {game.status === "IN_PROGRESS" ? "Play" : "Open"}
                                    </button>
                                ) : game.status === "WAITING" && !isFull ? (
                                    <button
                                        onClick={() => joinGame(game.id)}
                                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                    >
                                        Join
                                    </button>
                                ) : game.status === "IN_PROGRESS" ? (
                                    <button
                                        onClick={() => navigate(`/goose/${game.id}`)}
                                        className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
                                    >
                                        Watch
                                    </button>
                                ) : null}
                                {game.created_by === user?.username && (
                                    <button
                                        onClick={() => cancelGame(game.id)}
                                        title="Delete room"
                                        className="px-3 py-2 bg-red-900/50 text-red-300 border border-red-700 rounded hover:bg-red-900"
                                    >
                                        🗑
                                    </button>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

