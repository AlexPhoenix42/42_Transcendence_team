// frontend-react/src/utils/validate.ts
//
// Shared frontend validation helpers.
// Backend validates too — this is for immediate user feedback.

export function validateUsername(val: string): string | null {
    if (!val.trim()) return "validate.username.required"
    if (val.length < 3) return "validate.username.minLength"
    if (val.length > 30) return "validate.username.maxLength"
    if (!/^[a-zA-Z0-9_-]+$/.test(val)) return "validate.username.format"
    return null
}

export function validateEmail(val: string): string | null {
    if (!val.trim()) return "validate.email.required"
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return "validate.email.format"
    return null
}

export function validatePassword(val: string): string | null {
    if (!val) return "validate.password.required"
    if (val.length < 8) return "validate.password.minLength"
    if (val.length > 128) return "validate.password.maxLength"
    if (!/[A-Z]/.test(val)) return "validate.password.uppercase"
    if (!/[a-z]/.test(val)) return "validate.password.lowercase"
    if (!/[0-9]/.test(val)) return "validate.password.number"
    return null
}

export function validatePasswordMatch(password: string, confirm: string): string | null {
    if (!confirm) return "validate.password.confirmRequired"
    if (password !== confirm) return "validate.password.mismatch"
    return null
}

export function validateRequired(val: string, field: string): string | null {
    if (!val.trim()) return `validate.required.${field.toLowerCase()}`
    return null
}

export function validateMaxLength(val: string, max: number, field: string): string | null {
    if (val.length > max) return `validate.maxLength.${field.toLowerCase().replace(" ", "")}`
    return null
}

export function validate2FACode(val: string): string | null {
    if (!val.trim()) return "validate.2fa.required"
    if (!/^\d{6}$/.test(val.trim())) return "validate.2fa.format"
    return null
}

