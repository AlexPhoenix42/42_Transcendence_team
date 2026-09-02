// frontend-react/src/pages/Dashboard.tsx

import { useAuth } from "../context/AuthContext.tsx"
import { Link } from "react-router-dom"

export default function Dashboard() {
    const { user } = useAuth()

    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-6">
                Welcome {user?.username}
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link to="/games" className="bg-gray-800 p-6 rounded-lg hover:bg-gray-750 border border-gray-700 hover:border-blue-500 transition">
                    <h2 className="text-xl font-semibold text-white mb-2">🎮 Games</h2>
                    <p className="text-gray-400">Play chess or pacman</p>
                </Link>

                <Link to="/tournaments" className="bg-gray-800 p-6 rounded-lg hover:bg-gray-750 border border-gray-700 hover:border-blue-500 transition">
                    <h2 className="text-xl font-semibold text-white mb-2">🏆 Tournaments</h2>
                    <p className="text-gray-400">Join or create a tournament</p>
                </Link>

                <Link to="/friends" className="bg-gray-800 p-6 rounded-lg hover:bg-gray-750 border border-gray-700 hover:border-blue-500 transition">
                    <h2 className="text-xl font-semibold text-white mb-2">👥 Friends</h2>
                    <p className="text-gray-400">Manage your friends list</p>
                </Link>

                <Link to="/chat" className="bg-gray-800 p-6 rounded-lg hover:bg-gray-750 border border-gray-700 hover:border-blue-500 transition">
                    <h2 className="text-xl font-semibold text-white mb-2">💬 Chat</h2>
                    <p className="text-gray-400">Chat with other players</p>
                </Link>
            </div>
        </div>
    )
}

