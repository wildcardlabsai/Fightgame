import { HELP, type HelpTopic } from '../../engine/glossary'

/** A collapsed plain-language note: what the thing is, why it matters, what to do. Native <details>, so it is keyboard- and screen-reader-friendly and never blocks play. */
export function Explain({ topic, label }: { topic: HelpTopic; label?: string }) {
  const h = HELP[topic]
  return (
    <details className="explain" data-help={topic}>
      <summary>{label ?? `What does this mean? ${h.title}`}</summary>
      <dl>
        <div><dt>What it is</dt><dd>{h.what}</dd></div>
        <div><dt>Why it matters</dt><dd>{h.why}</dd></div>
        <div><dt>What you can do</dt><dd>{h.next}</dd></div>
      </dl>
    </details>
  )
}
