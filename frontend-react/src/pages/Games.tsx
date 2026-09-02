// frontend-react/src/pages/Games.tsx

import { Link } from "react-router-dom"

export default function Games() {
    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-6">Games</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link to="/chess" className="bg-gray-800 p-8 rounded-lg border border-gray-700 hover:border-blue-500 transition text-center">
                    <span className="text-4xl block mb-3">♟</span>
                    <h2 className="text-xl font-semibold text-white mb-2">Chess</h2>
                    <p className="text-gray-400">Classic chess — play online or vs AI</p>
                </Link>

				<Link to="/coach" className="bg-gray-800 p-8 rounded-lg border border-gray-700 hover:border-blue-500 transition text-center">
                    <span className="text-4xl block mb-3">🎓</span>
                    <h2 className="text-xl font-semibold text-white mb-2">Chess Coach</h2>
                    <p className="text-gray-400">Ask an AI coach about chess</p>
                </Link>

                <div className="bg-gray-800 p-8 rounded-lg border border-gray-700 text-center opacity-50">
                    <span className="text-4xl block mb-3">👾</span>
                    <h2 className="text-xl font-semibold text-white mb-2">Pacman</h2>
                    <p className="text-gray-400">Coming soon</p>
                </div>
            </div>
        </div>
    )
}

