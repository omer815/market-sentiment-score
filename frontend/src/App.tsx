import { Dashboard } from './pages/Dashboard.js';
import { copy } from './lib/copy.js';

export function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>{copy.app.title}</h1>
        <p className="app-header__subtitle">{copy.app.subtitle}</p>
      </header>
      <Dashboard />
      <footer className="app-footer">
        <small>{copy.app.dataFootnote}</small>
      </footer>
    </main>
  );
}
