import { useEffect } from 'react'
import { AppProvider, useApp } from './hooks/useApp'
import Layout from './components/Layout'

function AppInner() {
  const { refreshSessions, state } = useApp()

  useEffect(() => { refreshSessions() }, [refreshSessions])

  return (
    <div className="app">
      {state.error && (
        <div className="global-error">
          <span>{state.error}</span>
          <button onClick={() => state.error && null}>x</button>
        </div>
      )}
      <Layout />
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  )
}
