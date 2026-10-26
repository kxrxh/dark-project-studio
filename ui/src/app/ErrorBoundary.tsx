import type { ReactNode } from "react";
import { Component } from "react";

export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="empty-state" role="alert">
          <h1>Не удалось показать редактор</h1>
          <p>
            Перезагрузите редактор, чтобы продолжить. Несохранённые изменения
            могут быть потеряны.
          </p>
          <button className="primary" onClick={() => window.location.reload()}>
            Перезагрузить редактор
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
