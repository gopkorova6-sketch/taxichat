import { Component } from "react";

// Ловит ошибки рендера внутри Бомбилы: вместо пустого экрана показывает текст ошибки
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("Бомбила: ошибка рендера", error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="p-4 space-y-3 text-center">
        <div className="font-display font-bold text-danger">Что-то пошло не так</div>
        <div className="text-sm text-secondary-text break-words">{String(error?.message ?? error)}</div>
        <button className="btn-accent px-4 py-2 rounded-2xl font-bold" onClick={() => this.setState({ error: null })}>
          Попробовать снова
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
