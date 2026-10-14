import React from 'react'
import { createRoot } from 'react-dom/client'

// 必须先令牌与全局、再 App（组件）：ESM 按顺序求值，打包后 base.css 才会排在
// 组件 CSS 之前。反过来的话，同特异性下后出现的 .mono 会盖掉组件里的字号/字距
// 声明（.hero__status 的窄屏档、.header__pct、.skill__val、.foot__beian 全中过）
import './styles/tokens.css'
import './styles/base.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
