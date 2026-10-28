import { useT } from "../i18n/I18nProvider.tsx"

export default function NotFound() {
    const t = useT()
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900">
            <div className="text-center">
                <h1 className="text-6xl font-bold text-red-500 mb-4">404</h1>
                <p className="text-xl text-gray-300 mb-6">{t("notFound.title")}</p>
                <a href="/login" className="text-indigo-400 hover:text-indigo-300 underline">
                    {t("notFound.home")}
                </a>
            </div>
        </div>
    )
}

