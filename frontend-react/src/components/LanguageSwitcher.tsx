// frontend-react/src/components/LanguageSwitcher.tsx

import { LOCALE_CODES, LOCALES } from "../i18n/config.ts"
import { useI18n } from "../i18n/I18nProvider.tsx"

export default function LanguageSwitcher() {
    const { locale, setLocale, t } = useI18n()

    return (
        <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as typeof locale)}
            // aria-label rather than a visible <label>: the control is a flag-
            // free two-letter select in a crowded navbar, but screen readers
            // still need to know what it changes.
            aria-label={t("lang.label")}
            title={t("lang.label")}
            className="bg-gray-700 text-gray-200 text-sm rounded px-2 py-1
                       border border-gray-600 hover:text-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500
                       cursor-pointer"
        >
            {LOCALE_CODES.map((code) => (
                <option key={code} value={code}>
                    {/* Each language is named in ITSELF — Nederlands, not
                        "Dutch". Someone who only reads Arabic has to be able
                        to find العربية in this list while the UI is still in
                        a language they cannot read. */}
                    {LOCALES[code].label}
                </option>
            ))}
        </select>
    )
}
