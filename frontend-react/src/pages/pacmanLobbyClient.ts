// frontend-react/src/pages/pacmanLobbyClient.ts
//
// Porté de backend/pacman/src/js/net/LobbyClient.js — la salle d'attente
// par-dessus le socket ws/pacman/<room>/. Chacun s'annonce en boucle
// (`lobby_hello {name, role, ready}`) ; on tient un roster indexé par id de
// joueur (le sien = premier `player_joined`). `lobby_start` → compte à rebours.
//
// Diffs avec l'original : URL relative (proxy nginx) + `?token=` (auth JWT WS,
// cf. config/ws_auth.py), TypeScript.

import { getAccessToken } from "../api/client.ts"

export interface RosterEntry {
    id: string
    name: string
    role: string
    ready: boolean
    self: boolean
}

type Handler = (...args: any[]) => void

const ROLES = [
    "spectator",
    "pacman",
    "madame_pacman",
    "baby",
    "blocker",
    "builder",
    "ghost_pinky",
    "ghost_blinky",
    "ghost_inky",
    "ghost_sue",
] as const

export type PacmanRole = (typeof ROLES)[number]

export class PacmanLobbyClient {
    room: string
    private ws: WebSocket | null = null
    private selfId: string | null = null
    private me = { name: "", role: "spectator" as string, ready: false }
    private roster = new Map<string, { name: string; role: string; ready: boolean }>()
    private handlers: Record<string, Handler[]> = {}
    private helloTimer: ReturnType<typeof setInterval> | null = null
    private closed = false

    constructor(room: string) {
        this.room = room
    }

    on(
        event:
            | "roster"
            | "start"
            | "error"
            | "open"
            | "close"
            | "closed"
            | "roleRejected",
        fn: Handler,
    ): this {
        ;(this.handlers[event] ||= []).push(fn)
        return this
    }

    private emit(event: string, ...args: any[]) {
        ;(this.handlers[event] || []).slice().forEach((fn) => {
            try {
                fn(...args)
            } catch (e) {
                if (event !== "error") this.emit("error", (e as Error)?.message)
            }
        })
    }

    connect() {
        const proto = window.location.protocol === "https:" ? "wss" : "ws"
        const token = getAccessToken()
        const url =
            `${proto}://${window.location.host}/ws/pacman/` +
            `${encodeURIComponent(this.room)}/` +
            (token ? `?token=${encodeURIComponent(token)}` : "")

        try {
            this.ws = new WebSocket(url)
        } catch (e) {
            this.emit("error", `connexion impossible : ${(e as Error)?.message}`)
            return
        }

        this.ws.onopen = () => {
            this.emit("open")
            this.hello()
            this.helloTimer = setInterval(() => this.hello(), 2000)
        }
        this.ws.onclose = (ev) => {
            if (this.helloTimer) clearInterval(this.helloTimer)
            this.emit("close", ev.code)
        }
        this.ws.onerror = () => this.emit("error", "erreur socket")
        this.ws.onmessage = (ev) => {
            let msg: any
            try {
                msg = JSON.parse(ev.data)
            } catch {
                return
            }
            this.route(msg)
        }
    }

    private route(msg: any) {
        switch (msg.type) {
            case "player_joined":
                if (!this.selfId) this.selfId = msg.player_id
                else this.hello()
                break
            case "player_left":
                if (this.roster.delete(msg.player_id)) this.emitRoster()
                break
            case "lobby_hello":
                if (msg.player_id === this.selfId) break
                this.roster.set(msg.player_id, {
                    name: String(msg.name || "Joueur").slice(0, 20),
                    role: msg.role || "spectator",
                    ready: !!msg.ready,
                })
                this.emitRoster()
                break
            case "role_assignment":
                if (msg.player_id === this.selfId) break
                {
                    const cur = this.roster.get(msg.player_id) || {
                        name: msg.metadata?.name || "Joueur",
                        role: "spectator",
                        ready: false,
                    }
                    cur.role = msg.role
                    if (msg.metadata?.name) cur.name = String(msg.metadata.name).slice(0, 20)
                    this.roster.set(msg.player_id, cur)
                    this.emitRoster()
                }
                break
            case "role_rejected":
                // Quelqu'un d'autre a déjà ce personnage : le serveur a refusé,
                // on revient au rôle qu'il nous reconnaît vraiment (souvent
                // "spectator" si on n'en avait pas encore d'autre).
                this.me.role = msg.current_role || "spectator"
                this.emit("roleRejected", this.me.role)
                this.hello()
                this.emitRoster()
                break
            case "lobby_start":
                this.emit("start", typeof msg.countdown === "number" ? msg.countdown : 3)
                break
            case "lobby_closed":
                this.emit("closed")
                break
            default:
                break
        }
    }

    private emitRoster() {
        const list: RosterEntry[] = [
            {
                id: this.selfId || "me",
                name: this.me.name || "Moi",
                role: this.me.role,
                ready: this.me.ready,
                self: true,
            },
        ]
        this.roster.forEach((p, id) =>
            list.push({ id, name: p.name, role: p.role, ready: p.ready, self: false }),
        )
        this.emit("roster", list)
    }

    private send(obj: unknown) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify(obj))
            } catch (e) {
                this.emit("error", `envoi impossible : ${(e as Error)?.message}`)
            }
        }
    }

    private hello() {
        this.send({
            type: "lobby_hello",
            name: this.me.name,
            role: this.me.role,
            ready: this.me.ready,
        })
    }

    setName(name: string) {
        this.me.name = String(name || "").slice(0, 20)
        this.hello()
        this.emitRoster()
    }

    setRole(role: string) {
        this.me.role = role
        // annonce autoritaire côté serveur (le pseudo vient du compte)
        this.send({ type: "role_assignment", role })
        this.hello()
        this.emitRoster()
    }

    setReady(ready: boolean) {
        this.me.ready = !!ready
        this.send({ type: "player_ready", ready: this.me.ready })
        this.hello()
        this.emitRoster()
    }

    start(countdown = 3) {
        this.send({ type: "lobby_start", countdown })
    }

    /** Passe la manche en "en cours" côté serveur (Game -> IN_PROGRESS). */
    beginRound() {
        this.send({ type: "round_start" })
    }

    disconnect() {
        this.closed = true
        if (this.helloTimer) clearInterval(this.helloTimer)
        if (this.ws) {
            this.ws.onclose = null
            this.ws.close()
            this.ws = null
        }
    }

    get isClosed() {
        return this.closed
    }
}

export const PACMAN_ROLES = ROLES
