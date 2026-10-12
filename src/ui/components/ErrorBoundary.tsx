import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode; /** Changing this (e.g. the route) clears a previous error. */ resetKey?: string; onBack?: () => void; onReport?: () => void; label?: string }
interface State { error: Error | null }

/**
 * A screen that throws (or whose code chunk fails to load) must never leave a black page. This shows what happened in plain words with a way
 * out, and clears itself when the route changes. The error text is kept for the "Report a problem" form via the diagnostics buffer.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }
  static getDerivedStateFromError(error: Error): State { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo): void {
    try { (window as unknown as { __lastScreenError?: string }).__lastScreenError = `${error.message}\n${(info.componentStack ?? '').slice(0, 600)}` } catch { /* diagnostics are best effort */ }
    console.error('Screen failed to render', error)
  }
  componentDidUpdate(prev: Props): void { if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null }) }
  render(): ReactNode {
    if (!this.state.error) return this.props.children
    const loadFail = /Failed to fetch dynamically imported|Unable to preload|Importing a module script failed|Loading chunk|error loading dynamically/i.test(this.state.error.message)
    return (
      <section className="screen-error" role="alert" data-testid="screen-error">
        <h1 className="display">{loadFail ? 'This screen could not be loaded' : 'This screen hit a problem'}</h1>
        <p className="dim">{loadFail ? 'A piece of the game did not download (a dropped connection or an out-of-date copy of the page). Your career is safe and has not been changed.' : 'Something unexpected happened while drawing this screen. Your career is safe and has not been changed.'}</p>
        <div className="screen-error-actions">
          <button type="button" className="btn primary" onClick={() => (loadFail ? window.location.reload() : this.setState({ error: null }))}>{loadFail ? 'Reload the game' : 'Try again'}</button>
          {this.props.onBack && <button type="button" className="btn" onClick={this.props.onBack}>{this.props.label ?? 'Back to Overview'}</button>}
          {this.props.onReport && <button type="button" className="btn ghost" onClick={this.props.onReport}>Report a problem</button>}
        </div>
        <details className="dim"><summary>Technical detail</summary><pre>{this.state.error.message}</pre></details>
      </section>
    )
  }
}
