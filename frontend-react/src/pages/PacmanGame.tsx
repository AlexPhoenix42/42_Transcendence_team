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
import { useI18n } from "../i18n/I18nProvider.tsx"
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
    // 4 fantômes distincts (couleur + comportement d'origine dans
    // makeGhost.ts) au lieu d'un seul rôle "ghost" générique - chacun
    // exclusif comme les autres personnages.
    { role: "ghost_pinky", label: "🌸 PINKY" },
    { role: "ghost_blinky", label: "🔴 BLINKY" },
    { role: "ghost_inky", label: "🔵 INKY" },
    { role: "ghost_sue", label: "🟠 SUE" },
]

const STATIC_ROLE_LABEL: Record<string, string> = {
    pacman: "🟡 Pac-Man",
    madame_pacman: "💗 Ms Pac-Man",
    blocker: "🧱 Blocker",
    builder: "👷 Builder",
    ghost_pinky: "🌸 Pinky",
    ghost_blinky: "🔴 Blinky",
    ghost_inky: "🔵 Inky",
    ghost_sue: "🟠 Sue",
}

export default function PacmanGame() {
    const { roomName = "" } = useParams<{ roomName: string }>()
    const navigate = useNavigate()
    const { user } = useAuth()
    const { t, ts } = useI18n()

    const roleLabel = useCallback(
        (role: string) => {
            if (role === "spectator") return t("pacman.role.spectator")
            if (role === "baby") return t("pacman.role.baby")
            return STATIC_ROLE_LABEL[role] || role
        },
        [t],
    )

    const [phase, setPhase] = useState<Phase>("loading")
    const [kind, setKind] = useState<"spectator" | "player">("player")
    const [character, setCharacter] = useState("pacman")
    const [roster, setRoster] = useState<RosterEntry[]>([])
    const [error, setError] = useState("")
    const [count, setCount] = useState(0)
    const [full, setFull] = useState(false) // toutes les places jouables prises
    const [roomExists, setRoomExists] = useState(false) // ligne Game créée via REST
    const [roomId, setRoomId] = useState<number | null>(null)
    const [mapChoice, setMapChoice] = useState(1)
    const [isCreator, setIsCreator] = useState(false)
    const [isSolo, setIsSolo] = useState(false)

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
                    // salon inexistant : on ne l'invente pas, on propose de le créer
                    setRoomExists(false)
                    setPhase("join")
                    return
                }
                setRoomExists(true)
                const g = await resp.json()
                setRoomId(g.id ?? null)
                setMapChoice(g.map_choice ?? 1)
                setIsSolo(g.is_solo ?? false)
                setIsCreator(g.created_by === user?.username)
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

        // Aspect natif jsPacman = 448:576 (portrait). On prend la plus grande
        // taille qui tient dans la fenêtre (largeur ET hauteur), le moteur
        // (Scaling) garde le ratio de toute façon.
        const AR = 448 / 576
        const pad = 2 * 16 // padding .pm-root
        // navbar + voyant + rangée de boutons + marges : le scroll étant coupé
        // pendant la partie, tout doit tenir dans la fenêtre (boutons compris).
        const chrome = 210
        const availW = window.innerWidth - pad
        const availH = window.innerHeight - chrome
        const w = Math.round(Math.max(260, Math.min(availW, availH * AR, 900)))
        const h = Math.round(w / AR)

        let cancelled = false

		// Preserve high score and settings, clear stale game state (lives: 0)
        try {
            const saved = localStorage.getItem("jsPacman")
            if (saved) {
                const data = JSON.parse(saved)
                localStorage.setItem("jsPacman", JSON.stringify({
                    highScore: data.highScore || 0,
                    soundEnabled: data.soundEnabled ?? true,
                    overlayEnabled: data.overlayEnabled ?? true,
                }))
            }
        } catch { /* ignore */ }

		if (isSolo) {
            // Mode SOLO: charger juste le jeu original
            import("../pacman/Game.ts")
                .then(({ default: PacmanGame }) => {
                    if (cancelled || !el) return
                    gameRef.current = new PacmanGame({
                        el,
                        width: w,
                        height: h,
                        position: "relative",
                        mapChoice,
                    })
                    el.querySelector<HTMLElement>('.game-over')?.style.setProperty('display', 'none')
                })
                .catch(() => setError(t("pacman.error.startFailed")))
        } else {
            // Mode MULTI: charger le jeu multijoueur
            import("../pacman/net/MultiplayerGame.ts")
            .then(({ default: MultiplayerGame }) => {
                if (cancelled || !el) return
                gameRef.current = new MultiplayerGame({
                    el,
                    width: w,
                    height: h,
                    position: "relative",
                    room: roomName,
                    role: myRole,
                    playerName: user?.username || t("pacman.client.defaultName"),
                    mapChoice,
                    autoStart: true,
                    labels: {
                        spectatorBanner:   t("pacman.game.spectatorBanner"),
                        waitingForPlayers: t("pacman.game.waitingForPlayers"),
                        pacmanWins:        t("pacman.game.pacmanWins"),
                        ghostsWin:         t("pacman.game.ghostsWin"),
                        returnHint:        t("pacman.game.returnHint"),
                        youSuffix:         t("pacman.game.youSuffix"),
                        extraLife:         t("pacman.game.extraLife"),
                        defaultPlayerName: t("pacman.game.defaultPlayerName"),
                        role: {
                            pacman:        t("pacman.game.role.pacman"),
                            madame_pacman: t("pacman.game.role.madamePacman"),
                            baby:          t("pacman.game.role.baby"),
                            blocker:       t("pacman.game.role.blocker"),
                            ghost:         t("pacman.game.role.ghost"),
                            builder:       t("pacman.game.role.builder"),
                        },
                    },
                    onReturnToLobby: () => {
                        try {
                            gameRef.current?.onDestroy()
                        } catch {
                            /* moteur déjà démonté */
                        }
                        gameRef.current = null
                        setError("")
                        setRoster([])
                        setCount(0)
                        setPhase("loading")
                        join()
                    },
                })
                ;(window as unknown as { __pacman?: unknown }).__pacman = gameRef.current
                el.querySelector<HTMLElement>('.game-over')?.style.setProperty('display', 'none')
            })
            .catch((e) => setError(t("pacman.error.engineLoad", { msg: String(e?.message || e).toUpperCase() })))
        }

        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase])

    // Pendant la partie : on coupe le scroll de la page. Les flèches et la barre
    // d'espace pilotent le jeu — sinon elles font défiler la fenêtre sous le
    // labyrinthe. Rétabli dès qu'on sort du jeu.
    useEffect(() => {
        if (phase !== "playing" && phase !== "countdown") return

        const SCROLL_KEYS = new Set([
            "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
            " ", "Spacebar", "PageUp", "PageDown", "Home", "End",
        ])
        const blockKeys = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null
            if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return
            if (SCROLL_KEYS.has(e.key)) e.preventDefault()
        }

        const prevBody = document.body.style.overflow
        const prevHtml = document.documentElement.style.overflow
        document.body.style.overflow = "hidden"
        document.documentElement.style.overflow = "hidden"
        window.addEventListener("keydown", blockKeys, { passive: false })

        return () => {
            document.body.style.overflow = prevBody
            document.documentElement.style.overflow = prevHtml
            window.removeEventListener("keydown", blockKeys)
        }
    }, [phase])

    function startCountdown(seconds: number) {
        setPhase("countdown")
        setCount(seconds)
        // les erreurs du salon (personnage pris, prêt refusé...) ne concernent
        // plus la partie qui se lance
        setError("")
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

    async function join() {
        setError("")

        // Salon jamais créé (URL tapée à la main) : on le crée d'abord via REST,
        // sinon le WS refuse (close 4004) et rien n'apparaît dans le lobby.
        if (!roomExists) {
            try {
                const r = await api("/api/pacman/", {
                    method: "POST",
                    body: JSON.stringify({ room_name: roomName }),
                })
                if (!r.ok && r.status !== 400) {
                    setError(t("pacman.error.create"))
                    return
                }
                if (r.ok) {
                    const created = await r.json().catch(() => null)
                    if (created?.id) {
                        setRoomId(created.id)
                        setIsCreator(true)
                    }
                }
                setRoomExists(true)
            } catch {
                setError(t("common.error.network"))
                return
            }
        }

        const c = new PacmanLobbyClient(roomName, t)
        clientRef.current = c

        c.on("open", () => {
            c.setName(user?.username || t("pacman.client.defaultName"))
            c.setRole(myRole)
            setPhase("waiting")
        })
        c.on("roster", (list: RosterEntry[]) => setRoster(list))
        c.on("start", (s: number) => startCountdown(s))
        c.on("closed", () => {
            cleanup()
            navigate("/pacman", { state: { notice: t("pacman.notice.roomClosed") } })
        })
        c.on("error", (m: string) => setError((m ? ts(m, "pacman.error.generic") : t("pacman.error.generic")).toUpperCase()))
        c.on("roleRejected", (currentRole: string) => {
            setError(t("pacman.error.roleTaken"))
            if (currentRole === "spectator") setKind("spectator")
            else {
                setKind("player")
                setCharacter(currentRole)
            }
        })
        c.on("close", (code: number) => {
            if (code === 4001) setError(t("pacman.error.sessionExpired"))
            else if (code === 4004) {
                cleanup()
                navigate("/pacman", { state: { notice: t("pacman.notice.roomNotFound") } })
            } else if (phase !== "playing") setError(t("pacman.error.connectionLost"))
        })

        c.connect()
    }

    // Télécharge le moteur dès l'écran "rejoindre" : si l'onglet date d'avant
    // un rebuild, l'échec (chunk 404) recharge la page ici (cf. main.tsx),
    // pas au lancement - où on reviendrait en spectateur d'une partie en cours.
    useEffect(() => {
        if (phase !== "join") return
        const load = isSolo
            ? import("../pacman/Game.ts")
            : import("../pacman/net/MultiplayerGame.ts")
        load.catch(() => {
            /* rechargement géré par vite:preloadError ; sinon erreur au lancement */
        })
    }, [phase, isSolo])

    // Solo : pas de rôle à choisir ni d'écran d'attente utile (un seul
    // joueur) - on rejoint tout seul dès l'arrivée sur l'écran "rejoindre".
    const autoJoinedRef = useRef(false)
    useEffect(() => {
        if (phase === "join" && isSolo && !full && !autoJoinedRef.current) {
            autoJoinedRef.current = true
            join()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, isSolo, full])

    // Sortie complète -> navigateur de salons.
    function leaveToLobby() {
        cleanup()
        navigate("/pacman")
    }

    // Le créateur supprime son salon (éjecte tout le monde côté serveur).
    async function deleteRoom() {
        if (roomId == null) return
        try {
            await api(`/api/pacman/${roomId}/cancel/`, { method: "DELETE" })
        } catch {
            /* on part quand même */
        }
        cleanup()
        navigate("/pacman", { state: { notice: t("pacman.notice.roomDeleted") } })
    }

    // Quitter la partie -> revient au choix du rôle du MÊME salon (le salon
    // repasse en WAITING côté serveur, on peut re-choisir et rejoindre).
    function leaveGame() {
        if (cdRef.current) clearInterval(cdRef.current)
        try {
            gameRef.current?.onDestroy()
        } catch {
            /* déjà démonté */
        }
        gameRef.current = null
        clientRef.current?.disconnect()
        clientRef.current = null
        setError("")
        setRoster([])
        setCount(0)
        setFull(false)
        setPhase("join")
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
    // un personnage = un seul joueur : sinon la partie ne se lance pas
    const rolesUnique = new Set(players.map((p) => p.role)).size === players.length
    const myRoleTaken = !!me && me.role !== "spectator" && takenByOthers.has(me.role)
    const allReady =
        players.length > 0 && readyPlayers.length === players.length && rolesUnique

    // Lancement AUTO : dès que tous les joueurs sont prêts, un seul client
    // (le 1er du roster, pour éviter les décomptes en double) déclenche
    // `lobby_start` ; le serveur diffuse, tout le monde décompte.
    const autoFiredRef = useRef(false)
    useEffect(() => {
        if (phase !== "waiting") {
            autoFiredRef.current = false
            return
        }
        // 1 seul client déclenche : celui dont l'id de roster est le plus petit
        // (déterministe et identique vu de tous). Le décompte de 3 s côté
        // serveur sert de "délai" pour dé-cocher si besoin.
        const ids = roster.map((r) => r.id).sort((a, b) => a.localeCompare(b))
        const iAmStarter = !!me && ids[0] === me.id && me.id !== "me"
        // lancement refusé par le serveur puis corrigé : pouvoir relancer
        if (!allReady) autoFiredRef.current = false
        if (allReady && iAmStarter && !autoFiredRef.current) {
            autoFiredRef.current = true
            clientRef.current?.start(3)
        }
    }, [allReady, phase, roster, me])

    // Solo : se marque prêt tout seul (un seul joueur, rien à négocier) -
    // combiné à l'auto-lancement ci-dessus, ça enchaîne direct sur la partie.
    useEffect(() => {
        if (phase === "waiting" && isSolo && me && !me.ready) {
            clientRef.current?.setReady(true)
        }
    }, [phase, isSolo, me])

    // Voyant d'état du salon
    const lamp =
        phase === "playing" || phase === "countdown"
            ? { cls: "pm-lamp-green", txt: t("pacman.status.inProgress") }
            : phase === "waiting"
              ? allReady
                  ? { cls: "pm-lamp-green", txt: t("pacman.status.allReady") }
                  : {
                        cls: "pm-lamp-orange",
                        txt: t("pacman.status.waiting", { ready: readyPlayers.length, total: players.length }),
                    }
              : { cls: "pm-lamp-red", txt: t("pacman.status.notConnected") }

    // ---------- rendu ----------

    if (phase === "playing") {
        return (
            <div className="pm-root pm-root-game">
                <div className="pm-wrap pm-center">
                    <div className="pm-lamp-row" style={{ justifyContent: "center" }}>
                        <span className={`pm-lamp ${lamp.cls}`} />
                        <span>
                            {roomName} — {lamp.txt}
                        </span>
                    </div>
                    {error && <div className="pm-alert pm-err">{error}</div>}
                    <div ref={stageRef} className="pm-game-stage js-pacman-playground" />
                    <div className="pm-form pm-center" style={{ justifyContent: "center" }}>
                        <button className="pm-btn pm-quit" onClick={leaveGame}>
                            {t("pacman.changeRole")}
                        </button>
                        <button className="pm-btn pm-ghost pm-quit" onClick={leaveToLobby}>
                            {t("pacman.backToLobby")}
                        </button>
                        {isCreator && (
                            <button className="pm-btn pm-danger pm-quit" onClick={deleteRoom}>
                                {t("pacman.deleteRoom")}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="pm-root">
            <div className="pm-wrap">
                <div className="pm-header">{t("pacman.roomHeader", { room: roomName })}</div>

                <div className="pm-lamp-row">
                    <span className={`pm-lamp ${lamp.cls}`} />
                    <span>{lamp.txt}</span>
                </div>

                {error && <div className="pm-alert pm-err">{error}</div>}

                {phase === "loading" && (
                    <p className="pm-empty">{t("pacman.loadingRoom")}</p>
                )}

                {phase === "countdown" && (
                    <div className="pm-countdown">{count || t("pacman.go")}</div>
                )}

                {phase === "join" && (
                    <div className="pm-panel">
                        <div className="pm-panel-title">{roomExists ? t("pacman.joinRoom") : t("pacman.createRoom")}</div>
                        <p className="pm-item-meta" style={{ marginBottom: 14 }}>
                            {t("pacman.playingAs")}{" "}
                            <span className="pm-item-name">{user?.username || "?"}</span>
                        </p>

                        {full && (
                            <div className="pm-alert pm-err" style={{ fontSize: 10 }}>
                                {t("pacman.roomFull")}
                            </div>
                        )}

                        <div className="pm-roles">
                            <button
                                className={kind === "spectator" ? "pm-role active" : "pm-role"}
                                onClick={() => setKind("spectator")}
                            >
                                {t("pacman.spectator")}
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
                                {t("pacman.player")}
                            </button>
                        </div>

                        {kind === "player" && !full && isSolo && (
                            <p className="pm-item-meta" style={{ marginTop: 18 }}>
                                {t("pacman.soloModeHint")}
                            </p>
                        )}
                        {kind === "player" && !full && !isSolo && (
                            <>
                                <div className="pm-panel-title" style={{ marginTop: 18 }}>
                                    {t("pacman.character")}
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
                                    {t("pacman.babyHint")}
                                </p>
                            </>
                        )}

                        <div className="pm-form" style={{ marginTop: 18 }}>
                            <button className="pm-btn" onClick={join}>
                                {roomExists ? t("pacman.joinButton") : t("pacman.createAndJoinButton")}
                            </button>
                            <button className="pm-btn pm-ghost" onClick={() => navigate("/pacman")}>
                                {t("pacman.back")}
                            </button>
                        </div>
                    </div>
                )}

                {(phase === "waiting" || phase === "countdown") && (
                    <>
                        <div className="pm-panel">
                            <div className="pm-panel-title">
                                {t("pacman.myRole")}
                                {me && (
                                    <span
                                        className="pm-item-name"
                                        style={{ float: "right", fontSize: 11 }}
                                    >
                                        {roleLabel(me.role)}
                                    </span>
                                )}
                            </div>
                            {isSolo ? (
                                <p className="pm-item-meta">
                                    {t("pacman.soloModeHint")}
                                </p>
                            ) : (
                                <div className="pm-roles pm-roles-wrap">
                                    <button
                                        className={myRole === "spectator" ? "pm-role active" : "pm-role"}
                                        onClick={() => {
                                            setKind("spectator")
                                            pickRole("spectator")
                                        }}
                                    >
                                        {t("pacman.spectator")}
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
                                                {taken && <span className="pm-taken">{t("pacman.taken")}</span>}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="pm-panel">
                            <div className="pm-panel-title">
                                {t("pacman.playersHeading")}
                                <span className="pm-item-name" style={{ float: "right", fontSize: 11 }}>
                                    {t("pacman.readyCount", { ready: readyPlayers.length, total: players.length })}
                                </span>
                            </div>
                            {players.length === 0 && (
                                <p className="pm-empty">{t("pacman.waitingForPlayers")}</p>
                            )}
                            {players.map((p) => (
                                <div className="pm-item" key={p.id}>
                                    <span
                                        className={p.ready ? "pm-dot pm-dot-on" : "pm-dot"}
                                        title={p.ready ? t("pacman.ready") : t("pacman.notReady")}
                                    />
                                    <span className="pm-item-main">
                                        <span className="pm-item-name">
                                            {p.name} {p.self && t("pacman.you")}
                                        </span>
                                        <br />
                                        <span className="pm-item-meta">
                                            {roleLabel(p.role)}
                                        </span>
                                    </span>
                                </div>
                            ))}
                        </div>

                        {spectators.length > 0 && (
                            <div className="pm-panel">
                                <div className="pm-panel-title">{t("pacman.spectators")}</div>
                                {spectators.map((s) => (
                                    <div className="pm-item pm-live" key={s.id}>
                                        <span className="pm-item-main">
                                            <span className="pm-item-name">
                                                {s.name} {s.self && t("pacman.you")}
                                            </span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="pm-panel">
                            <div className="pm-panel-title">{t("pacman.controls")}</div>
                            <div className="pm-form pm-roles-wrap">
                                {me?.role !== "spectator" && (
                                    <button
                                        className={me?.ready ? "pm-btn pm-ghost" : "pm-btn"}
                                        onClick={() => clientRef.current?.setReady(!me?.ready)}
                                        disabled={phase === "countdown" || (!me?.ready && myRoleTaken)}
                                        title={myRoleTaken ? t("pacman.roleTakenHint") : ""}
                                    >
                                        {me?.ready ? t("pacman.setNotReady") : t("pacman.setReady")}
                                    </button>
                                )}
                                <button
                                    className="pm-btn"
                                    disabled={!allReady || phase === "countdown"}
                                    onClick={() => clientRef.current?.start(3)}
                                    title={allReady ? "" : t("pacman.startHint")}
                                >
                                    {t("pacman.start")}
                                </button>
                                <button className="pm-btn pm-danger" onClick={leaveToLobby}>
                                    {t("pacman.leave")}
                                </button>
                                {isCreator && (
                                    <button className="pm-btn pm-danger" onClick={deleteRoom}>
                                        {t("pacman.deleteRoom")}
                                    </button>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
