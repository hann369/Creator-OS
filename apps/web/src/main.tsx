import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { WorkspaceProvider } from './context/WorkspaceContext.tsx'
import { AuthProvider, useAuth } from './context/AuthContext.tsx'
import { AuthScreen } from './components/AuthScreen.tsx'
import { ProjectsScreen } from './components/ProjectsScreen.tsx'
import { useProjects, type ProjectItem } from './hooks/useProjects.ts'
import { setActiveWorkspaceId } from './lib/workspace.ts'

// Gateway: show the projects screen first; entering a project mounts the
// workspace. Each project is its OWN data scope — the active project's id becomes
// the workspace id (default project keeps 'main-space' so existing data stays).
function Workspace() {
  const { projects, createProject } = useProjects()
  const [activeId, setActiveId] = useState<string | null>(null)
  const active: ProjectItem | undefined = projects.find(p => p.id === activeId)

  if (!active) {
    return <ProjectsScreen projects={projects} onOpen={p => setActiveId(p.id)} onCreate={createProject} />
  }

  // Scope the data layer to this project BEFORE the workspace subtree mounts.
  // The `key` forces a full remount (fresh loads) whenever the project changes.
  setActiveWorkspaceId(active.id)

  return (
    <WorkspaceProvider key={active.id}>
      <App project={active} onExitProject={() => setActiveId(null)} />
    </WorkspaceProvider>
  )
}

// Auth gate: nothing renders until we know the session state; no session → login.
function Root() {
  const { session, loading } = useAuth()
  if (loading) return null
  if (!session) return <AuthScreen />
  return <Workspace />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </StrictMode>,
)
