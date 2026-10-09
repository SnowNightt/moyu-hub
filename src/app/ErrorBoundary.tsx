import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('MoyuHub UI error', error.message, info.componentStack);
  }
  render() {
    return this.state.failed ? (
      <main className="app-boot-error">
        <h1>界面暂时无法显示</h1>
        <p>请重新打开应用。</p>
        <button className="ui-button-primary" onClick={() => window.location.reload()}>
          重新加载
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
