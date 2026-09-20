Q: I need to understand why inside src/pages/AdminDashboard.tsx
this was removed inside function createTournament()

		if (!name.trim()) {
            setError("Tournament name is required")
            setLoading(false)
            return
        }
        if (name.trim().length > 50) {
            setError("Tournament name must be under 50 characters")
            setLoading(false)
            return
        }
# =========================================================================

