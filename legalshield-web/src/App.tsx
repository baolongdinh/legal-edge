import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Toaster } from 'sonner'
import { useEffect } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { Topbar } from './components/layout/Topbar'
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
import { AuthGuard } from './components/auth/AuthGuard'
import { useUserStore } from './store'
import { GlobalDisclaimerFooter } from './components/legal/GlobalDisclaimerFooter'
import './index.css'

// App shell with persistent Sidebar + Topbar
function AppShell({ title, subtitle }: { title: string; subtitle?: string }) {
  const syncUser = useUserStore((state) => state.syncUser)

  useEffect(() => {
    syncUser()
  }, [syncUser])

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-surface">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden pb-[env(safe-area-inset-bottom)]">
        <Topbar title={title} subtitle={subtitle} />
        <main className="flex-1 overflow-hidden relative">
          <Outlet />
        </main>
        <GlobalDisclaimerFooter />
      </div>
    </div>
  )
}

function AnimatedRoutes() {
  const location = useLocation()

  return (
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
