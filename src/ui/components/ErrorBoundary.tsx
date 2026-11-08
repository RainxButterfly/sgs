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
            <p>可以重新加载界面继续当前对局。刷新整个页面会断开联机，并失去回归对局的机会。</p>
            <div className="fatal-actions">
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  this.setState({ error: null });
                }}
              >
                重新加载界面
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
