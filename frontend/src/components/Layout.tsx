import Sidebar from './Sidebar'
import ChatPanel from './ChatPanel'

export default function Layout() {
  return (
    <div className="layout">
      <aside className="sidebar-panel"><Sidebar /></aside>
      <main className="chat-panel"><ChatPanel /></main>
    </div>
  )
}
