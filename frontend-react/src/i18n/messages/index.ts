// frontend-react/src/i18n/messages/index.ts
//
// One lookup table, locale code -> messages. The provider reads only this.

import type { Locale } from "../config.ts"
import type { MessageTable } from "./en.ts"
import { en } from "./en.ts"
import { nl } from "./nl.ts"
import { ar } from "./ar.ts"
import { he } from "./he.ts"

// `en` is complete by definition; the others may be partial.
export const MESSAGES: Record<Locale, MessageTable> = { en, nl, ar, he }

// Exported separately because the fallback chain always needs the full
// English table, not the partial view.
export { en }
export type { MessageKey, MessageTable } from "./en.ts"
