import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught component error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 flex-col p-4 text-center">
                    <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-6 shadow-sm">
                        <AlertTriangle className="w-8 h-8" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Đã xảy ra lỗi không mong muốn</h1>
                    <p className="text-gray-500 max-w-md mb-8">
                        Hệ thống đã ghi nhận lỗi. Vui lòng thử tải lại trang hoặc liên hệ hỗ trợ nếu nội dung vẫn không hiển thị.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
                    >
                        <RefreshCcw className="w-4 h-4" />
                        Tải lại trang
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
