import React from 'react';
import { useGameStore } from '../store';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('界面异常', error, info);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="fatal-error">
          <div className="fatal-card">
            <h1>界面出错了</h1>
            <p>可以重新加载，或回到主菜单重新开局。</p>
            <div className="fatal-actions">
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  window.location.reload();
                }}
              >
                重新加载
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  this.setState({ error: null });
                  useGameStore.getState().backToMenu();
                }}
              >
                返回主菜单
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
