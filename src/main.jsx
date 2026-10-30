import React from 'react'
import { createRoot } from 'react-dom/client'
import { SiteProvider } from './data/SiteContext.jsx'
import AdminApp from './admin/AdminApp.jsx'

// 必须先令牌与全局、再 App（组件）：ESM 按顺序求值，打包后 base.css 才会排在
// 组件 CSS 之前。反过来的话，同特异性下后出现的 .mono 会盖掉组件里的字号/字距
// 声明（.hero__status 的窄屏档、.header__pct、.skill__val、.foot__beian 全中过）
import './styles/tokens.css'
import './styles/base.css'
import App from './App.jsx'

/* 内容后台挂在 /admin（BASE_URL 兼容子路径部署）。标签标题和 favicon
   的运行时更新在 SiteProvider 里做（跟线上内容走）。 */
const adminRoute = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/admin`
const isAdmin =
  window.location.pathname === adminRoute ||
  window.location.pathname.startsWith(`${adminRoute}/`)

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isAdmin ? (
      /* 后台也包 SiteProvider：共享同一套字体注入（@font-face + --sans /
         --heading / --mono 覆盖）—— 后台界面和登录页跟随站点字体设置，
         不用再实现一遍。content / fonts 拉取对后台是公开接口，无害。 */
      <SiteProvider>
        <AdminApp />
      </SiteProvider>
    ) : (
      <SiteProvider>
        <App />
      </SiteProvider>
    )}
  </React.StrictMode>,
)
