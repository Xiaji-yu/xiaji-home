/* ==========================================================================
   全站文案都在这里 —— 想改内容，只改这一个文件就够了
   改完保存，浏览器会立刻刷新，不需要重启任何东西
   ========================================================================== */

export const site = {
  /* ---- 基本信息（改这里最省事） ---- */
  name: '夏祭',
  nameEn: 'XIAJI',
  email: 'variant305@gmail.com',
  github: 'https://github.com/Xiaji-yu', // ← 换成你的 GitHub 主页

  /* ---- 首页大标题：两行英文，参考图就是这么排的 ---- */
  heroTitle: ['Truth Fades.', 'Stone Remains.'],

  /* ---- 大标题下面的副标题 ---- */
  heroSub:
    '真理会过时，构石永恒。所有此刻看起来板上钉钉的结论，迟早都会被更好的答案推翻；但把它们一块一块砌起来的过程，是留得住的。',

  /* ---- 首屏两颗按钮 ---- */
  heroCta: [
    { label: 'About Me', href: '#about', solid: true },
    { label: 'See My Work', href: '#work', solid: false },
  ],

  /* ---- 首屏最下面那条状态栏 ---- */
  heroStatus: {
    left: '真理会过时，构石永恒',
    right: '向下滚动 · SCROLL',
  },

  /* ---- 关于我 ---- */
  about: {
    lead: '我是夏祭，一个编程爱好者。比起「学会某个框架」，我更在意能不能把脑子里的东西真的做出来，并且做得干净、做得耐用。',
    paragraphs: [
      '开始写代码的时间其实不算长，所以这一页上暂时没有什么拿得出手的战绩 —— 但它是真的，每一行都是自己敲出来的。',
      '我偏爱那种克制、有网格感的设计：黑白灰、细边框、把信息摆整齐，不用花哨的渐变和阴影。这个页面就是照这个审美做的。',
      '如果你也在做类似的事情，或者只是想随便聊聊，欢迎给我写邮件。',
    ],
    facts: [
      ['昵称', '夏祭'],
      ['身份', '编程爱好者'],
      ['座右铭', '真理会过时，构石永恒'],
      ['最近在做', '打磨这个主页，补前端与图形学'],
      ['邮箱', 'variant305@gmail.com'],
      ['博客', 'https://xiaji.xin'],
      /* 下面两格显示在信息区右下角（像身份证的"签发机关 / 有效期限"那一对），
         换成你自己的就行 */
      ['坐标', '上海'],
      ['建站于', '2026.09'],
    ],
  },

  /* ---- 技能栈：value 是 0~100 的自评，随便改 ---- */
  skills: [
    { name: 'React', note: '组件 / 状态 / 工程化', value: 49 },
    { name: 'TypeScript', note: '类型 / 少写 bug', value: 58 },
    { name: 'Git & GitHub', note: '版本 / 协作', value: 64 },
    { name: 'Node.js', note: '脚本 / 小工具', value: 57 },
    { name: 'Python', note: '自动化 / 数据处理', value: 80 },
  ],

  /* ---- 项目作品：这三个是占位，替换成你自己的就行 ---- */
  projects: [
    {
      id: '01',
      title: 'Dither',
      titleCn: '点阵图像转换器',
      desc: '把任意图片转换成黑白点阵/噪点风格的小工具 —— 这个主页上那座山，用的就是同一套思路。',
      tags: ['Canvas', 'JavaScript', 'Vite'],
      year: '2026',
      link: '', // 填上链接就会变成可点击的
    },
    {
      id: '02',
      title: 'NoteWall',
      titleCn: '便签墙',
      desc: '页面下方那块留言板的独立版本：写便签、存在本地、随手撕掉，完全不需要服务器。',
      tags: ['React', 'localStorage'],
      year: '2026',
      link: '',
    },
    {
      id: '03',
      title: 'Sandglass',
      titleCn: '时间记录器',
      desc: '记录每天的时间花在了哪里，用最少的操作完成打卡，月底给出一张很直白的图。',
      tags: ['Node.js', 'CLI'],
      year: '2025',
      link: '',
    },
  ],

  /* ---- 经历时间线 ---- */
  timeline: [
    {
      year: '2024.03',
      title: '第一行代码',
      text: '从一句 Hello World 开始。当时完全看不懂红色的报错，但看到终端里跳出字的那一下，确实有点上头。',
    },
    {
      year: '2024.09',
      title: '做出第一个能跑的小工具',
      text: '一个自己每天都会用到的脚本。第一次体会到：写代码不是为了交作业，是为了解决自己的麻烦。',
    },
    {
      year: '2025.09',
      title: '认真学AI&前端',
      text: 'HTML / CSS / JavaScript 从头过一遍，然后是 React。开始在意间距、对齐和字体 —— 审美也是要练的。',
    },
    {
      year: '2026.09',
      title: '搭起这个个人主页',
      text: '就是你正在看的这一页。那座点阵山景是浏览器现场算出来的，整页没有用任何一张图片素材。',
    },
  ],

  /* ---- 联系方式 ---- */
  contact: {
    headline: '写点什么给我。',
    sub: '邮件是我最常用的联系方式，一般都会回。',
    channels: [
      {
        label: 'Email',
        value: 'variant305@gmail.com',
        href: 'mailto:variant305@gmail.com',
        note: '推荐',
      },
      {
        label: 'GitHub',
        value: 'github.com/Xiaji-yu',
        href: 'https://github.com/Xiaji-yu',
        note: '代码都在这里',
      },
      {
        label: 'Steam / Discord / QQ',
        value: '待补充',
        href: '',
        note: '诶嘿，先不填',
      },
    ],
  },

  /* ---- 留言便签 ---- */
  notes: {
    headline: '留一张便签。',
    sub: '最多 100 字。便签存在你自己这台电脑的浏览器里，刷新不会丢，点右上角的 × 可以撕掉。别人看不到你写的，你也看不到别人写的。',
    maxLength: 100,
    placeholder: '想说什么就写点什么……',
  },

  /* ---- 页脚 ---- */
  footer: {
    tagline: '真理会过时，构石永恒。',
    copyright: '© 2026 夏祭 · 保留所有权利',
    credit: 'Designed & Built by 夏祭',
    /* ---- 备案号：工信部 ICP + 公安网安备（图标见 src/assets/beian-icon.png）---- */
    beian: {
      icpLabel: 'ICP备案',
      icpNumber: '沪ICP备2026007186号',
      icpUrl: 'https://beian.miit.gov.cn/',
      gaLabel: '公网安备',
      gaNumber: '沪公网安备31011202022181号',
      gaUrl: 'http://www.beian.gov.cn/',
    },
    /* 页脚左下角的四个小方块。href 留空就是不可点击的占位 */
    socials: [
      { code: 'ML', title: '写邮件', href: 'mailto:variant305@gmail.com' },
      { code: 'GH', title: 'GitHub', href: 'https://github.com/Xiaji-yu' },
      { code: 'DC', title: 'Discord（待补充）', href: '' },
      { code: 'ST', title: 'Steam（待补充）', href: '' },
    ],
    columns: [
      {
        head: '本站导航',
        headEn: 'Navigate',
        links: [
          { label: '关于我', href: '#about' },
          { label: '技能栈', href: '#skills' },
          { label: '项目作品', href: '#work' },
          { label: '经历', href: '#journey' },
        ],
      },
      {
        head: '找到我',
        headEn: 'Find Me',
        links: [
          { label: '写邮件给我', href: 'mailto:variant305@gmail.com' },
          { label: 'GitHub', href: 'https://github.com/Xiaji-yu' },
          { label: '留言便签', href: '#notes' },
          { label: '回到顶部', href: '#top' },
        ],
      },
      {
        head: '关于这一页',
        headEn: 'Notes',
        links: [
          { label: '纯静态页面，无后端', href: '#notes' },
          { label: '便签只存在本地浏览器', href: '#notes' },
          { label: '没有使用任何图片素材', href: '#top' },
          { label: 'React + Vite 手写实现', href: '#top' },
        ],
      },
    ],
  },
}

/* ---- 顶部导航 ---- */
/* ---- 左侧选项卡的六项（中文大字 + 英文小标签，和各个板块的标题一致） ---- */
export const sectionTabs = [
  { id: 'about', cn: '关于我', en: 'About' },
  { id: 'skills', cn: '技能栈', en: 'Skills' },
  { id: 'work', cn: '项目作品', en: 'Work' },
  { id: 'journey', cn: '经历', en: 'Journey' },
  { id: 'contact', cn: '联系方式', en: 'Contact' },
  { id: 'notes', cn: '留言便签', en: 'Notes' },
]

export const navLinks = [
  { label: 'About', href: '#about' },
  { label: 'Skills', href: '#skills' },
  { label: 'Work', href: '#work' },
  { label: 'Journey', href: '#journey' },
  { label: 'Contact', href: '#contact' },
  { label: 'Notes', href: '#notes' },
]
