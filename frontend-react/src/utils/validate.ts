// frontend-react/src/utils/validate.ts
//
// Shared frontend validation helpers.
// Backend validates too — this is for immediate user feedback.

export function validateUsername(val: string): string | null {
    if (!val.trim()) return "Username is required"
    if (val.length < 3) return "Username must be at least 3 characters"
    if (val.length > 30) return "Username must be under 30 characters"
    if (!/^[a-zA-Z0-9_-]+$/.test(val)) return "Username can only contain letters, numbers, _ and -"
    return null
}

export function validateEmail(val: string): string | null {
    if (!val.trim()) return "Email is required"
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return "Invalid email format"
    return null
}

export function validatePassword(val: string): string | null {
    if (!val) return "Password is required"
    if (val.length < 8) return "Password must be at least 8 characters"
    if (val.length > 128) return "Password must be under 128 characters"
    if (!/[A-Z]/.test(val)) return "Password must contain an uppercase letter"
    if (!/[a-z]/.test(val)) return "Password must contain a lowercase letter"
    if (!/[0-9]/.test(val)) return "Password must contain a number"
    return null
}

export function validatePasswordMatch(password: string, confirm: string): string | null {
    if (!confirm) return "Please confirm your password"
    if (password !== confirm) return "Passwords do not match"
    return null
}

export function validateRequired(val: string, field: string): string | null {
    if (!val.trim()) return `${field} is required`
    return null
}

export function validateMaxLength(val: string, max: number, field: string): string | null {
    if (val.length > max) return `${field} must be under ${max} characters`
    return null
}

export function validate2FACode(val: string): string | null {
    if (!val.trim()) return "Code is required"
    if (!/^\d{6}$/.test(val.trim())) return "Code must be 6 digits"
    return null
}

