// frontend-react/src/i18n/config.ts
//
// The single source of truth for which languages exist.
// Adding a fourth language means adding one entry here and one message file.

export const LOCALES = {
    en:  { label: "English",       flag: "🇬🇧", dir: "ltr", intl: "en-GB",        complete: true  },
    nl:  { label: "Nederlands",    flag: "🇳🇱", dir: "ltr", intl: "nl-BE",        complete: true  },
    ar:  { label: "العربية",         flag: "🇸🇦", dir: "rtl", intl: "ar-u-nu-latn", complete: true  },
    he:  { label: "עברית",          flag: "🇮🇱", dir: "rtl", intl: "he-IL",        complete: true  },
    tlh: { label: "tlhIngan Hol",  flag: "🚀", dir: "ltr", intl: "en-GB",        complete: false },
} as const

// `as const` is doing real work here. Without it TypeScript widens `dir` to
// `string`, and `el.dir = LOCALES[locale].dir` stops type-checking. With it,
// dir is the literal union "ltr" | "rtl" and Locale below is "en" | "nl" | "ar"
// rather than plain string -- so a typo like t("nav.gmaes") or setLocale("de")
// is a compile error, not a blank label discovered in the browser.
export type Locale = keyof typeof LOCALES
export type Dir    = (typeof LOCALES)[Locale]["dir"]

export const DEFAULT_LOCALE: Locale = "en"
export const LOCALE_CODES  = Object.keys(LOCALES) as Locale[]

// localStorage key. One place, so the provider and any future code agree.
export const STORAGE_KEY = "lang"

// Narrowing helper: anything read back from localStorage or navigator is
// untrusted string data, and this is what turns it into a Locale safely.
export function isLocale(value: unknown): value is Locale {
    return typeof value === "string" && value in LOCALES
}

// -- Why these particular `intl` tags ------------------------------------
//
// These are BCP-47 tags handed to Intl.DateTimeFormat / NumberFormat /
// PluralRules. They are deliberately NOT the same strings as the locale keys.
//
//   en-GB    not en-US -- 17/09/2026, not 09/17/2026. Wrong date format is
//            the classic i18n bug that nobody notices until the 13th.
//
//   nl-BE    not nl-NL -- Belgian Dutch. Same language, different conventions
//            (currency placement, some number formatting).
//
//   ar-u-nu-latn
//            Arabic, but with LATIN digits: 1400, not ١٤٠٠.
//            The `-u-nu-latn` suffix is a Unicode extension selecting the
//            numbering system. Plain "ar" gives Eastern Arabic numerals,
//            which are authentic for prose but wrong next to chess notation
//            and a running clock -- "e4" beside "٠٥:٣٠" reads badly, and
//            ratings become ambiguous. This is one character of config that
//            silently changes every number in the app, so it is worth being
//            deliberate about.
//
//   he-IL    Hebrew. RTL like Arabic, but NOT cursive -- Hebrew letters stand
//            apart, so letter-spacing is harmless there whereas it breaks
//            Arabic joins. Hebrew also uses Western digits natively, so no
//            -u-nu- extension is needed. This is exactly why the CSS in
//            index.css keys on :lang(ar) rather than [dir="rtl"]: the two
//            languages share a direction but need different typography.
//
//   tlh      Klingon (tlhIngan Hol). A real ISO 639-3 language, so the tag is
//            structurally valid -- but no Intl implementation carries CLDR data
//            for it. `Intl.NumberFormat("tlh")` does not throw; it silently
//            resolves to the runtime default, which on most machines is en-US.
//            That would give American date order to a European project by
//            accident, so `intl` is pinned to en-GB deliberately: an explicit
//            fallback rather than whatever the browser happens to pick.
//
//            `complete: false` marks it as a PARTIAL translation. Keys it
//            does not define fall back to English, which is the provider's
//            normal behaviour -- nothing special is needed to support this.
//            scripts_dev/check_i18n.py reads this flag and reports coverage
//            for partial locales instead of failing the build.
