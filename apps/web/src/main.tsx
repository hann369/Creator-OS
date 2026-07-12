import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { WorkspaceProvider } from './context/WorkspaceContext.tsx'
import { AuthProvider, useAuth } from './context/AuthContext.tsx'
import { ProjectsScreen } from './components/ProjectsScreen.tsx'
import { useProjects, type ProjectItem } from './hooks/useProjects.ts'
import { setActiveWorkspaceId } from './lib/workspace.ts'
import { setRepository, createHybridRepository } from './store/repository.ts'
import { supabaseRepository } from './store/supabaseRepository.ts'
import { apiRepository, API_ROUTED_TABLES } from './store/apiRepository.ts'
import { CourseViewer } from './views/CourseViewer.tsx'
import { LandingPage } from './views/LandingPage.tsx'
import { OAuthConsent } from './views/OAuthConsent.tsx'
import { AuthScreen } from './components/AuthScreen.tsx'

// Compose the data layer: the collections resolve this lazily, on their first
// read or write, so registering it before render() is early enough.
const hybridRepo = createHybridRepository([...API_ROUTED_TABLES], apiRepository, supabaseRepository);
setRepository(hybridRepo)

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
  // The `key` remounts the subtree, but the module-level stores outlive it — they
  // reload off the change setActiveWorkspaceId broadcasts.
  setActiveWorkspaceId(active.id)

  return (
    <WorkspaceProvider key={active.id}>
      <App project={active} onExitProject={() => setActiveId(null)} />
    </WorkspaceProvider>
  )
}

// Auth gate: nothing renders until we know the session state; no session → landing page.
function Root() {
  const { session, loading } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  if (loading) return null
  if (!session) {
    return (
      <LandingPage 
        onLogin={() => setShowAuth(true)} 
        showAuth={showAuth} 
        onCloseAuth={() => setShowAuth(false)} 
      />
    )
  }
  return <Workspace />
}

// OAuth consent gate: if not logged in, show a clean, centered login box directly. Once logged in, show consent screen.
function OAuthConsentGate() {
  const { session, loading } = useAuth()
  if (loading) return null
  if (!session) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'radial-gradient(circle at top left, #f8f9fa, #e9ecef)', padding: '20px' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '32px', maxWidth: '400px', width: '100%', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
          <AuthScreen />
        </div>
      </div>
    )
  }
  return <OAuthConsent />
}

// Minimal, dependency-free routing split (matches the codebase's build-our-own
// ethos — own store, own test harness, no router lib). Two surfaces:
//   • /c/:slug          → PUBLIC course viewer, OUTSIDE the auth gate
//   • /oauth/consent    → The custom OAuth consent authorization UI
//   • everything else    → the auth-gated studio
// Vercel already rewrites deep links to index.html, so these paths resolve here.
function render() {
  const path = window.location.pathname.toLowerCase().replace(/\/$/, '');
  
  // Intercept /authorize requests and redirect to Supabase Auth
  if (path === '/authorize') {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (supabaseUrl) {
      const cleanUrl = supabaseUrl.replace(/\/$/, '');
      window.location.href = `${cleanUrl}/auth/v1/oauth/authorize${window.location.search}`;
      return;
    }
  }

  const match = window.location.pathname.match(/^\/c\/([^/]+)\/?$/);
  const searchParams = new URLSearchParams(window.location.search);
  const hasAuthorizationId = searchParams.has('authorization_id');
  
  const consentMatch = path === '/oauth/consent' || hasAuthorizationId;
  // Reuse a single root across HMR re-executions of this module — createRoot on a
  // container that already has one warns and leaks. Cache it on window so a hot
  // reload calls render() on the existing root instead of making a new one.
  const container = document.getElementById('root')!;
  const w = window as unknown as { __pronoiaRoot?: ReturnType<typeof createRoot> };
  const root = (w.__pronoiaRoot ??= createRoot(container));
  
  if (match) {
    root.render(
      <StrictMode>
        <CourseViewer slug={decodeURIComponent(match[1])} />
      </StrictMode>,
    );
    return;
  }
  
  if (consentMatch) {
    root.render(
      <StrictMode>
        <AuthProvider>
          <OAuthConsentGate />
        </AuthProvider>
      </StrictMode>,
    );
    return;
  }
  
  root.render(
    <StrictMode>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </StrictMode>,
  );
}

render()
