// frontend-react/src/pages/Dashboard.tsx

import { useAuth } from "../context/AuthContext.tsx"
import { Link } from "react-router-dom"
import { useT } from "../i18n/I18nProvider.tsx"

export default function Dashboard() {
    const { user } = useAuth()
    const t = useT()

    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-6">
                {t("dash.welcome", { name: user?.username ?? "" })}
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link to="/games" className="bg-gray-800 p-6 rounded-lg hover:bg-gray-750 border border-gray-700 hover:border-blue-500 transition">
                    <h2 className="text-xl font-semibold text-white mb-2">🎮 {t("dash.games.title")}</h2>
                    <p className="text-gray-400">{t("dash.games.body")}</p>
                </Link>

                <Link to="/tournaments" className="bg-gray-800 p-6 rounded-lg hover:bg-gray-750 border border-gray-700 hover:border-blue-500 transition">
                    <h2 className="text-xl font-semibold text-white mb-2">🏆 {t("dash.tournaments.title")}</h2>
                    <p className="text-gray-400">{t("dash.tournaments.body")}</p>
                </Link>

                <Link to="/friends" className="bg-gray-800 p-6 rounded-lg hover:bg-gray-750 border border-gray-700 hover:border-blue-500 transition">
                    <h2 className="text-xl font-semibold text-white mb-2">👥 {t("dash.friends.title")}</h2>
                    <p className="text-gray-400">{t("dash.friends.body")}</p>
                </Link>

                <Link to="/chat" className="bg-gray-800 p-6 rounded-lg hover:bg-gray-750 border border-gray-700 hover:border-blue-500 transition">
                    <h2 className="text-xl font-semibold text-white mb-2">💬 {t("dash.chat.title")}</h2>
                    <p className="text-gray-400">{t("dash.chat.body")}</p>
                </Link>
            </div>
        </div>
    )
}

