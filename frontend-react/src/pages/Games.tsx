// frontend-react/src/pages/Games.tsx

import { Link } from "react-router-dom"
import { useT } from "../i18n/I18nProvider.tsx"

export default function Games() {
    const t = useT()
    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-6">{t("games.title")}</h1>

			    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link to="/chess" className="bg-gray-800 p-8 rounded-lg border border-gray-700 hover:border-blue-500 transition text-center">
                    <span className="text-4xl block mb-3">♟</span>
                    <h2 className="text-xl font-semibold text-white mb-2">{t("games.chess.title")}</h2>
                    <p className="text-gray-400">{t("games.chess.body")}</p>
                </Link>

				<Link to="/coach" className="bg-gray-800 p-8 rounded-lg border border-gray-700 hover:border-blue-500 transition text-center">
                    <span className="text-4xl block mb-3">🎓</span>
                    <h2 className="text-xl font-semibold text-white mb-2">{t("games.coach.title")}</h2>
                    <p className="text-gray-400">{t("games.coach.body")}</p>
                </Link>

				<Link to="/pacman3d" className="bg-gray-800 p-8 rounded-lg border border-gray-700 hover:border-yellow-500 transition text-center">
                    <span className="text-4xl block mb-3">👻</span>
                    <h2 className="text-xl font-semibold text-white mb-2">Pacman 3D</h2>
                    <p className="text-gray-400">{t("games.pacman3d.body")}</p>
                </Link>

				<Link to="/pacman" className="bg-gray-800 p-8 rounded-lg border border-gray-700 hover:border-blue-500 transition text-center">
                    <span className="text-4xl block mb-3">👾</span>
                    {/* i18n-exempt: brand name */}
                    <h2 className="text-xl font-semibold text-white mb-2">Pacman</h2>
                    <p className="text-gray-400">{t("games.pacmanMulti.body")}</p>
                </Link>

				<Link to="/goose" className="bg-gray-800 p-8 rounded-lg border border-gray-700 hover:border-green-500 transition text-center">
                    <span className="text-4xl block mb-3">🪿</span>
                    <h2 className="text-xl font-semibold text-white mb-2">{t("games.goose.title")}</h2>
                    <p className="text-gray-400">{t("games.goose.body")}</p>
                </Link>

				<a href="/wbo/boards/community" target="_blank" rel="noopener noreferrer" className="bg-gray-800 p-8 rounded-lg border border-gray-700 hover:border-purple-500 transition text-center">
                    <span className="text-4xl block mb-3">🎨</span>
                    <h2 className="text-xl font-semibold text-white mb-2">{t("games.whiteboard.title")}</h2>
                    <p className="text-gray-400">{t("games.whiteboard.body")}</p>
                </a>
            </div>
        </div>
    )
}

