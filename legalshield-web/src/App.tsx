import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { Analytics } from '@vercel/analytics/react'
import { useEffect, useRef } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { Topbar } from './components/layout/Topbar'
import { AuthGuard } from './components/auth/AuthGuard'
import { useUserStore } from './store'
import { GlobalDisclaimerFooter } from './components/legal/GlobalDisclaimerFooter'
import { cn } from './lib/utils'
import './index.css'

// Static imports for pages
import { Landing } from './pages/Landing'
import { Platform } from './pages/Platform'
import { Solutions } from './pages/Solutions'
import { Resources } from './pages/Resources'
import { Dashboard } from './pages/Dashboard'
import { Pricing } from './pages/Pricing'
import { ContractAnalysis } from './pages/ContractAnalysis'
import { DraftEditor } from './pages/DraftEditor'
import { Profile } from './pages/Profile'
import { ChatPage } from './pages/ChatPage'

// App shell with persistent Sidebar + Topbar
function AppShell({ title, subtitle }: { title: string; subtitle?: string }) {
  const syncUser = useUserStore((state) => state.syncUser)
  const location = useLocation()
  const hasSyncedUserRef = useRef(false)

  useEffect(() => {
    // Only sync user once on mount, not on every location change
    if (!hasSyncedUserRef.current) {
      syncUser()
      hasSyncedUserRef.current = true
    }
  }, [syncUser])

  // Hide global footer on mobile for chat and analysis to maximize space
  const isChatOrAnalysis = location.pathname.startsWith('/chat') || location.pathname.startsWith('/analysis')

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-surface">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden pb-[env(safe-area-inset-bottom)]">
        <Topbar title={title} subtitle={subtitle} />
        <main className="flex-1 overflow-hidden relative">
          <Outlet />
        </main>
        <div className={cn(isChatOrAnalysis && "hidden lg:block")}>
          <GlobalDisclaimerFooter />
        </div>
      </div>
    </div>
  )
}

function AnimatedRoutes() {
  const location = useLocation()

  return (
    <Routes location={location} key={location.pathname}>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/platform" element={<Platform />} />
      <Route path="/solutions" element={<Solutions />} />
      <Route path="/resources" element={<Resources />} />

      {/* App shell */}
      <Route path="/dashboard" element={<AuthGuard><AppShell title="Dashboard" subtitle="Quản lý hợp đồng của bạn" /></AuthGuard>}>
        <Route index element={<Dashboard />} />
      </Route>
      <Route path="/analysis" element={<AuthGuard><AppShell title="Rà soát Rủi ro" subtitle="Kiểm tra điều khoản hợp đồng" /></AuthGuard>}>
        <Route index element={<ContractAnalysis />} />
      </Route>
      <Route path="/editor" element={<AuthGuard><AppShell title="Trợ lý Soạn thảo" subtitle="Khởi tạo bản nháp văn bản" /></AuthGuard>}>
        <Route index element={<DraftEditor />} />
      </Route>
      <Route path="/chat" element={<AuthGuard><AppShell title="Tra cứu & Tham khảo" subtitle="Tìm kiếm quy định pháp luật" /></AuthGuard>}>
        <Route index element={<ChatPage />} />
        <Route path=":conversationId" element={<ChatPage />} />
      </Route>
      <Route path="/settings" element={<AuthGuard><AppShell title="Cài đặt & Tài khoản" /></AuthGuard>}>
        <Route index element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        theme="light"
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#FAF7F0',
            border: '1px solid rgba(11, 28, 26, 0.1)',
            color: '#0B1C1A',
            fontFamily: 'Manrope, sans-serif',
          },
        }}
      />
      <Analytics />
      <AnimatedRoutes />
    </BrowserRouter>
  )
}
