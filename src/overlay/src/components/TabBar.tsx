/**
 * TabBar — Horizontal tab strip for switching between
 * Skills, Paragon, and Gear views in the overlay.
 */

type TabId = 'skills' | 'paragon' | 'gear'

interface TabBarProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'skills', label: 'Skills' },
  { id: 'paragon', label: 'Paragon' },
  { id: 'gear', label: 'Gear' }
]

function TabBar({ activeTab, onTabChange }: TabBarProps): React.JSX.Element {
  return (
    <div className="tab-bar">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className={`tab-bar__tab ${activeTab === tab.id ? 'tab-bar__tab--active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export type { TabId }
export default TabBar
