import type { DiagnosticTerminal as DiagnosticTerminalData } from "@/lib/redefined";

type DiagnosticTerminalProps = {
  terminal: DiagnosticTerminalData;
};

export function DiagnosticTerminal({ terminal }: DiagnosticTerminalProps) {
  return (
    <section className="diagnostic-terminal" id="diagnostic-terminal">
      <div className="terminal-header">
        <div>
          <p className="terminal-kicker">Command workspace</p>
          <h3>{terminal.title}</h3>
          <p>Generated commands from the current next best action.</p>
        </div>
        <div className="terminal-mode">
          <span />
          {terminal.shell}
        </div>
      </div>

      <div className="terminal-body">
        {terminal.commands.map((item) => (
          <div className={`terminal-line terminal-${item.category ?? "generic"}`} key={item.id}>
            <span>$</span>
            <code>{item.command}</code>
          </div>
        ))}
        {terminal.notes?.map((note) => (
          <div className="terminal-comment" key={note}>
            <span>#</span>
            <code>{note}</code>
          </div>
        ))}
      </div>

      <div className="terminal-actions">
        <button type="button">Copy all</button>
        <button type="button">Download .ps1</button>
        <button type="button">Add to runbook</button>
      </div>
    </section>
  );
}
