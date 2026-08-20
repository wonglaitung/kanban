import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { CommentCountsProvider } from './context/CommentCountsProvider'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CommentCountsProvider>
      <App />
    </CommentCountsProvider>
  </React.StrictMode>,
)
