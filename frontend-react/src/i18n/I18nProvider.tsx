// frontend-react/src/i18n/I18nProvider.tsx

import {
    createContext, useCallback, useContext, useEffect, useMemo, useState,
    type ReactNode,
} from "react"

import {
    LOCALES, DEFAULT_LOCALE, STORAGE_KEY, isLocale,
    type Dir, type Locale,
} from "./config.ts"

import { MESSAGES, en, type MessageKey } from "./messages/index.ts"

// Values substituted into {placeholders}.
type Vars = Record<string, string | number>

interface I18nValue {
    locale:     Locale
    dir:        Dir
    setLocale:  (next: Locale) => void
    t:          (key: MessageKey, vars?: Vars) => string
}

const I18nContext = createContext<I18nValue | null>(null)

// ── Which language do we start in? ──────────────────────────────────────
// Runs once, before the first render. Order matters:
//   1. what the user explicitly chose last time
//   2. what their browser asks for
//   3. English
function detectLocale(): Locale {
    // localStorage throws outright in some privacy modes — never let that
    // take down the whole app before it has rendered anything.
    try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (isLocale(saved)) return saved
    } catch { /* ignore */ }

    // navigator.languages is ordered by preference, e.g.
    //   ["nl-BE", "nl", "en-US", "en"]
    // We match on the base subtag, so nl-NL and nl-BE both resolve to "nl".
    const tags = navigator.languages ?? [navigator.language]
    for (const tag of tags) {
        const base = tag.split("-")[0]?.toLowerCase()
        if (isLocale(base)) return base
    }

    return DEFAULT_LOCALE
}

// Replaces {name} with vars.name. An unknown placeholder is left verbatim
// rather than becoming "undefined" — a visible {oops} in the UI is a bug
// report; the word "undefined" is a mystery.
function interpolate(template: string, vars?: Vars): string {
    if (!vars) return template
    return template.replace(
        /\{(\w+)\}/g,
        (whole, key: string) => (key in vars ? String(vars[key]) : whole),
    )
}

export function I18nProvider({ children }: { children: ReactNode }) {
    // Lazy initialiser: detectLocale runs once on mount, not on every render.
    const [locale, setLocale] = useState<Locale>(detectLocale)

    // ── THE effect. This is the whole RTL switch. ───────────────────────
    // Setting dir="rtl" on <html> flips the entire application: every
    // logical CSS property (ms-*, me-*, ps-*, pe-*, start-*, end-*,
    // text-start/end) resolves the other way, and the browser applies the
    // Unicode bidi algorithm to text. No RTL stylesheet, no plugin.
    //
    // lang matters too, and not only for screen readers: it drives font
    // selection, hyphenation, and per-language CSS like :root:lang(ar).
    useEffect(() => {
        const el = document.documentElement
        el.lang = locale                    // "ar"
        el.dir  = LOCALES[locale].dir       // "rtl"  ← flips the app

        try {
            localStorage.setItem(STORAGE_KEY, locale)
        } catch { /* ignore — a non-persisted choice still works this session */ }
    }, [locale])

    // Rebuilt only when the locale changes, so components that depend on t
    // are not re-rendered on every parent render.
    const t = useCallback((key: MessageKey, vars?: Vars): string => {
        // The fallback chain, in order:
        //   1. the active locale
        //   2. English
        //   3. the key itself
        // A missing Dutch string shows English, never an empty button. And if
        // even English is missing, "nav.games" appears on screen — ugly on
        // purpose, because it is immediately obvious and greppable.
        const raw = MESSAGES[locale][key] ?? en[key] ?? key
        return interpolate(raw, vars)
    }, [locale])

    const value = useMemo<I18nValue>(() => ({
        locale,
        dir: LOCALES[locale].dir,
        setLocale,
        t,
    }), [locale, t])

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

// Full access: locale, dir, setLocale, t. Used by the switcher and by any
// component that needs to branch on direction.
export function useI18n(): I18nValue {
    const ctx = useContext(I18nContext)
    if (!ctx) {
        // Fails loudly at the first render rather than silently rendering
        // raw keys, which is a much harder bug to track down.
        throw new Error("useI18n must be used inside <I18nProvider>")
    }
    return ctx
}

// The one most components want. Keeps call sites to: const t = useT()
export function useT() {
    return useI18n().t
}
