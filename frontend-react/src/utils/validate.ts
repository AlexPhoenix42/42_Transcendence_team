// frontend-react/src/utils/validate.ts
//
// Shared frontend validation helpers.
// Backend validates too — this is for immediate user feedback.
//
// Return values are typed MessageKey | null so the results can be passed
// directly to t() without widening back to string. The two dynamic
// functions (validateRequired, validateMaxLength) build their key from a
// caller-supplied field name; TypeScript can't verify the result is a real
// MessageKey, so those two casts document the contract — the field names
// in callers must correspond to keys that exist in i18n/messages/*.ts.

import type { MessageKey } from "../i18n/messages/index.ts"

export function validateUsername(val: string): MessageKey | null {
    if (!val.trim()) return "validate.username.required"
    if (val.length < 3) return "validate.username.minLength"
    if (val.length > 30) return "validate.username.maxLength"
    if (!/^[a-zA-Z0-9_-]+$/.test(val)) return "validate.username.format"
    return null
}

export function validateEmail(val: string): MessageKey | null {
    if (!val.trim()) return "validate.email.required"
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return "validate.email.format"
    return null
}

export function validatePassword(val: string): MessageKey | null {
    if (!val) return "validate.password.required"
    if (val.length < 8) return "validate.password.minLength"
    if (val.length > 128) return "validate.password.maxLength"
    if (!/[A-Z]/.test(val)) return "validate.password.uppercase"
    if (!/[a-z]/.test(val)) return "validate.password.lowercase"
    if (!/[0-9]/.test(val)) return "validate.password.number"
    return null
}

export function validatePasswordMatch(password: string, confirm: string): MessageKey | null {
    if (!confirm) return "validate.password.confirmRequired"
    if (password !== confirm) return "validate.password.mismatch"
    return null
}

export function validateRequired(val: string, field: string): MessageKey | null {
    if (!val.trim()) return `validate.required.${field.toLowerCase()}` as MessageKey
    return null
}

export function validateMaxLength(val: string, max: number, field: string): MessageKey | null {
    if (val.length > max) return `validate.maxLength.${field.toLowerCase().replace(" ", "")}` as MessageKey
    return null
}

export function validate2FACode(val: string): MessageKey | null {
    if (!val.trim()) return "validate.2fa.required"
    if (!/^\d{6}$/.test(val.trim())) return "validate.2fa.format"
    return null
}

