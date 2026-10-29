/* ==========================================================================
   后台表单的内容地图
   --------------------------------------------------------------------------
   · SECTIONS   左侧分区导航：每个分区编辑哪些字段（content 里的路径）
   · LABELS     字段路径 → 中文名；数组项用 path[] 表示（如 skills[].name）
   · TEMPLATES  数组「添加一项」时新建什么：没有模板的数组从第一项推导
   想给 site.js 加新字段：这里补一个 label，后台就能源编辑它。
   ========================================================================== */

export const SECTIONS = [
  {
    id: 'basic',
    label: '基本信息',
    desc: '站点名、邮箱和分享到微信 / QQ 时的卡片信息',
    fields: ['site.name', 'site.nameEn', 'site.email', 'site.github', 'site.meta'],
  },
  {
    id: 'hero',
    label: '首屏',
    desc: '打开页面第一屏：大标题、副标题、按钮和底部状态栏',
    fields: ['site.heroTitle', 'site.heroSub', 'site.heroCta', 'site.heroStatus'],
  },
  {
    id: 'about',
    label: '关于我',
    desc: '「关于我」一章的正文和信息表',
    fields: ['site.about'],
  },
  {
    id: 'skills',
    label: '技能栈',
    desc: '每项一条，value 是 0~100 的自评',
    fields: ['site.skills'],
  },
  {
    id: 'projects',
    label: '项目作品',
    desc: 'link 留空就是不可点击的卡片',
    fields: ['site.projects'],
  },
  {
    id: 'timeline',
    label: '经历',
    desc: '按时间排的经历条目',
    fields: ['site.timeline'],
  },
  {
    id: 'contact',
    label: '联系方式',
    desc: '标题和各个联系渠道卡片',
    fields: ['site.contact'],
  },
  {
    id: 'notes',
    label: '留言便签',
    desc: '便签墙的说明文字（便签本身存在访客浏览器里，这里改不了）',
    fields: ['site.notes'],
  },
  {
    id: 'footer',
    label: '页脚',
    desc: '标语、备案号、社交方块和三栏链接',
    fields: ['site.footer'],
  },
  {
    id: 'nav',
    label: '导航',
    desc: '页眉链接和章节选项卡。板块 id 只认 about / skills / work / journey / contact / notes',
    fields: ['sectionTabs', 'navLinks'],
  },
]

export const LABELS = {
  name: '站点名',
  nameEn: '英文名（页眉小字）',
  email: '邮箱',
  github: 'GitHub 主页',
  meta: '分享卡片 / SEO',

  'meta.title': '分享标题',
  'meta.description': '分享描述',
  'meta.ogImage': '分享封面图（必须是绝对地址）',
  'meta.twitterCard': 'Twitter 卡片类型',

  heroTitle: '首屏大标题（每行一项）',
  heroSub: '首屏副标题',
  heroCta: '按钮',
  'heroCta[].label': '按钮文案',
  'heroCta[].href': '链接（站内锚点写 #about）',
  'heroCta[].solid': '实心样式',
  heroStatus: '底部状态栏',
  'heroStatus.left': '左栏文字',
  'heroStatus.right': '右栏文字',

  about: '关于我',
  'about.lead': '引导段',
  'about.paragraphs': '正文段落（每段一项）',
  'about.facts': '信息表（每项是 [名称, 内容]）',

  skills: '技能',
  'skills[].name': '技能名',
  'skills[].note': '备注小字',
  'skills[].value': '熟练度（0-100）',

  projects: '项目',
  'projects[].id': '编号（如 01）',
  'projects[].title': '英文名',
  'projects[].titleCn': '中文名',
  'projects[].desc': '描述',
  'projects[].tags': '标签',
  'projects[].year': '年份',
  'projects[].link': '链接（留空不可点击）',

  timeline: '经历',
  'timeline[].year': '时间（如 2026.09）',
  'timeline[].title': '标题',
  'timeline[].text': '正文',

  contact: '联系方式',
  'contact.headline': '标题',
  'contact.sub': '副标题',
  'contact.channels': '渠道卡片',
  'contact.channels[].label': '名称',
  'contact.channels[].value': '显示值',
  'contact.channels[].href': '链接（留空渲染成静态卡片）',
  'contact.channels[].note': '右下角备注',

  notes: '留言便签',
  'notes.headline': '标题',
  'notes.sub': '说明文字',
  'notes.maxLength': '字数上限',
  'notes.placeholder': '输入框占位文本',

  footer: '页脚',
  'footer.tagline': '标语',
  'footer.copyright': '版权行',
  'footer.credit': '署名',
  'footer.beian': '备案信息',
  'footer.beian.icpLabel': 'ICP 标签',
  'footer.beian.icpNumber': 'ICP 备案号',
  'footer.beian.icpUrl': 'ICP 链接',
  'footer.beian.gaLabel': '公安备标签',
  'footer.beian.gaNumber': '公安网安备号',
  'footer.beian.gaUrl': '公安备链接',
  'footer.socials': '社交方块',
  'footer.socials[].code': '两字缩写',
  'footer.socials[].title': '悬停提示',
  'footer.socials[].href': '链接（留空不可点击）',
  'footer.columns': '页脚栏目',
  'footer.columns[].head': '栏目名',
  'footer.columns[].headEn': '英文小标签',
  'footer.columns[].links': '链接列表（href 留空渲染成纯文本）',
  'footer.columns[].links[].label': '文字',
  'footer.columns[].links[].href': '链接',

  sectionTabs: '章节选项卡',
  'sectionTabs[].id': '板块 id',
  'sectionTabs[].cn': '中文名',
  'sectionTabs[].en': '英文名',
  navLinks: '页眉导航',
  'navLinks[].label': '文字',
  'navLinks[].href': '锚点',
}

/** 「添加一项」按钮新建的内容；深拷贝后再放进表单 */
export const TEMPLATES = {
  heroTitle: '',
  heroCta: { label: '新按钮', href: '#', solid: false },
  'about.paragraphs': '',
  'about.facts': ['名称', '内容'],
  skills: { name: '新技能', note: '', value: 50 },
  projects: {
    id: '00',
    title: '',
    titleCn: '',
    desc: '',
    tags: [],
    year: '2026',
    link: '',
  },
  timeline: { year: '2026.09', title: '', text: '' },
  'contact.channels': { label: '', value: '', href: '', note: '' },
  'footer.socials': { code: '··', title: '', href: '' },
  'footer.columns': { head: '新栏目', headEn: '', links: [] },
  'footer.columns[].links': { label: '', href: '' },
  sectionTabs: { id: 'about', cn: '', en: '' },
  navLinks: { label: '', href: '#' },
}

/** label 查找：labelFor('skills.0.name') → LABELS['skills[].name'] */
export function labelFor(path) {
  return LABELS[path.replace(/\.\d+(?=[.[\]]|$)/g, '[]')] || path
}
