interface NavigationProps {
  currentView: 'dashboard' | 'aggregators' | 'settings';
  onNavigate: (view: 'dashboard' | 'aggregators' | 'settings') => void;
}

function Navigation({ currentView, onNavigate }: NavigationProps) {
  return (
    <nav className="sidebar-nav">
      <div className="nav-logo">
        <h3>Nia Mini Connector</h3>
        <div className="nav-subtitle">On-Premise Agent</div>
      </div>

      <div className="nav-section-label">Navigation</div>
      <ul className="nav-menu">
        <li>
          <button
            onClick={() => onNavigate('dashboard')}
            className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
          >
            <span className="nav-icon">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
                <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
                <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
                <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
              </svg>
            </span>
            <span className="nav-label">Dashboard</span>
          </button>
        </li>
        <li>
          <button
            onClick={() => onNavigate('aggregators')}
            className={`nav-item ${currentView === 'aggregators' ? 'active' : ''}`}
          >
            <span className="nav-icon">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <ellipse cx="8" cy="4" rx="6" ry="2.5" />
                <path d="M2 4v4c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V4" />
                <path d="M2 8v4c0 1.38 2.69 2.5 6 2.5s6-1.12 6-2.5V8" />
              </svg>
            </span>
            <span className="nav-label">Connections</span>
          </button>
        </li>
        <li>
          <button
            onClick={() => onNavigate('settings')}
            className={`nav-item ${currentView === 'settings' ? 'active' : ''}`}
          >
            <span className="nav-icon">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="2.5" />
                <path d="M13.3 10a1.1 1.1 0 00.22 1.21l.04.04a1.33 1.33 0 11-1.89 1.89l-.04-.04a1.1 1.1 0 00-1.21-.22 1.1 1.1 0 00-.67 1.01v.11a1.33 1.33 0 11-2.67 0v-.06a1.1 1.1 0 00-.72-1.01 1.1 1.1 0 00-1.21.22l-.04.04a1.33 1.33 0 11-1.89-1.89l.04-.04a1.1 1.1 0 00.22-1.21 1.1 1.1 0 00-1.01-.67h-.11a1.33 1.33 0 010-2.67h.06a1.1 1.1 0 001.01-.72 1.1 1.1 0 00-.22-1.21l-.04-.04a1.33 1.33 0 111.89-1.89l.04.04a1.1 1.1 0 001.21.22h.05a1.1 1.1 0 00.67-1.01v-.11a1.33 1.33 0 012.67 0v.06a1.1 1.1 0 00.67 1.01 1.1 1.1 0 001.21-.22l.04-.04a1.33 1.33 0 111.89 1.89l-.04.04a1.1 1.1 0 00-.22 1.21v.05a1.1 1.1 0 001.01.67h.11a1.33 1.33 0 010 2.67h-.06a1.1 1.1 0 00-1.01.67z" />
              </svg>
            </span>
            <span className="nav-label">Settings</span>
          </button>
        </li>
      </ul>

      <div className="nav-footer">
        <span className="nav-version">v1.0.0</span>
      </div>
    </nav>
  );
}

export default Navigation;
