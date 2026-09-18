// frontend-react/src/ws/chat.ts

import { wsUrl } from './utils';
import { debug } from '../utils/debug'

export interface ChatMessage {
    id: number
    sender: string
	sender_role?: string
    content: string
    created_at: string
}

export interface ChatError {
    error: string
}

type MessageHandler = (msg: ChatMessage) => void
type ErrorHandler = (err: ChatError) => void
type CloseHandler = (code: number) => void
type TypingHandler = (sender: string) => void
type ReadReceiptHandler = (readAt: string) => void
type GameInviteHandler = (inviteId: string, fromUsername: string) => void
type GameStartedHandler = (gameId: number) => void
type MessageDeletedHandler = (messageId: number) => void

export class ChatSocket {
    private ws: WebSocket | null = null
    private onMessage: MessageHandler
    private onError: ErrorHandler
    private onClose: CloseHandler
    private onTyping: TypingHandler | null
	private onGameInvite: GameInviteHandler | null
	private onGameStarted: GameStartedHandler | null
    private roomId: number

    constructor(
        roomId: number,
        onMessage: MessageHandler,
        onError: ErrorHandler,
        onClose: CloseHandler,
        onTyping: TypingHandler | null = null,
		onReadReceipt: ReadReceiptHandler | null = null,
		onGameInvite: GameInviteHandler | null = null,
		onGameStarted: GameStartedHandler | null = null,
		onMessageDeleted: MessageDeletedHandler | null = null,
    ) {
        this.roomId = roomId
        this.onMessage = onMessage
        this.onError = onError
        this.onClose = onClose
        this.onTyping = onTyping
		this.onReadReceipt = onReadReceipt
		this.onGameInvite = onGameInvite
		this.onGameStarted = onGameStarted
		this.onMessageDeleted = onMessageDeleted
    }

    connect(): void {
        //const wsHost = window.location.hostname + ":9000"
        //const url = `ws://${wsHost}/ws/chat/${this.roomId}/`
		const url = wsUrl(`/ws/chat/${this.roomId}/`)

        try {
            this.ws = new WebSocket(url)
        } catch {
            this.onError({ error: "Failed to create WebSocket connection" })
            return
        }

        //this.ws.onmessage = (event) => {
        //    try {
        //        const data = JSON.parse(event.data)
        //        if (data.type === "typing") {
        //            if (this.onTyping) this.onTyping(data.sender)
        //            return
        //        }
        //        if (data.error) {
        //            this.onError(data)
        //        } else {
        //            this.onMessage(data)
        //        }
        //    } catch {
        //        this.onError({ error: "Failed to parse message" })
        //    }
        //}

		//this.ws.onmessage = (event) => {
        //    try {
        //        const data = JSON.parse(event.data)
        //        debug("WS received:", data)
        //        if (data.type === "typing") {
        //            debug("Typing from:", data.sender, "handler:", !!this.onTyping)
        //            if (this.onTyping) this.onTyping(data.sender)
        //            return
        //        }
        //        if (data.error) {
        //            this.onError(data)
        //        } else {
        //            this.onMessage(data)
        //        }
        //    } catch {
        //        this.onError({ error: "Failed to parse message" })
        //    }
        //}

		this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data)
                debug("WS received:", data)
                if (data.type === "typing") {
                    debug("Typing from:", data.sender, "handler:", !!this.onTyping)
                    if (this.onTyping) this.onTyping(data.sender)
                    return
                }
                if (data.type === "read_receipt") {
                    if (this.onReadReceipt) this.onReadReceipt(data.read_at)
                    return
                }
				if (data.type === "game_invite") {
                    if (this.onGameInvite) this.onGameInvite(data.invite_id, data.from_username)
                    return
                }
				if (data.type === "game_started") {
                    if (this.onGameStarted) this.onGameStarted(data.game_id)
                    return
                }
				if (data.type === "message_deleted") {
                    if (this.onMessageDeleted) this.onMessageDeleted(data.message_id)
                    return
                }
                if (data.error) {
                    this.onError(data)
                } else {
                    this.onMessage(data)
                }
            } catch {
                this.onError({ error: "Failed to parse message" })
            }
        }

        this.ws.onerror = () => {
            this.onError({ error: "WebSocket connection error" })
        }

        this.ws.onclose = (event) => {
            this.onClose(event.code)
        }
    }

    send(content: string): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.onError({ error: "Not connected" })
            return
        }

        this.ws.send(JSON.stringify({ content }))
    }

    sendTyping(): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
        this.ws.send(JSON.stringify({ type: "typing" }))
    }

	sendGameInvite(): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
        this.ws.send(JSON.stringify({ type: "game_invite" }))
    }

    disconnect(): void {
        if (this.ws) {
            this.ws.close()
            this.ws = null
        }
    }

    isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN
    }
}

