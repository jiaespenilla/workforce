export function loadRegisteredCompanies() {
  try {
    const stored = JSON.parse(localStorage.getItem('uw_companies'))
    if (!Array.isArray(stored)) return []
    return stored
      .filter((c) => c && typeof c === 'object' && c.id && c.name)
      .map((c) => ({ ...c, employees: Array.isArray(c.employees) ? c.employees : [] }))
  } catch {
    return []
  }
}

export function getAllCompanies() {
  return loadRegisteredCompanies()
}

// Flat list of every employee across all companies, tagged with their company.
export function getAllEmployees() {
  return getAllCompanies().flatMap((c) =>
    c.employees.map((e) => ({ ...e, companyName: c.name, companyId: c.id }))
  )
}
