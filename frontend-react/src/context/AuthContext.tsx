// frontend-react/src/context/AuthContext.tsx

import { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { api, setAccessToken, clearAccessToken, refreshAccessToken } from "../api/client"
import { useI18n } from "../i18n/I18nProvider.tsx"

interface User {
    id          : number
    username    : string
    email       : string
    avatar      : string | null
	is_staff	: boolean
	role		: string
	language	: string
}

interface LoginResult {
    success         : boolean
    requires2FA?    : boolean
    tmpToken?       : string
    error?          : string
	rawError?		: string
}

interface AuthContextType {
    user                : User | null
    loading             : boolean
    login               : (username: string, password: string) => Promise<LoginResult>
    exchangeOAuthToken  : (loginToken: string) => Promise<LoginResult>
    verify2FA           : (tmpToken: string, code: string) => Promise<LoginResult>
    logout              : () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

// Extract the human-readable error from a DRF error response.
// DRF is inconsistent: some endpoints use "error", some "detail",
// some "non_field_errors" (serializer validation). Try all three.
function extractError(data: any): string {
    return data.detail || data.error || data.non_field_errors?.[0] || ""
}

export function AuthProvider({ children }: { children: ReactNode }) {
    // Safe because main.tsx renders <I18nProvider> ABOVE <App/>, so this
    // provider is always inside the i18n context.
    const { t, ts } = useI18n()
    const [user, setUser]       = useState<User | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        refreshAccessToken()
            .then((ok: boolean) => {
                if (ok) return fetchMe()
            })
            .finally(() => setLoading(false))
    }, [])

    async function fetchMe() {
        try {
            const resp = await api("/api/me/")
            if (resp.ok) {
                const data = await resp.json()
                setUser(data)
            }
        } catch {
            // Network error — user stays null
        }
    }

    async function login(username: string, password: string): Promise<LoginResult> {
        try {
            const resp = await fetch("/api/login/", {
                method      : "POST",
                headers     : { "Content-Type": "application/json" },
                credentials : "include",
                body        : JSON.stringify({ username, password }),
            })

            const data = await resp.json()

			if (!resp.ok) {
				const raw = extractError(data)
				return {
					success: false,
					error: ts(raw) || t("login.error.failed"),   // translated for display; rawError below for needsResend
					rawError: raw,
				}
			}

            if (data.requires_2fa) {
                return { success: false, requires2FA: true, tmpToken: data.tmp_token }
            }

            setAccessToken(data.access)
			localStorage.setItem("has_session", "1")
            await fetchMe()
            return { success: true }
        } catch {
            return { success: false, error: t("common.error.network") }
        }
    }

    async function exchangeOAuthToken(loginToken: string): Promise<LoginResult> {
        try {
            const resp = await fetch("/api/auth/exchange/", {
                method      : "POST",
                headers     : { "Content-Type": "application/json" },
                credentials : "include",
                body        : JSON.stringify({ login_token: loginToken }),
            })

            const data = await resp.json()

            if (!resp.ok) {
				const raw = extractError(data)
				return { success: false, error: ts(raw), rawError: raw }
            }

            if (data.requires_2fa) {
                return { success: false, requires2FA: true, tmpToken: data.tmp_token }
            }

            setAccessToken(data.access)
			localStorage.setItem("has_session", "1")
            await fetchMe()
            return { success: true }
        } catch {
            return { success: false, error: t("common.error.network") }
        }
    }

    async function verify2FA(tmpToken: string, code: string): Promise<LoginResult> {
        try {
            const resp = await fetch("/api/auth/2fa/verify/", {
                method      : "POST",
                headers     : { "Content-Type": "application/json" },
                credentials : "include",
                body        : JSON.stringify({ tmp_token: tmpToken, code }),
            })

            const data = await resp.json()

            if (!resp.ok) {
				const raw = extractError(data)
				return { success: false, error: ts(raw), rawError: raw }
            }

            setAccessToken(data.access)
			localStorage.setItem("has_session", "1")
            await fetchMe()
            return { success: true }
        } catch {
            return { success: false, error: t("common.error.network") }
        }
    }

    async function logout() {
        try {
            await api("/api/auth/logout/", { method: "POST" })
        } catch {
            // Logout failed — clear local state anyway
        }
        clearAccessToken()
        setUser(null)
    }

    return (
        <AuthContext.Provider value={{ user, loading, login, exchangeOAuthToken, verify2FA, logout }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error("useAuth must be used within AuthProvider")
    return ctx
}

