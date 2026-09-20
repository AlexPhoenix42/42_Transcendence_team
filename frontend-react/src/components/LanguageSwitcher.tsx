// frontend-react/src/components/LanguageSwitcher.tsx

import { LOCALE_CODES, LOCALES } from "../i18n/config.ts"
import { useI18n } from "../i18n/I18nProvider.tsx"

/**
 * Language dropdown: flag + the language's name in its own language.
 *
 *   🇬🇧 English      🇳🇱 Nederlands      🇸🇦 العربية
 *
 * The name is always shown beside the flag, never the flag alone. That keeps
 * the control readable on Windows, which ships no flag-emoji font -- there
 * 🇳🇱 falls back to the letters "NL" rather than rendering a flag. The text
 * carries the meaning either way.
 *
 * Flags live in LOCALES (src/i18n/config.ts), so adding a language is still
 * a single entry there plus a message file.
 */
export default function LanguageSwitcher() {
    const { locale, setLocale, t } = useI18n()

    return (
        <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as typeof locale)}
            // aria-label rather than a visible <label>: the navbar has no room
            // for one, but a screen reader still needs to know what this
            // control changes.
            aria-label={t("lang.label")}
            title={t("lang.label")}
            className="bg-gray-700 text-gray-200 text-sm rounded px-2 py-1
                       border border-gray-600 hover:text-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500
                       cursor-pointer"
        >
            {LOCALE_CODES.map((code) => (
                // lang on the <option> so a screen reader pronounces the
                // native name with the right voice. Safe here -- unlike on a
                // button, :lang(ar) font swapping cannot affect sibling
                // options, since each option renders its own text.
                <option key={code} value={code} lang={code}>
                    {LOCALES[code].flag} {LOCALES[code].label}
                </option>
            ))}
        </select>
    )
}

