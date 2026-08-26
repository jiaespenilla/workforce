import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { isMaintenanceMode } from './lib/systemSettings'
import RequireRole from './components/RequireRole'
import Layout from './components/Layout'
import AdminLayout from './components/AdminLayout'
import SessionManager from './components/SessionManager'
import Login from './pages/Login'
import SystemConfig from './pages/SystemConfig'
import Companies from './pages/Companies'
import TaskMonitoring from './pages/TaskMonitoring'
import CompanyRegistration from './pages/CompanyRegistration'
import Kiosk from './pages/Kiosk'
import KioskSetup from './pages/KioskSetup'
import Dashboard from './pages/Dashboard'
import TimeKeeping from './pages/TimeKeeping'
import Tasks from './pages/Tasks'
import Payroll from './pages/Payroll'
import Profile from './pages/Profile'
import AddEmployee from './pages/AddEmployee'

// Single /profile route — wraps the page in the layout matching the user's role.
function ProfileRoute() {
  const { user } = useAuth()
  return user?.role === 'administrator' ? (
    <AdminLayout><Profile /></AdminLayout>
  ) : (
    <MaintenanceGate>
      <Layout><Profile /></Layout>
    </MaintenanceGate>
  )
}

// Blocks a page when the signed-in user's role lacks that specific permission.
function PageGate({ perm, children }) {
  const { user } = useAuth()
  if (user && user.role !== 'administrator' && user.perms?.[perm] === false) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
        <p className="text-sm font-semibold text-amber-800">Access restricted</p>
        <p className="mt-1 text-xs text-amber-700">
          Your role ({user.roleLabel}) does not include access to this page.
        </p>
      </div>
    )
  }
  return children
}

// Blocks non-administrator users while maintenance mode is enabled.
function MaintenanceGate({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [on, setOn] = useState(isMaintenanceMode())

  useEffect(() => {
    const t = setInterval(() => setOn(isMaintenanceMode()), 3000)
    return () => clearInterval(t)
  }, [])

  if (on && user?.role !== 'administrator') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-b from-brand-700 to-emerald-500 p-6 text-center text-white">
        <svg className="h-14 w-14 text-white/90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <h1 className="text-2xl font-bold">Scheduled Maintenance</h1>
        <p className="max-w-md text-sm leading-relaxed text-emerald-50">
          The system is currently undergoing maintenance and will be back shortly.
          Please check with your system administrator for updates.
        </p>
        <button
          onClick={() => { logout(); navigate('/login') }}
          className="mt-2 rounded-xl bg-white px-6 py-2.5 text-sm font-semibold text-brand-700 shadow-md transition hover:bg-emerald-50"
        >
          Back to login
        </button>
      </div>
    )
  }
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<CompanyRegistration />} />

        <Route element={<RequireRole role="administrator"><AdminLayout /></RequireRole>}>
          <Route path="/companies" element={<Companies />} />
          <Route path="/task-monitoring" element={<TaskMonitoring />} />
          <Route path="/settings" element={<SystemConfig />} />
          <Route path="/kiosk-setup" element={<KioskSetup />} />
        </Route>

        {/* Single /profile route — renders inside the right chrome for the user's role */}
        <Route
          path="/profile"
          element={
            <RequireRole roles={['administrator', 'employee', 'ceo']}>
              <ProfileRoute />
            </RequireRole>
          }
        />

        <Route path="/kiosk" element={<RequireRole role="employee"><MaintenanceGate><Kiosk /></MaintenanceGate></RequireRole>} />

        <Route element={<RequireRole roles={['employee', 'ceo']}><MaintenanceGate><Layout /></MaintenanceGate></RequireRole>}>
          <Route path="/" element={<PageGate perm="dashboard"><Dashboard /></PageGate>} />
          <Route path="/timekeeping" element={<PageGate perm="timekeeping"><TimeKeeping /></PageGate>} />
          <Route path="/tasks" element={<PageGate perm="tasks"><Tasks /></PageGate>} />
          <Route path="/payroll" element={<PageGate perm="payroll"><Payroll /></PageGate>} />
          <Route path="/add-employee" element={<PageGate perm="employees"><AddEmployee /></PageGate>} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <SessionManager />
    </AuthProvider>
  )
}
