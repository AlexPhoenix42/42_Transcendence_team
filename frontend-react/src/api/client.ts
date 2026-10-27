// frontend-react/src/api/client.ts

let accessToken: string | null = null
let refreshPromise: Promise<boolean> | null = null

export function setAccessToken(token: string): void {
    accessToken = token
}

export function getAccessToken(): string | null {
    return accessToken
}

export function clearAccessToken(): void {
    accessToken = null
	localStorage.removeItem("has_session")
}

function isTokenExpiringSoon(): boolean {
    if (!accessToken) return true
    try {
        const payload = JSON.parse(atob(accessToken.split(".")[1]))
        const exp = payload.exp * 1000
        // Refresh if expiring within 30 seconds
        return Date.now() > exp - 30000
    } catch {
        return true
    }
}

interface ApiOptions extends RequestInit {
    headers?: Record<string, string>
}

export function mediaUrl(url: string | null | undefined): string | null {
    if (!url) return null
    try {
        const parsed = new URL(url)
        return `${window.location.protocol}//${window.location.host}${parsed.pathname}`
    } catch {
        // Already a relative path
        if (url.startsWith("/")) {
            return `${window.location.protocol}//${window.location.host}${url}`
        }
        return url
    }
}

export async function api(url: string, options: ApiOptions = {}): Promise<Response> {
    // Proactively refresh if token is expiring soon
    if (accessToken && isTokenExpiringSoon()) {
        await refreshAccessToken()
    }

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...options.headers,
    }

    if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`
    }

    try {
        let resp = await fetch(url, { ...options, headers, credentials: "include" })

		if (resp.status === 401 && accessToken) {
			const refreshed = await refreshAccessToken()
			if (refreshed) {
				headers["Authorization"] = `Bearer ${accessToken}`
				resp = await fetch(url, { ...options, headers, credentials: "include" })
			} else {
				if (!window.location.pathname.startsWith("/delete-account")) {
					window.location.href = "/login"
				}
				return resp
			}
		}

        return resp
	} catch {
        // `new Response` rejects any status outside 200-599, so 0 (the
        // classic "network failure" sentinel) throws RangeError before this
        // return statement even completes. 503 is a valid code and makes
        // `resp.ok` false, so callers handle it via their normal !resp.ok
        // path. The header lets future code distinguish a synthetic
        // network-failure response from a real backend 503.
        return new Response(JSON.stringify({ error: "Network error" }), {
            status: 503,
            statusText: "Network Error",
            headers: { "X-Synthetic-Network": "true" },
        })
    }
}

export async function refreshAccessToken(): Promise<boolean> {
	if (!localStorage.getItem("has_session")) return false
    // Prevent multiple simultaneous refresh attempts
    if (refreshPromise) return refreshPromise

    refreshPromise = (async () => {
        try {
            const resp = await fetch("/api/auth/refresh/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Requested-With": "XMLHttpRequest",
                },
                credentials: "include",
            })

			if (resp.status == 401) {
				clearAccessToken()
				return false
			}
            if (!resp.ok) {
                //clearAccessToken()
				// Transient error (503 rate limit, network), dont logout
                return false
            }

            const data = await resp.json()
            accessToken = data.access
			localStorage.setItem("has_session", "1")
            return true
        } catch {
            clearAccessToken()
            return false
        } finally {
            refreshPromise = null
        }
    })()

    return refreshPromise
}

