// frontend-react/src/components/Achievements.tsx

import { useState, useEffect } from "react"
import { api } from "../api/client.ts"
import { useT } from "../i18n/I18nProvider.tsx"

interface Achievement {
    id: string
    name: string
    description: string
    icon: string
    unlocked: boolean
    progress?: number
    target?: number
}

interface AchievementsData {
    achievements: Achievement[]
    unlocked_count: number
    total_count: number
}

interface Props {
    username?: string
}

export default function Achievements({ username }: Props) {
    const t = useT()
    const [data, setData] = useState<AchievementsData | null>(null)

    useEffect(() => {
        async function fetch() {
            const url = username
                ? `/api/achievements/${username}/`
                : "/api/achievements/"
            try {
                const resp = await api(url)
                if (resp.ok) setData(await resp.json())
            } catch {}
        }
        fetch()
    }, [username])

    if (!data) return null

    return (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-5">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">{t("achievements.title")}</h2>
                //<h2 className="text-lg font-semibold text-white">Chess Achievements</h2>
                <span className="text-sm text-gray-400">
                    {data.unlocked_count} / {data.total_count}
                </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {data.achievements.map((a) => (
                    <div
                        key={a.id}
                        className={`rounded-lg p-3 border text-center ${
                            a.unlocked
                                ? "bg-yellow-900/20 border-yellow-700"
                                : "bg-gray-900/50 border-gray-700 opacity-50"
                        }`}
                    >
                        <div className="text-2xl mb-1">{a.icon}</div>
                        <p className={`text-sm font-semibold ${a.unlocked ? "text-yellow-300" : "text-gray-500"}`}>
                            {a.name}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{a.description}</p>
                        {a.target && !a.unlocked && (
                            <div className="mt-2">
                                <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-yellow-600 rounded-full"
                                        style={{ width: `${((a.progress || 0) / a.target) * 100}%` }}
                                    />
                                </div>
                                <p className="text-[10px] text-gray-500 mt-0.5">
                                    {a.progress || 0} / {a.target}
                                </p>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

