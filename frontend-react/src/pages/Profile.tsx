// frontend-react/src/pages/Profile.tsx

import { useState, useEffect } from "react"
import { useAuth } from "../context/AuthContext.tsx"
import { api, getAccessToken, mediaUrl } from "../api/client.ts"
import { useNavigate } from "react-router-dom"
import Achievements from "../components/Achievements.tsx"

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
    const [disablePassword, setDisablePassword] = useState("")
    const [showDisable, setShowDisable] = useState(false)
	const [disableCode, setDisableCode] = useState("")

    useEffect(() => {
        fetchProfile()
        check2FAStatus()
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
            setError("Failed to load profile")
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

        try {
            const resp = await api("/api/profile/", {
                method: "PATCH",
                body: JSON.stringify({ dispname, bio }),
            })

            if (resp.ok) {
                const data = await resp.json()
                setProfile(data)
                setEditing(false)
                setSuccess("Profile updated")
            } else {
                const data = await resp.json()
                setError(data.error || "Update failed")
            }
        } catch {
            setError("Network error. Please try again.")
        }
    }

    async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

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
                setProfile(data)
                setSuccess("Avatar updated")
            } else {
                setError("Avatar upload failed")
            }
        } catch {
            setError("Network error. Please try again.")
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
                setError(data.error || "Failed to enable 2FA")
            }
        } catch {
            setError("Network error. Please try again.")
        }
    }

    async function handleConfirm2FA(e: React.FormEvent) {
        e.preventDefault()
        setError("")

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
                setSuccess("2FA enabled successfully!")
            } else {
                setError(data.error || "Invalid code")
            }
        } catch {
            setError("Network error. Please try again.")
        }
    }

    //async function handleDisable2FA(e: React.FormEvent) {
    //    e.preventDefault()
    //    setError("")

    //    try {
    //        const resp = await api("/api/auth/2fa/disable/", {
    //            method: "POST",
    //            body: JSON.stringify({ password: disablePassword }),
    //        })

    //        if (resp.ok) {
    //            setHas2FA(false)
    //            setShowDisable(false)
    //            setDisablePassword("")
    //            setSuccess("2FA disabled")
    //        } else {
    //            const data = await resp.json()
    //            setError(data.error || "Failed to disable 2FA")
    //        }
    //    } catch {
    //        setError("Network error. Please try again.")
    //    }
    //}

    async function handleDisable2FA(e: React.FormEvent) {
        e.preventDefault()
        setError("")

        if (!disablePassword && !disableCode) {
            setError("Enter your password or a 2FA code")
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
                setError(data.error || "Failed to disable 2FA")
            }
        } catch {
            setError("Network error. Please try again.")
        }
    }

    if (!profile) {
        return <p className="text-gray-400">Loading profile...</p>
    }

    return (
        <div className="max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-6">Profile</h1>

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
                    <p className="font-bold mb-2">Save your recovery codes! They won't be shown again.</p>
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
                            <span className="text-white text-xs">Change</span>
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
                                <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-900/50 text-red-400">Admin</span>
                            )}
                            {profile.role === "moderator" && (
                                <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-900/50 text-yellow-400">Mod</span>
                            )}
                        </div>
                        <p className="text-gray-400">{profile.email}</p>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-6 text-center">
                    <div className="bg-gray-900 rounded p-3">
                        <p className="text-2xl font-bold text-green-400">{profile.wins}</p>
                        <p className="text-gray-400 text-sm">Wins</p>
                    </div>
                    <div className="bg-gray-900 rounded p-3">
                        <p className="text-2xl font-bold text-red-400">{profile.loss}</p>
                        <p className="text-gray-400 text-sm">Losses</p>
                    </div>
                    <div className="bg-gray-900 rounded p-3">
                        <p className="text-2xl font-bold text-gray-400">{profile.draw}</p>
                        <p className="text-gray-400 text-sm">Draws</p>
                    </div>
                </div>

                <div className="mb-4">
                    <p className="text-gray-400 text-sm">Rating</p>
                    <p className="text-white text-lg font-semibold">{profile.rating}</p>
                </div>

				<button
                    onClick={() => navigate("/history")}
                    className="mb-4 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm w-full"
                >
                    View Match History
                </button>

				<button
                    onClick={() => navigate("/analytics")}
                    className="mb-4 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm w-full"
                >
                    View Analytics
                </button>

				<Achievements />

                {editing ? (
                    <form onSubmit={handleSave} className="space-y-4">
                        <div>
                            <label className="text-gray-400 text-sm">Display Name</label>
                            <input
                                type="text"
                                value={dispname}
                                onChange={(e) => setDispname(e.target.value)}
                                className="w-full px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="text-gray-400 text-sm">Bio</label>
                            <textarea
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                rows={3}
                                className="w-full px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                                Save
                            </button>
                            <button type="button" onClick={() => setEditing(false)} className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600">
                                Cancel
                            </button>
                        </div>
                    </form>
                ) : (
                    <div>
                        <div className="mb-4">
                            <p className="text-gray-400 text-sm">Display Name</p>
                            <p className="text-white">{profile.dispname || "Not set"}</p>
                        </div>
                        <div className="mb-4">
                            <p className="text-gray-400 text-sm">Bio</p>
                            <p className="text-white">{profile.bio || "No bio yet"}</p>
                        </div>
                        <button onClick={() => setEditing(true)} className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600">
                            Edit Profile
                        </button>
                    </div>
                )}
            </div>

            {/* 2FA Section */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mt-6">
                <h2 className="text-xl text-white font-semibold mb-4">Two-Factor Authentication</h2>

                {enabling2FA ? (
                    <div className="space-y-4">
                        <p className="text-gray-400">Scan this QR code with your authenticator app, or enter the secret manually:</p>

                        <div className="bg-white p-4 rounded inline-block">
                            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUri)}`} alt="QR Code" />
                        </div>

                        <div>
                            <p className="text-gray-400 text-sm">Manual entry secret:</p>
                            <code className="text-green-400 bg-gray-900 px-3 py-1 rounded text-sm block mt-1 break-all">{totpSecret}</code>
                        </div>

                        <form onSubmit={handleConfirm2FA} className="space-y-3">
                            <input
                                type="text"
                                placeholder="Enter 6-digit code to confirm"
                                value={confirmCode}
                                onChange={(e) => setConfirmCode(e.target.value)}
                                className="w-full px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500 text-center text-xl tracking-widest"
                                maxLength={9}
                                required
                            />
                            <div className="flex gap-2">
                                <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                                    Confirm
                                </button>
                                <button type="button" onClick={() => setEnabling2FA(false)} className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                ) : has2FA ? (
                    <div>
                        <p className="text-green-400 mb-4">2FA is enabled on your account.</p>

                        {showDisable ? (
                            <form onSubmit={handleDisable2FA} className="space-y-3">
                                <p className="text-gray-400 text-sm">Enter your password or a 2FA code to confirm:</p>
                                <input
                                    type="password"
                                    placeholder="Password"
                                    value={disablePassword}
                                    onChange={(e) => { setDisablePassword(e.target.value); setDisableCode("") }}
                                    className="w-full px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                                />
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 border-t border-gray-700"></div>
                                    <span className="text-gray-500 text-sm">or</span>
                                    <div className="flex-1 border-t border-gray-700"></div>
                                </div>
                                <input
                                    type="text"
                                    placeholder="2FA code"
                                    value={disableCode}
                                    onChange={(e) => { setDisableCode(e.target.value); setDisablePassword("") }}
                                    className="w-full px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500 text-center tracking-widest"
                                    maxLength={6}
                                />
                                <div className="flex gap-2">
                                    <button type="submit" className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
                                        Disable 2FA
                                    </button>
                                    <button type="button" onClick={() => setShowDisable(false)} className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600">
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <button onClick={() => setShowDisable(true)} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
                                Disable 2FA
                            </button>
                        )}
                    </div>
                ) : (
                    <div>
                        <p className="text-gray-400 mb-4">Add an extra layer of security to your account.</p>
                        <button onClick={handleEnable2FA} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                            Enable 2FA
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

