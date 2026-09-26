// frontend-react/src/pages/PacmanLobby.tsx
//
// Navigateur de salons Pac-Man. Thème arcade repris de
// backend/pacman/lobby.html (voir pacman.css). Fonctionne au-dessus de
// la couche REST /api/pacman/ (list / create / cancel) ; rejoindre =
// naviguer vers /pacman/:roomName où le WebSocket prend le relais.

import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { api } from "../api/client.ts"
import { useAuth } from "../context/AuthContext.tsx"
import "./pacman.css"

interface PacmanPlayer {
    user: string | null
    role: string
    score: number
    lives: number
    won: boolean
    joined_at: string
}

interface RoomData {
    id: number
    room_name: string
    status: string
    level: number
    map_choice: number
    winner: string | null
    created_by: string
    created_at: string
    players: PacmanPlayer[]
    player_count: number
}

// Même contrainte que _valid_room() / le SlugField du modèle.
const ROOM_RE = /^[A-Za-z0-9_-]{1,100}$/

// Défini au niveau module : si on le mettait dans PacmanLobby, ce serait une
// nouvelle fonction à chaque rendu -> React re-monterait toutes les lignes à
// chaque tick de polling (5 s) et l'affichage « clignoterait ».
function Row({
    room,
    live,
    actions,
}: {
    room: RoomData
    live?: boolean
    actions: React.ReactNode
}) {
    return (
        <div className={live ? "pm-item pm-live" : "pm-item"}>
            <div className="pm-item-main">
                <span className="pm-item-name">{room.room_name}</span>
                <br />
                <span className="pm-item-meta">
                    {room.created_by} · {room.player_count} JOUEUR
                    {room.player_count > 1 ? "S" : ""} · CARTE {room.map_choice}
                    {live && ` · NIV ${room.level}`}
                </span>
            </div>
            {actions}
        </div>
    )
}

export default function PacmanLobby() {
    const { user } = useAuth()
    const navigate = useNavigate()

    const [openRooms, setOpenRooms] = useState<RoomData[]>([])
    const [myRooms, setMyRooms] = useState<RoomData[]>([])
    const [liveRooms, setLiveRooms] = useState<RoomData[]>([])

    const [roomName, setRoomName] = useState("")
    const [mapChoice, setMapChoice] = useState(1)
    const [isSolo, setIsSolo] = useState(false)
    const [error, setError] = useState("")
    const [showCreate, setShowCreate] = useState(false)

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

    useEffect(() => {
        fetchAll()
        pollRef.current = setInterval(fetchAll, 5000)
        return () => {
            if (pollRef.current) clearInterval(pollRef.current)
        }
    }, [])

    async function fetchAll() {
        await Promise.all([
            fetchList("/api/pacman/?status=WAITING", setOpenRooms),
            fetchList("/api/pacman/", setMyRooms),
            fetchList("/api/pacman/?status=IN_PROGRESS", setLiveRooms),
        ])
    }

    async function fetchList(url: string, setter: (r: RoomData[]) => void) {
        try {
            const resp = await api(url)
            if (resp.ok) {
                const data = await resp.json()
                setter(data.results ?? [])
            }
        } catch {
            // silencieux : le prochain tick réessaie
        }
    }

    async function createRoom(e: React.FormEvent) {
        e.preventDefault()
        setError("")

        const name = roomName.trim()
        if (!ROOM_RE.test(name)) {
            setError("NOM INVALIDE : LETTRES, CHIFFRES, - ET _ (1-100)")
            return
        }

        try {
            const resp = await api("/api/pacman/", {
                method: "POST",
                body: JSON.stringify({ room_name: name, map_choice: mapChoice, is_solo: isSolo }),
            })

            if (resp.ok) {
                setShowCreate(false)
                setRoomName("")
                setMapChoice(1)
                setIsSolo(false)
                navigate(`/pacman/${name}`)
            } else {
                const data = await resp.json().catch(() => ({}))
                setError(
                    (data.room_name?.[0] || data.error || "CREATION IMPOSSIBLE").toUpperCase(),
                )
            }
        } catch {
            setError("ERREUR RESEAU")
        }
    }

    function joinRoom(name: string) {
        navigate(`/pacman/${name}`)
    }

    // Bouton "SOLO" direct : crée un salon solo avec un nom aléatoire et y
    // entre tout de suite, sans passer par le formulaire (nom/carte/toggle).
    async function createSoloRoom() {
        setError("")
        const name = "solo-" + Math.random().toString(36).slice(2, 10)

        try {
            const resp = await api("/api/pacman/", {
                method: "POST",
                body: JSON.stringify({ room_name: name, map_choice: 1, is_solo: true }),
            })

            if (resp.ok) {
                navigate(`/pacman/${name}`)
            } else {
                const data = await resp.json().catch(() => ({}))
                setError((data.error || "CREATION IMPOSSIBLE").toUpperCase())
            }
        } catch {
            setError("ERREUR RESEAU")
        }
    }

    async function cancelRoom(id: number) {
        setError("")
        try {
            const resp = await api(`/api/pacman/${id}/cancel/`, { method: "DELETE" })
            if (resp.ok) {
                fetchAll()
            } else {
                const data = await resp.json().catch(() => ({}))
                setError((data.error || "ANNULATION IMPOSSIBLE").toUpperCase())
            }
        } catch {
            setError("ERREUR RESEAU")
        }
    }

    return (
        <div className="pm-root">
            <div className="pm-wrap">
                <div className="pm-header">🎮 PAC-MAN LOBBY</div>

                {error && <div className="pm-alert pm-err">{error}</div>}

                <div className="pm-panel">
                    <div className="pm-panel-title">
                        Salon
                        <button
                            className="pm-btn pm-ghost"
                            style={{ float: "right", marginTop: "-6px" }}
                            onClick={() => setShowCreate((s) => !s)}
                        >
                            {showCreate ? "Fermer" : "+ Nouveau"}
                        </button>
                        <button
                            className="pm-btn pm-ghost"
                            style={{ float: "right", marginTop: "-6px", marginRight: 8 }}
                            onClick={createSoloRoom}
                        >
                            🎮 SOLO
                        </button>
                    </div>

                    {showCreate ? (
                        <form className="pm-form" onSubmit={createRoom}>
                            <input
                                className="pm-input"
                                type="text"
                                value={roomName}
                                onChange={(e) => setRoomName(e.target.value)}
                                placeholder="nom-du-salon"
                                autoFocus
                            />
                            <div className="pm-roles pm-roles-wrap">
                                {[1, 2, 3].map((n) => (
                                    <button
                                        key={n}
                                        type="button"
                                        className={mapChoice === n ? "pm-role active" : "pm-role"}
                                        onClick={() => setMapChoice(n)}
                                    >
                                        🗺️ Carte {n}
                                    </button>
                                ))}
                            </div>
                            <div className="pm-roles pm-roles-wrap">
                                <button
                                    type="button"
                                    className={isSolo ? "pm-role active" : "pm-role"}
                                    onClick={() => setIsSolo(!isSolo)}
                                >
                                    {isSolo ? "👤 SOLO" : "👥 MULTI"}
                                </button>
                            </div>
                            <button className="pm-btn" type="submit">
                                Creer &amp; rejoindre
                            </button>
                        </form>
                    ) : (
                        <p className="pm-empty">
                            Crée un salon ou rejoins-en un ci-dessous.
                        </p>
                    )}
                </div>

                {myRooms.length > 0 && (
                    <div className="pm-panel">
                        <div className="pm-panel-title">Mes salons</div>
                        {myRooms.map((room) => (
                            <Row
                                key={room.id}
                                room={room}
                                live={room.status === "IN_PROGRESS"}
                                actions={
                                    <>
                                        <button
                                            className="pm-btn"
                                            onClick={() => joinRoom(room.room_name)}
                                        >
                                            Rejoindre
                                        </button>
                                        {room.created_by === user?.username && (
                                            <button
                                                className="pm-btn pm-danger"
                                                onClick={() => cancelRoom(room.id)}
                                            >
                                                🗑
                                            </button>
                                        )}
                                    </>
                                }
                            />
                        ))}
                    </div>
                )}

                <div className="pm-panel">
                    <div className="pm-panel-title">Salons ouverts</div>
                    {openRooms.length === 0 && (
                        <p className="pm-empty">Aucun salon ouvert.</p>
                    )}
                    {openRooms.map((room) => (
                        <Row
                            key={room.id}
                            room={room}
                            actions={
                                <>
                                    <button
                                        className="pm-btn"
                                        onClick={() => joinRoom(room.room_name)}
                                    >
                                        Rejoindre
                                    </button>
                                    {room.created_by === user?.username && (
                                        <button
                                            className="pm-btn pm-danger"
                                            onClick={() => cancelRoom(room.id)}
                                        >
                                            🗑
                                        </button>
                                    )}
                                </>
                            }
                        />
                    ))}
                </div>

                <div className="pm-panel">
                    <div className="pm-panel-title">Parties en cours</div>
                    {liveRooms.length === 0 && (
                        <p className="pm-empty">Aucune partie en cours.</p>
                    )}
                    {liveRooms.map((room) => (
                        <Row
                            key={room.id}
                            room={room}
                            live
                            actions={
                                <>
                                    <button
                                        className="pm-btn pm-watch"
                                        onClick={() => joinRoom(room.room_name)}
                                    >
                                        Regarder
                                    </button>
                                    {room.created_by === user?.username && (
                                        <button
                                            className="pm-btn pm-danger"
                                            onClick={() => cancelRoom(room.id)}
                                        >
                                            🗑
                                        </button>
                                    )}
                                </>
                            }
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}
