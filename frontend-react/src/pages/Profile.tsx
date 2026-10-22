// frontend-react/src/pages/Profile.tsx

import { useState, useEffect } from "react"
import { useAuth } from "../context/AuthContext.tsx"
import { api, getAccessToken, mediaUrl } from "../api/client.ts"
import { useNavigate } from "react-router-dom"
import { useI18n } from "../i18n/I18nProvider.tsx"
import Achievements from "../components/Achievements.tsx"
import { validateMaxLength, validate2FACode } from '../utils/validate'
import { QRCodeSVG } from "qrcode.react"

interface ProfileData {
    username: string
    email: string
    dispname: string
    bio: string
    avatar: string | null
    rating: number
    wins: number
    loss: number
    draw: number
	role: string
}

export default function Profile() {
    const { t, n, ts } = useI18n()
    const { user } = useAuth()
	const navigate = useNavigate()
    const [profile, setProfile] = useState<ProfileData | null>(null)
    const [editing, setEditing] = useState(false)
    const [dispname, setDispname] = useState("")
    const [bio, setBio] = useState("")
    const [error, setError] = useState("")
    const [success, setSuccess] = useState("")

    // 2FA state
    const [has2FA, setHas2FA] = useState(false)
    const [enabling2FA, setEnabling2FA] = useState(false)
    const [qrUri, setQrUri] = useState("")
    const [totpSecret, setTotpSecret] = useState("")
    const [confirmCode, setConfirmCode] = useState("")
    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
	const [confirming2FA, setConfirming2FA] = useState(false)
    const [disablePassword, setDisablePassword] = useState("")
    const [showDisable, setShowDisable] = useState(false)
	const [disableCode, setDisableCode] = useState("")

	// API Key state
    const [hasApiKey, setHasApiKey] = useState(false)
    const [apiKeyPrefix, setApiKeyPrefix] = useState("")
    const [newApiKey, setNewApiKey] = useState("")

    useEffect(() => {
        fetchProfile()
        check2FAStatus()
		checkApiKeyStatus()
    }, [])

    async function fetchProfile() {
        try {
            const resp = await api("/api/profile/")
            if (resp.ok) {
                const data = await resp.json()
                setProfile(data)
                setDispname(data.dispname || "")
                setBio(data.bio || "")
            }
        } catch {
            setError(t("profile.error.load"))
        }
    }

    async function check2FAStatus() {
        try {
            const resp = await api("/api/auth/2fa/status/")
            if (resp.ok) {
                const data = await resp.json()
                setHas2FA(data.has_2fa)
            }
        } catch {
            // Network error — leave has2FA as false
        }
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault()
        setError("")
        setSuccess("")

		const err = validateMaxLength(dispname, 50, "Display name")
            || validateMaxLength(bio, 500, "Bio")
        if (err) {
            setError(t(err))
            return
        }

        try {
            const resp = await api("/api/profile/", {
                method: "PATCH",
                body: JSON.stringify({ dispname, bio }),
            })

            if (resp.ok) {
                const data = await resp.json()
                setProfile(data)
                setEditing(false)
                setSuccess(t("profile.msg.updated"))
            } else {
                const data = await resp.json()
                setError(ts(data.error, "profile.error.update"))
            }
        } catch {
            setError(t("common.error.network"))
        }
    }

	async function checkApiKeyStatus() {
        try {
            const resp = await api("/api/me/api-key/")
            if (resp.ok) {
                const data = await resp.json()
                setHasApiKey(data.has_key)
                setApiKeyPrefix(data.prefix || "")
            }
        } catch {}
    }

    async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

		const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"]
        if (!allowedTypes.includes(file.type)) {
            setError(t("profile.error.avatarType"))
            return
        }
        if (file.size > 5 * 1024 * 1024) {
            setError(t("profile.error.avatarSize"))
            return
        }

        const formData = new FormData()
        formData.append("avatar", file)

        try {
            const resp = await fetch("/api/profile/", {
                method: "PATCH",
                headers: {
                    "Authorization": `Bearer ${getAccessToken()}`,
                },
                credentials: "include",
                body: formData,
            })

            if (resp.ok) {
                const data = await resp.json()
				if (data.avatar) {
                    data.avatar = data.avatar + (data.avatar.includes('?') ? '&' : '?') + 't=' + Date.now()
                }
                setProfile(data)
                setSuccess(t("profile.msg.avatarUpdated"))
            } else {
                setError(t("profile.error.avatar"))
            }
        } catch {
            setError(t("common.error.network"))
        }
    }

    async function handleEnable2FA() {
        setError("")
        setSuccess("")
        setRecoveryCodes([])

        try {
            const resp = await api("/api/auth/2fa/enable/", { method: "POST" })
            const data = await resp.json()

            if (resp.ok) {
                setQrUri(data.provisioning_uri)
                setTotpSecret(data.secret)
                setEnabling2FA(true)
            } else {
                setError(ts(data.error, "profile.2fa.error.enable"))
            }
        } catch {
            setError(t("common.error.network"))
        }
    }

    async function handleConfirm2FA(e: React.FormEvent) {
        e.preventDefault()
        setError("")
		setConfirming2FA(true)

		const err = validate2FACode(confirmCode)
        if (err) {
            setError(t(err))
			setConfirming2FA(true)
            return
        }

        try {
            const resp = await api("/api/auth/2fa/confirm-enable/", {
                method: "POST",
                body: JSON.stringify({ code: confirmCode }),
            })

            const data = await resp.json()

			if (resp.ok) {
                setHas2FA(true)
                setEnabling2FA(false)
                setQrUri("")
                setTotpSecret("")
                setConfirmCode("")
                setRecoveryCodes(data.recovery_codes || [])
                setError("")
                setSuccess("2FA enabled successfully!")
            } else {
                setError(ts(data.error, "twofa.error.invalidCode"))
            }
        } catch {
            setError(t("common.error.network"))
        } finally {
            setConfirming2FA(false)
        }
    }

    async function handleDisable2FA(e: React.FormEvent) {
        e.preventDefault()
        setError("")

        if (!disablePassword && !disableCode) {
            setError(t("profile.2fa.error.needCredential"))
            return
        }

        try {
            const body: Record<string, string> = {}
            if (disablePassword) body.password = disablePassword
            if (disableCode) body.code = disableCode

            const resp = await api("/api/auth/2fa/disable/", {
                method: "POST",
                body: JSON.stringify(body),
            })

            if (resp.ok) {
                setHas2FA(false)
                setShowDisable(false)
                setDisablePassword("")
                setDisableCode("")
                setSuccess("2FA disabled")
            } else {
                const data = await resp.json()
                setError(ts(data.error))
            }
        } catch {
            setError(t("common.error.network"))
        }
    }

    if (!profile) {
        return <p className="text-gray-400">{t("profile.loading")}</p>
    }

    return (
        <div className="max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-6">{t("profile.title")}</h1>

            {success && (
                <div className="bg-green-900/50 border border-green-500 text-green-300 px-4 py-2 rounded mb-4">
                    {success}
                </div>
            )}
            {error && (
                <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-2 rounded mb-4">
                    {error}
                </div>
            )}

            {/* Recovery codes display */}
            {recoveryCodes.length > 0 && (
                <div className="bg-yellow-900/50 border border-yellow-500 text-yellow-300 px-4 py-4 rounded mb-4">
                    <p className="font-bold mb-2">{t("profile.2fa.recoveryWarning")}</p>
                    <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                        {recoveryCodes.map((code, i) => (
                            <span key={i} className="bg-gray-900 px-2 py-1 rounded">{code}</span>
                        ))}
                    </div>
                </div>
            )}

            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div className="flex items-center gap-4 mb-6">
                    <label className="cursor-pointer group relative">
                        <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center text-2xl text-white overflow-hidden">
                            {profile.avatar
								? <img src={mediaUrl(profile.avatar) || undefined} className="w-16 h-16 rounded-full object-cover" />
                                : profile.username[0].toUpperCase()
                            }
                        </div>
                        <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                            <span className="text-white text-xs">{t("profile.change")}</span>
                        </div>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarUpload}
                            className="hidden"
                        />
                    </label>
					<div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl text-white font-semibold"><bdi>{profile.username}</bdi></h2>
                            {profile.role === "admin" && (
                                <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-900/50 text-red-400">{t("role.admin")}</span>
                            )}
                            {profile.role === "moderator" && (
                                <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-900/50 text-yellow-400">{t("role.mod")}</span>
                            )}
                        </div>
                        <p className="text-gray-400">{profile.email}</p>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-6 text-center">
                    <div className="bg-gray-900 rounded p-3">
                        <p className="text-2xl font-bold text-green-400">{n(profile.wins)}</p>
                        <p className="text-gray-400 text-sm">{t("stats.wins")}</p>
                    </div>
                    <div className="bg-gray-900 rounded p-3">
                        <p className="text-2xl font-bold text-red-400">{n(profile.loss)}</p>
                        <p className="text-gray-400 text-sm">{t("stats.losses")}</p>
                    </div>
                    <div className="bg-gray-900 rounded p-3">
                        <p className="text-2xl font-bold text-gray-400">{profile.draw}</p>
                        <p className="text-gray-400 text-sm">{t("stats.draws")}</p>
                    </div>
                </div>

                <div className="mb-4">
                    <p className="text-gray-400 text-sm">{t("stats.rating")}</p>
                    <p className="text-white text-lg font-semibold">{n(profile.rating, { useGrouping: false })}</p>
                </div>

				<button
                    onClick={() => navigate("/history")}
                    className="mb-4 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm w-full"
                >
                    {t("profile.viewHistory")}
                </button>

				<button
                    onClick={() => navigate("/analytics")}
                    className="mb-4 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm w-full"
                >
                    {t("profile.viewAnalytics")}
                </button>

				<Achievements />

                {editing ? (
                    <form onSubmit={handleSave} className="space-y-4">
                        <div>
                            <label className="text-gray-400 text-sm">{t("profile.displayName")}</label>
                            <input
                                type="text"
                                value={dispname}
                                onChange={(e) => setDispname(e.target.value)}
                                className="w-full px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="text-gray-400 text-sm">{t("common.bio")}</label>
                            <textarea
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                rows={3}
                                className="w-full px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                                {t("common.save")}
                            </button>
                            <button type="button" onClick={() => setEditing(false)} className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600">
                                {t("common.cancel")}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div>
                        <div className="mb-4">
                            <p className="text-gray-400 text-sm">{t("profile.displayName")}</p>
                            <p className="text-white">{profile.dispname || t("profile.notSet")}</p>
                        </div>
                        <div className="mb-4">
                            <p className="text-gray-400 text-sm">{t("common.bio")}</p>
                            <p className="text-white">{profile.bio || t("profile.noBio")}</p>
                        </div>
                        <button onClick={() => setEditing(true)} className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600">
                            {t("profile.edit")}
                        </button>
                    </div>
                )}
            </div>

            {/* 2FA Section */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mt-6">
                <h2 className="text-xl text-white font-semibold mb-4">{t("profile.2fa.title")}</h2>

                {enabling2FA ? (
                    <div className="space-y-4">
                        <p className="text-gray-400">Scan this QR code with your authenticator app, or enter the secret manually:</p>

                        <div className="bg-white p-4 rounded inline-block">
							<QRCodeSVG value={qrUri} size={200} />
                        </div>

                        <div>
                            <p className="text-gray-400 text-sm">{t("profile.2fa.manualEntry")}</p>
                            <code className="text-green-400 bg-gray-900 px-3 py-1 rounded text-sm block mt-1 break-all">{totpSecret}</code>
                        </div>

                        <form onSubmit={handleConfirm2FA} noValidate className="space-y-3">
                            <input
                                type="text"
                                placeholder={t("profile.2fa.confirmPlaceholder")}
                                value={confirmCode}
                                onChange={(e) => setConfirmCode(e.target.value)}
                                className="w-full px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500 text-center text-xl tracking-widest"
                                maxLength={9}
                                required
                            />
                            <div className="flex gap-2">
								<button type="submit" disabled={confirming2FA} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
                                    {confirming2FA ? t("common.loading") : t("common.confirm")}
                                </button>
								<button type="button" onClick={() => setEnabling2FA(false)} disabled={confirming2FA} className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed">
                                    {t("common.cancel")}
                                </button>
                            </div>
                        </form>
                    </div>
                ) : has2FA ? (
                    <div>
                        <p className="text-green-400 mb-4">2FA is enabled on your account.</p>

                        {showDisable ? (
                            <form onSubmit={handleDisable2FA} className="space-y-3">
                                <p className="text-gray-400 text-sm">{t("profile.2fa.confirmPrompt")}</p>
                                <input
                                    type="password"
                                    placeholder={t("field.password")}
                                    value={disablePassword}
                                    onChange={(e) => { setDisablePassword(e.target.value); setDisableCode("") }}
                                    className="w-full px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                                />
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 border-t border-gray-700"></div>
                                    <span className="text-gray-500 text-sm">{t("common.or")}</span>
                                    <div className="flex-1 border-t border-gray-700"></div>
                                </div>
                                <input
                                    type="text"
                                    placeholder={t("profile.2fa.codePlaceholder")}
                                    value={disableCode}
                                    onChange={(e) => { setDisableCode(e.target.value); setDisablePassword("") }}
                                    className="w-full px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500 text-center tracking-widest"
                                    maxLength={6}
                                />
                                <div className="flex gap-2">
                                    <button type="submit" className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
                                        {t("profile.2fa.disable")}
                                    </button>
                                    <button type="button" onClick={() => setShowDisable(false)} className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600">
                                        {t("common.cancel")}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <button onClick={() => setShowDisable(true)} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
                                {t("profile.2fa.disable")}
                            </button>
                        )}
                    </div>
                ) : (
                    <div>
                        <p className="text-gray-400 mb-4">{t("profile.2fa.blurb")}</p>
                        <button onClick={handleEnable2FA} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                            {t("profile.2fa.enable")}
                        </button>
                    </div>
                )}
            </div>
			{/* GDPR Section */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mt-6">
                <h2 className="text-xl text-white font-semibold mb-4">Your Data</h2>

                <div className="space-y-4">
                    <div>
                        <p className="text-gray-400 mb-2">Download a copy of all your data in JSON format.</p>
                        <button
                            onClick={async () => {
                                try {
                                    const resp = await api("/api/me/export/")
                                    if (resp.ok) {
                                        const blob = await resp.blob()
                                        const url = URL.createObjectURL(blob)
                                        const a = document.createElement("a")
                                        a.href = url
                                        a.download = "my_data.json"
                                        a.click()
                                        URL.revokeObjectURL(url)
                                        setSuccess("Data exported successfully.")
                                    } else {
                                        setError(t("profile.error.exportFailed"))
                                    }
                                } catch {
                                    setError(t("common.error.network"))
                                }
                            }}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                            Export my data
                        </button>
                    </div>

                    <hr className="border-gray-700" />

                    <div>
                        <p className="text-gray-400 mb-2">Permanently delete your account. A confirmation email will be sent.</p>
                        <button
                            onClick={async () => {
                                try {
                                    const resp = await api("/api/me/delete/", { method: "POST" })
                                    if (resp.ok) {
                                        setSuccess("Confirmation email sent. Check your inbox.")
                                    } else {
                                        const data = await resp.json()
                                        setError(data.error || "Failed to send confirmation.")
                                    }
                                } catch {
                                    setError(t("common.error.network"))
                                }
                            }}
                            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                        >
                            Delete my account
                        </button>
                    </div>
                </div>
            </div>
			{/* API Key Section */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mt-6">
                <h2 className="text-xl text-white font-semibold mb-4">API Key</h2>

				{newApiKey && (
                    <div className="bg-yellow-900/50 border border-yellow-500 text-yellow-300 px-4 py-4 rounded mb-4">
                        <p className="font-bold mb-2">Save this key — it won't be shown again:</p>
                        <div className="flex items-center gap-2">
                            <code className="text-green-400 bg-gray-900 px-3 py-1 rounded text-sm block break-all flex-1">{newApiKey}</code>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(newApiKey)
                                    setSuccess("API key copied to clipboard.")
                                }}
                                className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm shrink-0"
                            >
                                Copy
                            </button>
                        </div>
                    </div>
                )}

                {hasApiKey ? (
                    <div>
                        <p className="text-gray-400 mb-2">Active key: <code className="text-green-400">{apiKeyPrefix}...</code></p>
                        <div className="flex gap-2">
                            <button
                                onClick={async () => {
                                    try {
                                        const resp = await api("/api/me/api-key/generate/", { method: "POST" })
                                        if (resp.ok) {
                                            const data = await resp.json()
                                            setNewApiKey(data.api_key)
                                            setHasApiKey(true)
                                            setApiKeyPrefix(data.api_key.substring(0, 8))
                                            setSuccess("New API key generated.")
                                        }
                                    } catch { setError(t("common.error.network")) }
                                }}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                                Regenerate
                            </button>
                            <button
                                onClick={async () => {
                                    try {
                                        const resp = await api("/api/me/api-key/revoke/", { method: "POST" })
                                        if (resp.ok) {
                                            setHasApiKey(false)
                                            setApiKeyPrefix("")
                                            setNewApiKey("")
                                            setSuccess("API key revoked.")
                                        }
                                    } catch { setError(t("common.error.network")) }
                                }}
                                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                            >
                                Revoke
                            </button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <p className="text-gray-400 mb-4">Generate an API key to access the API from scripts or external tools.</p>
                        <button
                            onClick={async () => {
                                try {
                                    const resp = await api("/api/me/api-key/generate/", { method: "POST" })
                                    if (resp.ok) {
                                        const data = await resp.json()
                                        setNewApiKey(data.api_key)
                                        setHasApiKey(true)
                                        setApiKeyPrefix(data.api_key.substring(0, 8))
                                        setSuccess("API key generated.")
                                    }
                                } catch { setError(t("common.error.network")) }
                            }}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                            Generate API Key
                        </button>
                    </div>
                )}

                <div className="mt-4 text-gray-500 text-sm">
				    <p className="mb-2">Available endpoints:</p>
                    <div className="space-y-1 font-mono text-xs text-gray-400">
                        {["/api/me/", "/api/leaderboard/", "/api/match-history/", "/api/analytics/", "/api/achievements/", "/api/me/export/"].map((ep) => (
                            <p key={ep}>curl -sk -H "X-API-Key: YOUR_KEY" {window.location.origin}{ep}</p>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

