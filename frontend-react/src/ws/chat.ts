// frontend-react/src/ws/chat.ts

export interface ChatMessage {
    id: number
    sender: string
    content: string
    created_at: string
}

export interface ChatError {
    error: string
}

type MessageHandler = (msg: ChatMessage) => void
type ErrorHandler = (err: ChatError) => void
type CloseHandler = (code: number) => void

export class ChatSocket {
    private ws: WebSocket | null = null
    private onMessage: MessageHandler
    private onError: ErrorHandler
    private onClose: CloseHandler
    private roomId: number

    constructor(
        roomId: number,
        onMessage: MessageHandler,
        onError: ErrorHandler,
        onClose: CloseHandler,
    ) {
        this.roomId = roomId
        this.onMessage = onMessage
        this.onError = onError
        this.onClose = onClose
    }

    connect(): void {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
        const url = `${protocol}//${window.location.host}/ws/chat/${this.roomId}/`

        try {
            this.ws = new WebSocket(url)
        } catch {
            this.onError({ error: "Failed to create WebSocket connection" })
            return
        }

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data)
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

