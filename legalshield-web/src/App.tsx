import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Toaster } from 'sonner'
import { useEffect, lazy, Suspense, useRef, useCallback } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { Topbar } from './components/layout/Topbar'
import { AuthGuard } from './components/auth/AuthGuard'
import { useUserStore } from './store'
import { GlobalDisclaimerFooter } from './components/legal/GlobalDisclaimerFooter'
import { cn } from './lib/utils'
import './index.css'

// Route preloading utility
const preloadRoute = (path: string) => {
  const link = document.createElement('link')
  link.rel = 'prefetch'
  link.href = path
  link.as = 'script'
  document.head.appendChild(link)
}

// Map of routes to their chunk names for preloading
const routePreloadMap: Record<string, () => Promise<unknown>> = {
  '/dashboard': () => import('./pages/Dashboard'),
  '/analysis': () => import('./pages/ContractAnalysis'),
  '/editor': () => import('./pages/DraftEditor'),
  '/chat': () => import('./pages/ChatPage'),
  '/settings': () => import('./pages/Profile'),
  '/pricing': () => import('./pages/Pricing'),
}

// Preload route component on hover
export const preloadRouteComponent = (path: string) => {
  const loader = routePreloadMap[path]
  if (loader) {
    loader()
  }
}

// Lazy loaded pages
const Landing = lazy(() => import('./pages/Landing').then(m => ({ default: m.Landing })))
const Platform = lazy(() => import('./pages/Platform').then(m => ({ default: m.Platform })))
const Solutions = lazy(() => import('./pages/Solutions').then(m => ({ default: m.Solutions })))
const Resources = lazy(() => import('./pages/Resources').then(m => ({ default: m.Resources })))
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const Pricing = lazy(() => import('./pages/Pricing').then(m => ({ default: m.Pricing })))
const ContractAnalysis = lazy(() => import('./pages/ContractAnalysis').then(m => ({ default: m.ContractAnalysis })))
const DraftEditor = lazy(() => import('./pages/DraftEditor').then(m => ({ default: m.DraftEditor })))
const Profile = lazy(() => import('./pages/Profile').then(m => ({ default: m.Profile })))
const ChatPage = lazy(() => import('./pages/ChatPage').then(m => ({ default: m.ChatPage })))

// Simple loading fallback
function PageLoader() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface">
      <motion.div
        animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        className="text-primary font-black tracking-widest text-xs uppercase"
      >
        LegalShield AI
      </motion.div>
    </div>
  )
}

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    <Suspense fallback={<PageLoader />}>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          {/* Public */}
          <Route path="/" element={
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
              <Landing />
            </motion.div>
          } />
          <Route path="/pricing" element={
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <Pricing />
            </motion.div>
          } />
          <Route path="/platform" element={
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <Platform />
            </motion.div>
          } />
          <Route path="/solutions" element={
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <Solutions />
            </motion.div>
          } />
          <Route path="/resources" element={
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <Resources />
            </motion.div>
          } />

          {/* App shell */}
          <Route path="/dashboard" element={<AuthGuard><AppShell title="Dashboard" subtitle="Quản lý hợp đồng của bạn" /></AuthGuard>}>
            <Route index element={
              <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="h-full">
                <Dashboard />
              </motion.div>
            } />
          </Route>
          <Route path="/analysis" element={<AuthGuard><AppShell title="Rà soát Rủi ro" subtitle="Kiểm tra điều khoản hợp đồng" /></AuthGuard>}>
            <Route index element={
              <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.02 }} className="h-full">
                <ContractAnalysis />
              </motion.div>
            } />
          </Route>
          <Route path="/editor" element={<AuthGuard><AppShell title="Trợ lý Soạn thảo" subtitle="Khởi tạo bản nháp văn bản" /></AuthGuard>}>
            <Route index element={
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                <DraftEditor />
              </motion.div>
            } />
          </Route>
          <Route path="/chat" element={<AuthGuard><AppShell title="Tra cứu & Tham khảo" subtitle="Tìm kiếm quy định pháp luật" /></AuthGuard>}>
            <Route index element={
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="h-full">
                <ChatPage />
              </motion.div>
            } />
            <Route path=":conversationId" element={
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="h-full">
                <ChatPage />
              </motion.div>
            } />
          </Route>
          <Route path="/settings" element={<AuthGuard><AppShell title="Cài đặt & Tài khoản" /></AuthGuard>}>
            <Route index element={
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="h-full">
                <Profile />
              </motion.div>
            } />
          </Route>

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </AnimatePresence>
    </Suspense>
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
      <AnimatedRoutes />
    </BrowserRouter>
  )
}
