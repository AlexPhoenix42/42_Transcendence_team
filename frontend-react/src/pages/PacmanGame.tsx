// frontend-react/src/pages/PacmanGame.tsx
//
// Salon Pac-Man (route /pacman/:roomName), repris de backend/pacman :
//  - phase salle d'attente = lobby.html (joueur/spectateur + personnage avec
//    exclusivité, roster live, "prêt", compte à rebours synchro)
//  - phase jeu = le moteur jsPacman + couche multi (net/MultiplayerGame.js),
//    monté dans un <div>, socket ws/pacman/<room>/.

import { useState, useEffect, useRef, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useAuth } from "../context/AuthContext.tsx"
import { api } from "../api/client.ts"
import { PacmanLobbyClient, type RosterEntry } from "./pacmanLobbyClient.ts"
import "./pacman.css"
import "../pacman/styles.css"

type Phase = "loading" | "join" | "waiting" | "countdown" | "playing"

// Places jouables (hors spectateur & bébé qui naît en jeu). Au-delà : spectateur only.
const MAX_PLAYERS = 6

const CHARACTERS: { role: string; label: string }[] = [
    { role: "pacman", label: "🟡 PAC-MAN" },
    { role: "madame_pacman", label: "💗 MS PAC-MAN" },
    { role: "blocker", label: "🧱 BLOCKER" },
    { role: "builder", label: "👷 BUILDER" },
    { role: "ghost", label: "👻 FANTÔME" },
]

const ROLE_LABEL: Record<string, string> = {
    spectator: "👁️ Spectateur",
    pacman: "🟡 Pac-Man",
    madame_pacman: "💗 Ms Pac-Man",
    baby: "🍼 Bébé",
    blocker: "🧱 Blocker",
    builder: "👷 Builder",
    ghost: "👻 Fantôme",
}

export default function PacmanGame() {
    const { roomName = "" } = useParams<{ roomName: string }>()
    const navigate = useNavigate()
    const { user } = useAuth()

    const [phase, setPhase] = useState<Phase>("loading")
    const [kind, setKind] = useState<"spectator" | "player">("player")
    const [character, setCharacter] = useState("pacman")
    const [roster, setRoster] = useState<RosterEntry[]>([])
    const [error, setError] = useState("")
    const [count, setCount] = useState(0)
    const [full, setFull] = useState(false) // toutes les places jouables prises

    const clientRef = useRef<PacmanLobbyClient | null>(null)
    const cdRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const stageRef = useRef<HTMLDivElement | null>(null)
    const gameRef = useRef<{ onDestroy: () => void } | null>(null)

    const myRole = kind === "spectator" ? "spectator" : character

    // rôles déjà pris par un AUTRE joueur du salon (baby exclu — naît en jeu)
    const takenByOthers = new Set(
        roster.filter((r) => !r.self && r.role !== "spectator").map((r) => r.role),
    )

    const cleanup = useCallback(() => {
        if (cdRef.current) clearInterval(cdRef.current)
        clientRef.current?.disconnect()
        clientRef.current = null
        try {
            gameRef.current?.onDestroy()
        } catch {
            /* moteur déjà démonté */
        }
        gameRef.current = null
    }, [])

    useEffect(() => cleanup, [cleanup])

    // À l'arrivée : selon l'état du salon…
    //  - jeu déjà lancé  -> spectateur direct, pas d'écran "rejoindre"
    //  - salle pleine     -> on ne peut entrer qu'en spectateur
    //  - sinon            -> écran "rejoindre" normal
    useEffect(() => {
        let dead = false
        ;(async () => {
            try {
                const resp = await api(`/api/pacman/room/${encodeURIComponent(roomName)}/`)
                if (dead) return
                if (resp.status === 204) {
                    setPhase("join")
                    return
                }
                const g = await resp.json()
                const playing = (g.players ?? []).filter(
                    (p: { role: string }) => p.role !== "spectator",
                ).length
                if (g.status === "IN_PROGRESS") {
                    setKind("spectator")
                    setPhase("playing")
                } else if (g.status === "WAITING" && playing >= MAX_PLAYERS) {
                    setKind("spectator")
                    setFull(true)
                    setPhase("join")
                } else {
                    setPhase("join")
                }
            } catch {
                if (!dead) setPhase("join")
            }
        })()
        return () => {
            dead = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomName])

    // Monte le moteur jsPacman quand on passe en jeu.
    useEffect(() => {
        if (phase !== "playing" || !stageRef.current || gameRef.current) return
        const el = stageRef.current

        // Aspect natif jsPacman 448:576. On remplit l'espace dispo (largeur ET
        // hauteur du viewport), le moteur (Scaling) garde le ratio.
        const AR = 448 / 576
        const availW = Math.min(window.innerWidth - 24, 820)
        const availH = window.innerHeight - 170
        const w = Math.max(280, Math.min(availW, availH * AR))

        let cancelled = false
        import("../pacman/net/MultiplayerGame.js")
            .then(({ default: MultiplayerGame }) => {
                if (cancelled || !el) return
                gameRef.current = new MultiplayerGame({
                    el,
                    width: w,
                    height: w / AR,
                    position: "relative",
                    room: roomName,
                    role: myRole,
                    playerName: user?.username || "Joueur",
                    autoStart: true,
                })
                ;(window as unknown as { __pacman?: unknown }).__pacman = gameRef.current
            })
            .catch((e) => setError(`MOTEUR : ${String(e?.message || e).toUpperCase()}`))

        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase])

    function startCountdown(seconds: number) {
        setPhase("countdown")
        setCount(seconds)
        if (cdRef.current) clearInterval(cdRef.current)
        cdRef.current = setInterval(() => {
            setCount((c) => {
                if (c <= 1) {
                    if (cdRef.current) clearInterval(cdRef.current)
                    // la manche passe "en cours" côté serveur, puis on lâche le
                    // socket du lobby : le moteur ouvre le sien (une connexion
                    // par onglet, le consumer indexe par connexion).
                    clientRef.current?.beginRound()
                    clientRef.current?.disconnect()
                    clientRef.current = null
                    setPhase("playing")
                    return 0
                }
                return c - 1
            })
        }, 1000)
    }

    function join() {
        setError("")
        const c = new PacmanLobbyClient(roomName)
        clientRef.current = c

        c.on("open", () => {
            c.setName(user?.username || "Joueur")
            c.setRole(myRole)
            setPhase("waiting")
        })
        c.on("roster", (list: RosterEntry[]) => setRoster(list))
        c.on("start", (s: number) => startCountdown(s))
        c.on("closed", () => {
            cleanup()
            navigate("/pacman", { state: { notice: "Salon fermé (inactif 10 min)." } })
        })
        c.on("error", (m: string) => setError((m || "erreur").toUpperCase()))
        c.on("close", (code: number) => {
            if (code === 4001) setError("SESSION EXPIREE — RECONNECTE-TOI")
            else if (phase !== "playing") setError("CONNEXION PERDUE")
        })

        c.connect()
    }

    function leave() {
        cleanup()
        navigate("/pacman")
    }

    function pickRole(next: string) {
        if (next !== "spectator" && next !== character) setCharacter(next)
        const role = next === "spectator" ? "spectator" : next
        clientRef.current?.setRole(role)
    }

    const me = roster.find((r) => r.self)
    const players = roster.filter((r) => r.role !== "spectator")
    const spectators = roster.filter((r) => r.role === "spectator")
    const readyPlayers = players.filter((r) => r.ready)
    const allReady = players.length > 0 && readyPlayers.length === players.length

    // ---------- rendu ----------

    if (phase === "playing") {
        return (
            <div className="pm-root">
                <div className="pm-wrap pm-center">
                    <div className="pm-header">🎮 {roomName}</div>
                    {error && <div className="pm-alert pm-err">{error}</div>}
                    <div ref={stageRef} className="pm-game-stage js-pacman-playground" />
                    <button
                        className="pm-btn pm-ghost"
                        style={{ marginTop: 16 }}
                        onClick={leave}
                    >
                        ❌ Quitter la partie
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="pm-root">
            <div className="pm-wrap">
                <div className="pm-header">🎮 SALON {roomName}</div>

                {error && <div className="pm-alert pm-err">{error}</div>}

                {phase === "loading" && (
                    <p className="pm-empty">Chargement du salon…</p>
                )}

                {phase === "countdown" && (
                    <div className="pm-countdown">{count || "GO"}</div>
                )}

                {phase === "join" && (
                    <div className="pm-panel">
                        <div className="pm-panel-title">Rejoindre</div>
                        <p className="pm-item-meta" style={{ marginBottom: 14 }}>
                            Tu joues en tant que{" "}
                            <span className="pm-item-name">{user?.username || "?"}</span>
                        </p>

                        {full && (
                            <div className="pm-alert pm-err" style={{ fontSize: 10 }}>
                                Toutes les places joueur sont prises — entrée en spectateur uniquement.
                            </div>
                        )}

                        <div className="pm-roles">
                            <button
                                className={kind === "spectator" ? "pm-role active" : "pm-role"}
                                onClick={() => setKind("spectator")}
                            >
                                👁️ Spectateur
                            </button>
                            <button
                                disabled={full}
                                className={
                                    kind === "player"
                                        ? "pm-role active"
                                        : full
                                          ? "pm-role taken"
                                          : "pm-role"
                                }
                                onClick={() => !full && setKind("player")}
                            >
                                🎮 Joueur
                            </button>
                        </div>

                        {kind === "player" && !full && (
                            <>
                                <div className="pm-panel-title" style={{ marginTop: 18 }}>
                                    Personnage
                                </div>
                                <div className="pm-roles pm-roles-wrap">
                                    {CHARACTERS.map((c) => (
                                        <button
                                            key={c.role}
                                            className={
                                                character === c.role ? "pm-role active" : "pm-role"
                                            }
                                            onClick={() => setCharacter(c.role)}
                                        >
                                            {c.label}
                                        </button>
                                    ))}
                                </div>
                                <p className="pm-item-meta" style={{ marginTop: 8 }}>
                                    Le bébé naît en jeu (Pac-Man + Ms Pac-Man).
                                </p>
                            </>
                        )}

                        <div className="pm-form" style={{ marginTop: 18 }}>
                            <button className="pm-btn" onClick={join}>
                                ✓ Rejoindre
                            </button>
                            <button className="pm-btn pm-ghost" onClick={() => navigate("/pacman")}>
                                Retour
                            </button>
                        </div>
                    </div>
                )}

                {(phase === "waiting" || phase === "countdown") && (
                    <>
                        <div className="pm-panel">
                            <div className="pm-panel-title">
                                Mon rôle
                                {me && (
                                    <span
                                        className="pm-item-name"
                                        style={{ float: "right", fontSize: 11 }}
                                    >
                                        {ROLE_LABEL[me.role] || me.role}
                                    </span>
                                )}
                            </div>
                            <div className="pm-roles pm-roles-wrap">
                                <button
                                    className={myRole === "spectator" ? "pm-role active" : "pm-role"}
                                    onClick={() => {
                                        setKind("spectator")
                                        pickRole("spectator")
                                    }}
                                >
                                    👁️ Spectateur
                                </button>
                                {CHARACTERS.map((c) => {
                                    const taken = takenByOthers.has(c.role)
                                    return (
                                        <button
                                            key={c.role}
                                            disabled={taken}
                                            className={
                                                myRole === c.role
                                                    ? "pm-role active"
                                                    : taken
                                                      ? "pm-role taken"
                                                      : "pm-role"
                                            }
                                            onClick={() => {
                                                setKind("player")
                                                pickRole(c.role)
                                            }}
                                        >
                                            {c.label}
                                            {taken && <span className="pm-taken">pris</span>}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="pm-panel">
                            <div className="pm-panel-title">
                                Joueurs
                                <span className="pm-item-name" style={{ float: "right", fontSize: 11 }}>
                                    {readyPlayers.length}/{players.length} prêts
                                </span>
                            </div>
                            {players.length === 0 && (
                                <p className="pm-empty">En attente de joueurs…</p>
                            )}
                            {players.map((p) => (
                                <div className="pm-item" key={p.id}>
                                    <span
                                        className={p.ready ? "pm-dot pm-dot-on" : "pm-dot"}
                                        title={p.ready ? "prêt" : "pas prêt"}
                                    />
                                    <span className="pm-item-main">
                                        <span className="pm-item-name">
                                            {p.name} {p.self && "(toi)"}
                                        </span>
                                        <br />
                                        <span className="pm-item-meta">
                                            {ROLE_LABEL[p.role] || p.role}
                                        </span>
                                    </span>
                                </div>
                            ))}
                        </div>

                        {spectators.length > 0 && (
                            <div className="pm-panel">
                                <div className="pm-panel-title">Spectateurs</div>
                                {spectators.map((s) => (
                                    <div className="pm-item pm-live" key={s.id}>
                                        <span className="pm-item-main">
                                            <span className="pm-item-name">
                                                {s.name} {s.self && "(toi)"}
                                            </span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="pm-panel">
                            <div className="pm-panel-title">Contrôles</div>
                            <div className="pm-form pm-roles-wrap">
                                {me?.role !== "spectator" && (
                                    <button
                                        className={me?.ready ? "pm-btn pm-ghost" : "pm-btn"}
                                        onClick={() => clientRef.current?.setReady(!me?.ready)}
                                        disabled={phase === "countdown"}
                                    >
                                        {me?.ready ? "✗ Pas prêt" : "▶️ Je suis prêt"}
                                    </button>
                                )}
                                <button
                                    className="pm-btn"
                                    disabled={!allReady || phase === "countdown"}
                                    onClick={() => clientRef.current?.start(3)}
                                    title={allReady ? "" : "tous les joueurs doivent être prêts"}
                                >
                                    🚀 Démarrer
                                </button>
                                <button className="pm-btn pm-danger" onClick={leave}>
                                    ❌ Quitter
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
