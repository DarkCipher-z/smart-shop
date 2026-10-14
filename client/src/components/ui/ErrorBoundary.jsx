import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('SmartShop ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-navy-900 text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-navy-800 border border-red-500/30 rounded-2xl p-8 shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white tracking-tight">
                Something went wrong
              </h2>
              <p className="text-sm text-gray-400">
                An unexpected interface error occurred. Your shop data is safe and untouched.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 bg-navy-900/80 rounded-lg border border-navy-700 text-left overflow-x-auto text-xs font-mono text-red-300 max-h-32">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors shadow-lg shadow-violet-600/20"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Page
              </button>
              <button
                onClick={this.handleReset}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-navy-700 hover:bg-navy-600 text-gray-200 text-sm font-medium transition-colors border border-navy-600"
              >
                <Home className="w-4 h-4" />
                Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
