import { Component } from 'react'

/*
 * Граница ошибок. Без неё любое исключение в рендере размонтирует всё дерево
 * React, и вместо интерфейса остаётся пустая страница — тот самый «чёрный
 * экран» при нажатии на кнопку. Граница ловит исключение, показывает понятное
 * сообщение и даёт вернуться, не перезагружая вкладку вручную.
 *
 * Это защита, а не замена исправлению: сами падения чинятся в коде компонентов.
 * Ошибка выводится в консоль, чтобы причина оставалась видимой в разработке.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Ошибка рендера:', error, info?.componentStack)
  }

  componentDidUpdate(prevProps) {
    // Смена раздела сбрасывает ошибку: пользователь ушёл с проблемного экрана,
    // и держать его на заглушке больше незачем.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    const { title, message, retryLabel, onRetry } = this.props
    return (
      <div style={{
        minHeight: this.props.fullScreen ? '100vh' : 240,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, background: 'var(--color-bg)',
      }}>
        <div className="card" style={{ padding: 24, maxWidth: 440, textAlign: 'center' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8 }}>
            {title || 'Не удалось отобразить раздел'}
          </h3>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 18 }}>
            {message || 'Произошла ошибка при отрисовке. Остальные разделы продолжают работать.'}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-accent btn-sm" onClick={() => {
              this.setState({ error: null })
              onRetry?.()
            }}>{retryLabel || 'Попробовать снова'}</button>
            <button className="btn btn-secondary btn-sm" onClick={() => window.location.reload()}>
              Перезагрузить страницу
            </button>
          </div>
        </div>
      </div>
    )
  }
}
