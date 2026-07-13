import { Component, type ReactNode } from "react"

interface Props { children: ReactNode }
interface State { hasError: boolean; message: string }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex flex-col items-center justify-center gap-4 bg-background text-muted-foreground">
          <p className="text-lg font-semibold">应用出错了</p>
          <p className="text-sm">{this.state.message}</p>
          <button
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm"
            onClick={() => window.location.reload()}
          >
            重新加载
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
