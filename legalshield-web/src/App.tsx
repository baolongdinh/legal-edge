import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { Sidebar } from './components/layout/Sidebar'
import { Topbar } from './components/layout/Topbar'
import { Landing } from './pages/Landing'
import { Dashboard } from './pages/Dashboard'
import { Pricing } from './pages/Pricing'
import { ContractAnalysis } from './pages/ContractAnalysis'
import { DraftEditor } from './pages/DraftEditor'
import { Profile } from './pages/Profile'
import { AuthGuard } from './components/auth/AuthGuard'
import './index.css'

// App shell with persistent Sidebar + Topbar
function AppShell({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex h-screen overflow-hidden bg-navy-base">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar title={title} subtitle={subtitle} />
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/pricing" element={<Pricing />} />

        {/* App shell */}
        <Route path="/dashboard" element={<AuthGuard><AppShell title="Dashboard" subtitle="Quản lý hợp đồng của bạn" /></AuthGuard>}>
          <Route index element={<Dashboard />} />
        </Route>
        <Route path="/analysis" element={<AuthGuard><AppShell title="Phân tích hợp đồng" subtitle="Xem xét rủi ro pháp lý" /></AuthGuard>}>
          <Route index element={<ContractAnalysis />} />
        </Route>
        <Route path="/editor" element={<AuthGuard><AppShell title="Soạn thảo hợp đồng" subtitle="Tạo hợp đồng chuyên nghiệp" /></AuthGuard>}>
          <Route index element={<DraftEditor />} />
        </Route>
        <Route path="/clauses" element={<AuthGuard><AppShell title="Kho điều khoản" /></AuthGuard>}>
          <Route index element={<DraftEditor clauseMode />} />
        </Route>
        <Route path="/settings" element={<AuthGuard><AppShell title="Cài đặt & Tài khoản" /></AuthGuard>}>
          <Route index element={<Profile />} />
        </Route>

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}
