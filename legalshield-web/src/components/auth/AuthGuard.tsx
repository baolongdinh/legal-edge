import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export function AuthGuard({ children }: { children: React.ReactNode }) {
    const [loading, setLoading] = useState(true)
    const [session, setSession] = useState<any>(null)
    const location = useLocation()

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            setLoading(false)
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
        })

        return () => subscription.unsubscribe()
    }, [])

    if (loading) {
        return (
            <div className="h-screen w-screen bg-navy-base flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-gold-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        )
    }

    if (!session) {
        // Redirect to landing if not authenticated
        return <Navigate to="/" state={{ from: location }} replace />
    }

    return <>{children}</>
}
