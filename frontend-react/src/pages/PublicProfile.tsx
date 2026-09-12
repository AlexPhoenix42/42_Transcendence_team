// frontend-react/src/pages/PublicProfile.tsx

import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { api, mediaUrl } from "../api/client.ts"

import Achievements from "../components/Achievements.tsx"

interface PublicProfileData {
    id: number
    username: string
    dispname: string
    bio: string
    avatar: string | null
    rating: number
    wins: number
    loss: number
    draw: number
    is_online: boolean
    friends_cnt: number
	role: string
}

export default function PublicProfile() {
    const { username } = useParams()
    const navigate = useNavigate()
    const [profile, setProfile] = useState<PublicProfileData | null>(null)
    const [error, setError] = useState("")
    const [isBlocked, setIsBlocked] = useState(false)

    useEffect(() => {
        async function fetchProfile() {
            try {
                const resp = await api(`/api/profile/${username}/`)
                if (resp.ok) {
                    const data = await resp.json()
                    setProfile(data)
                } else {
                    setError("User not found")
                }
            } catch {
                setError("Failed to load profile")
            }
        }
        fetchProfile()
    }, [username])

    useEffect(() => {
        async function checkBlocked() {
            try {
                const resp = await api("/api/chat/blocked/")
                if (resp.ok) {
                    const data = await resp.json()
                    setIsBlocked(data.some((b: { username: string }) => b.username === username))
                }
            } catch {}
        }
        checkBlocked()
    }, [username])

    async function toggleBlock() {
        if (!profile) return

        try {
            if (isBlocked) {
                const resp = await api(`/api/chat/unblock/${profile.id}/`, { method: "DELETE" })
                if (resp.ok) setIsBlocked(false)
            } else {
                const resp = await api(`/api/chat/block/${profile.id}/`, { method: "POST" })
                if (resp.ok) setIsBlocked(true)
            }
        } catch {}
    }

    if (error) {
        return <p className="text-red-400 text-center mt-10">{error}</p>
    }

    if (!profile) {
        return <p className="text-gray-400 text-center mt-10">Loading...</p>
    }

    return (
        <div className="max-w-2xl mx-auto">
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-20 h-20 bg-gray-700 rounded-full flex items-center justify-center text-3xl text-white overflow-hidden">
                        {profile.avatar
							? <img src={mediaUrl(profile.avatar) || undefined} className="w-20 h-20 rounded-full object-cover" />
                            : profile.username[0].toUpperCase()
                        }
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
							<h1 className="text-2xl text-white font-bold">{profile.dispname || profile.username}</h1>
                            {profile.role === "admin" && (
                                <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-900/50 text-red-400">Admin</span>
                            )}
                            {profile.role === "moderator" && (
                                <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-900/50 text-yellow-400">Mod</span>
                            )}
                            <span className={`w-2.5 h-2.5 rounded-full ${profile.is_online ? "bg-green-500" : "bg-gray-600"}`}></span>
                        </div>
                        <p className="text-gray-400">@{profile.username}</p>
                    </div>
                </div>

                {profile.bio && (
                    <div className="mb-6">
                        <p className="text-gray-400 text-sm">Bio</p>
                        <p className="text-white">{profile.bio}</p>
                    </div>
                )}

                <div className="grid grid-cols-4 gap-4 mb-4 text-center">
                    <div className="bg-gray-900 rounded p-3">
                        <p className="text-2xl font-bold text-white">{profile.rating}</p>
                        <p className="text-gray-400 text-sm">Rating</p>
                    </div>
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

                <div className="text-gray-400 text-sm">
                    {profile.friends_cnt} friend{profile.friends_cnt !== 1 ? "s" : ""}
                </div>

                <button
                    onClick={() => navigate(`/history/${profile.username}`)}
                    className="mt-4 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm w-full"
                >
                    View Match History
                </button>
                <button
                    onClick={toggleBlock}
                    className={`mt-2 px-4 py-2 rounded text-sm w-full ${
                        isBlocked
                            ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                            : "bg-red-800 text-red-300 hover:bg-red-700"
                    }`}
                >
                    {isBlocked ? "Unblock User" : "Block User"}
                </button>
				<div className="mt-4">
                    <Achievements username={profile.username} />
                </div>
            </div>
        </div>
    )
}

