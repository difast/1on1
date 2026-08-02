import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './i18n'
import './styles/index.css'

// react-router-dom удалён из зависимостей. Он использовался только как обёртка
// <BrowserRouter> вокруг приложения: ни один компонент не обращался к его
// контексту (нет <Routes>, <Link>, useNavigate, useLocation) — маршрут
// определяется вручную по window.location.pathname в App.jsx. Обёртка ничего не
// делала, но тянула за собой поток уязвимостей серверных режимов роутера
// (SSR, RSC, single-fetch), не применимых к этому SPA.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary fullScreen>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)