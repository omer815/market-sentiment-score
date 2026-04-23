import { Dashboard } from './pages/Dashboard.js';

export function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>Market Sentiment Score</h1>
        <p className="app-header__subtitle">
          A 0–100 buy/sell score from four sources, refreshed every 30 minutes.
        </p>
      </header>
      <Dashboard />
      <footer className="app-footer">
        <small>Data: Yahoo Finance (VIX / S&amp;P 500 / S5FI) and CNN dataviz (Fear &amp; Greed).</small>
      </footer>
    </main>
  );
}
