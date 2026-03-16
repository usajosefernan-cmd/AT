import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
    children: ReactNode;
    name: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error(`Uncaught error in ${this.props.name}:`, error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="p-4 border border-red-500/30 bg-red-500/10 rounded-md flex flex-col items-center justify-center my-2">
                    <h2 className="text-red-500 font-bold mb-2">Crash in {this.props.name}</h2>
                    <pre className="text-[10px] text-red-400 font-mono whitespace-pre-wrap max-w-full overflow-auto">
                        {this.state.error?.toString()}
                    </pre>
                </div>
            );
        }

        return this.props.children;
    }
}
