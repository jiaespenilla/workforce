import { useAuth } from '../context/AuthContext'

// Guide steps are built from the modules/functions the signed-in user can
// actually access, based on their role permissions.
export default function HelpModal({ onClose }) {
  const { user } = useAuth()
  const perms = user?.perms || {}
  const allowed = (key) => perms[key] !== false
  const steps = []

  if (user?.role === 'administrator') {
    steps.push(
      ['Companies', 'Review new registrations under Companies. Expand a company to approve (with confirmation) or reject it with a reason. Use "View full details" to edit company info, toggle it active/inactive and manage employees.'],
      ['System Settings', 'Set the system name, version, time zone, session time-out and upload the tab icon. Name/version changes apply after you sign out; session and icon changes apply immediately.'],
      ['Roles & Permissions', 'Add the roles companies will use when registering teams. Toggle page access per role — Dashboard, Time Keeping, Tasks, Payroll, Kiosk and this Console. Applies on next login.'],
      ['Terms & Policies', 'Edit the Terms & Conditions and Privacy Policy shown during registration. Saved instantly.'],
      ['System Status', 'Monitor live platform metrics and enable Maintenance Mode to show a maintenance page to all non-admin users.'],
      ['My Profile', 'Upload your photo and keep your account details current.'],
    )
  } else {
    if (allowed('dashboard')) {
      if (user?.role === 'ceo') {
        steps.push(['Dashboard', 'See who is currently clocked-in via the kiosk. Click any employee to view their tasks grouped by status.'])
        steps.push(['Task exports', 'Use Copy, Word or PDF above the dashboard to export the full task report for all employees.'])
      } else {
        steps.push(['Dashboard', 'Quick overview of your open tasks and shortcuts to the tools you use most.'])
      }
    }
    if (allowed('tasks')) {
      if (user?.role === 'ceo') {
        steps.push(['Tasks', 'Create tasks with "New Task" and assign them to active employees. Drag cards between columns to track progress. Remove a task from its card.'])
      } else {
        steps.push(['My Tasks', 'Tasks assigned by your CEO appear here. Drag cards between columns as you progress — your CEO sees the update instantly.'])
      }
    }
    if (allowed('timekeeping')) {
      if (user?.role === 'ceo') {
        steps.push(['Time Keeping', 'View the employees\u2019 timesheet in real time using your configured time zone. No clock in/out needed for you.'])
      } else {
        steps.push(['Time Keeping', 'Clock in and out; your timesheet records each punch for the week.'])
      }
    }
    if (allowed('payroll')) {
      steps.push(['Payroll', 'Manage salary records, deduction rates, payroll runs and payslips.'])
    }
    if (user?.role === 'employee' && allowed('kiosk')) {
      steps.push(['Kiosk Mode', 'Use the shared kiosk to check in and out of your shift. Your punches drive the CEO\u2019s active-employee view.'])
    }
  }

  steps.push(['My Profile', 'Upload your photo, keep your contact details current, and change your password regularly — especially if you are still using the default password.'])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-gray-900/50" />
      <div className="relative flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100">
            <svg className="h-5 w-5 text-brand-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Help &amp; Guide</h3>
            <p className="text-xs text-gray-400">{user?.roleLabel} — modules available to you</p>
          </div>
        </div>
        <div className="overflow-y-auto px-6 py-4">
          {steps.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-400">No modules are currently enabled for your role.</p>
          )}
          <ol className="space-y-4">
            {steps.map(([title, desc], i) => (
              <li key={title} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">{i + 1}</span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="border-t border-gray-100 px-6 py-3 text-right">
          <button onClick={onClose} className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700">Got it</button>
        </div>
      </div>
    </div>
  )
}
