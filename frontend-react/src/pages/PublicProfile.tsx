// frontend-react/src/pages/PublicProfile.tsx

import { useState, useEffect } from "react"
import { useParams } from "react-router-dom"
import { api } from "../api/client.ts"

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
}

export default function PublicProfile() {
    const { username } = useParams()
    const [profile, setProfile] = useState<PublicProfileData | null>(null)
    const [error, setError] = useState("")

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
                            ? <img src={profile.avatar} className="w-20 h-20 rounded-full object-cover" />
                            : profile.username[0].toUpperCase()
                        }
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl text-white font-bold">{profile.dispname || profile.username}</h1>
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
            </div>
        </div>
    )
}

