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
import { serverMessageKey } from "./serverErrors.ts"

// Values substituted into {placeholders}.
type Vars = Record<string, string | number>

/**
 * Base keys that have plural variants.
 *
 * en.ts declares "history.moves_one" and "history.moves_other", so this
 * resolves to "history.moves". Conditional types distribute over unions, so
 * every _other key in the table contributes its base automatically -- add a
 * plural set to en.ts and tn() accepts it with no change here.
 */
type StripOther<K> = K extends `${infer Base}_other` ? Base : never
export type PluralKey = StripOther<MessageKey>

interface I18nValue {
    locale:     Locale
    dir:        Dir
    /** BCP-47 tag for Intl.* formatters -- e.g. "nl-BE", "ar-u-nu-latn". */
    intl:       string
    setLocale:  (next: Locale) => void
    t:          (key: MessageKey, vars?: Vars) => string

    /** Plural-aware translate. Picks the CLDR category for `count`. */
    tn:         (key: PluralKey, count: number, vars?: Vars) => string
    /** Locale-formatted number. */
    n:          (value: number, opts?: Intl.NumberFormatOptions) => string
    /** Locale-formatted date/time. */
    d:          (value: Date | string | number, opts?: Intl.DateTimeFormatOptions) => string

    /**
     * Translate a message the SERVER produced.
     * Unmapped text is returned verbatim, never blank.
     */
    ts:         (text: string | null | undefined, fallback?: MessageKey) => string
}

const I18nContext = createContext<I18nValue | null>(null)

// -- Which language do we start in? --------------------------------------
// Runs once, before the first render. Order matters:
//   1. what the user explicitly chose last time
//   2. what their browser asks for
//   3. English
function detectLocale(): Locale {
    // localStorage throws outright in some privacy modes -- never let that
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
// rather than becoming "undefined" -- a visible {oops} in the UI is a bug
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

    // -- THE effect. This is the whole RTL switch. -----------------------
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
        // even English is missing, "nav.games" appears on screen -- ugly on
        // purpose, because it is immediately obvious and greppable.
        const raw = MESSAGES[locale][key] ?? en[key] ?? key
        return interpolate(raw, vars)
    }, [locale])

    // Intl formatters are expensive to construct, so build them once per
    // locale rather than once per render. The provider sits above the whole
    // app; a fresh PluralRules on every render of every list row would be a
    // real cost.
    const fmt = useMemo(() => {
        const tag = LOCALES[locale].intl
        return {
            plural: new Intl.PluralRules(tag),
            number: new Intl.NumberFormat(tag),
            // Chess ratings are written WITHOUT a thousands separator by
            // convention -- lichess and chess.com both show 1200, not 1,200.
            // Grouping would also differ per locale (1,200 vs 1.200), which
            // reads as a decimal to a Dutch speaker.
            plain:  new Intl.NumberFormat(tag, { useGrouping: false }),
            time:   new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit" }),
        }
    }, [locale])

    const n = useCallback((value: number, opts?: Intl.NumberFormatOptions): string => {
        if (!Number.isFinite(value)) return String(value)
        return opts ? new Intl.NumberFormat(LOCALES[locale].intl, opts).format(value)
                    : fmt.number.format(value)
    }, [locale, fmt])

    const d = useCallback((value: Date | string | number,
                           opts?: Intl.DateTimeFormatOptions): string => {
        const date = value instanceof Date ? value : new Date(value)
        if (Number.isNaN(date.getTime())) return ""
        return opts ? new Intl.DateTimeFormat(LOCALES[locale].intl, opts).format(date)
                    : fmt.time.format(date)
    }, [locale, fmt])

    // Plural-aware lookup.
    //
    // Intl.PluralRules returns a CLDR category -- "one", "other" for English
    // and Dutch; "zero", "one", "two", "few", "many", "other" for Arabic.
    // Hebrew uses "one", "two", "many", "other". We look for key_<category>,
    // fall back to key_other, then to English, then to the key itself.
    //
    // {count} is injected already formatted, so Arabic gets its configured
    // numbering system without every call site remembering to ask.
    const tn = useCallback((key: PluralKey, count: number, vars?: Vars): string => {
        const category = fmt.plural.select(count)
        const table = MESSAGES[locale] as Partial<Record<string, string>>
        const enTable = en as Record<string, string>
        const raw =
            table[`${key}_${category}`] ??
            table[`${key}_other`] ??
            enTable[`${key}_${category}`] ??
            enTable[`${key}_other`] ??
            key
        return interpolate(raw, { count: n(count), ...vars })
    }, [locale, fmt, n])

    // Server-produced text. The API returns English prose rather than codes,
    // so serverErrors.ts maps the known strings onto keys and this translates
    // them. An unmapped string falls through unchanged -- which is exactly the
    // behaviour before any of this existed, so a new backend message can never
    // render blank.
    const ts = useCallback((text: string | null | undefined,
                            fallback?: MessageKey): string => {
        if (!text) return fallback ? t(fallback) : ""
        const key = serverMessageKey(text)
        if (key) return t(key)
        return fallback ? t(fallback) : text
    }, [t])

    const value = useMemo<I18nValue>(() => ({
        locale,
        dir:  LOCALES[locale].dir,
        intl: LOCALES[locale].intl,
        setLocale,
        t,
        tn,
        n,
        d,
        ts,
    }), [locale, t, tn, n, d, ts])

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
