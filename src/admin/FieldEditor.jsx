import { labelFor, TEMPLATES } from './sections.js'

/* ==========================================================================
   递归表单编辑器
   --------------------------------------------------------------------------
   不认识的数据结构也能编辑：对象渲染成字段组、数组渲染成可增删排序的
   列表、字符串按长短选输入框或多行文本，数字和布尔各有各的控件。
   每次编辑都走 onChange 整值替换（配合 AdminApp 的 setPath 不可变更新），
   所以只产出合法的 JSON 形状 —— 导入的数据过一遍这里也就被「驯服」了。
   ========================================================================== */

const clone = (value) => JSON.parse(JSON.stringify(value))

/** 值里没配模板的数组，从第一项推导模板：字符串清空、数字归零、对象递归清空 */
function inferTemplate(value) {
  if (typeof value === 'string') return ''
  if (typeof value === 'number') return 0
  if (typeof value === 'boolean') return false
  if (Array.isArray(value)) return value.length ? inferTemplate(value[0]) : ''
  if (value && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value)) out[key] = inferTemplate(value[key])
    return out
  }
  return ''
}

function templateFor(pathKey, sample) {
  const preset = TEMPLATES[pathKey]
  if (preset !== undefined) return clone(preset)
  if (Array.isArray(sample) && sample.length) return clone(inferTemplate(sample[0]))
  return ''
}

/** 多行文本的判定：本身很长，或字段名就是长文案（desc / text / lead …） */
function isLongText(pathKey, value) {
  if (typeof value === 'string' && value.length > 48) return true
  return /(desc|text|lead|sub|placeholder|paragraphs)\b|heroSub/.test(pathKey)
}

/* ---- 字体选择：typography 的三个角色在全部可用字体里挑一个 ----
   fonts 是合并后的清单：font/ 目录内置（kind: local）+ 后台上传；
   ''（默认）永远在第一个。 */
const TYPO_ROLES = /^typography\.(body|heading|mono)$/

function FontSelect({ path, value, onChange, fonts }) {
  const role = path.split('.')[1]
  const list = Array.isArray(fonts) ? fonts : []
  const locals = list.filter((f) => f.kind === 'local')
  const uploaded = list.filter((f) => f.kind !== 'local')
  return (
    <select
      className="adm-input adm-select"
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">
        {role === 'heading' ? '默认（跟随正文字体）' : '默认（Inter / 系统字体栈）'}
      </option>
      {locals.length > 0 && (
        <optgroup label="font/ 目录 · 内置">
          {locals.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
              {f.id !== f.name ? `（${f.id}）` : ''}
            </option>
          ))}
        </optgroup>
      )}
      {uploaded.length > 0 && (
        <optgroup label="后台上传">
          {uploaded.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
              {f.ext ? `（${String(f.ext).toUpperCase()}）` : ''}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  )
}

/* ---- 单个字符串 / 数字 / 布尔控件 ---- */
function ScalarInput({ path, value, onChange }) {
  const pathKey = path.replace(/\.\d+(?=[.[\]]|$)/g, '[]')

  if (typeof value === 'boolean') {
    return (
      <label className="adm-check">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{value ? '开' : '关'}</span>
      </label>
    )
  }

  if (typeof value === 'number') {
    return (
      <input
        className="adm-input adm-input--num"
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      />
    )
  }

  if (isLongText(pathKey, value)) {
    return (
      <textarea
        className="adm-input adm-textarea"
        rows={String(value).length > 120 ? 5 : 3}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  return (
    <input
      className="adm-input"
      type="text"
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/* ---- 数组：增删 + 上移下移，每项递归 ---- */
function ArrayEditor({ path, value, onChange, fonts }) {
  const items = Array.isArray(value) ? value : []
  const pathKey = path.replace(/\.\d+(?=[.[\]]|$)/g, '[]')

  const update = (next) => onChange(next)

  const move = (index, d) => {
    const next = [...items]
    const j = index + d
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    update(next)
  }

  const remove = (index) => update(items.filter((_, i) => i !== index))

  const add = () => update([...items, templateFor(pathKey, items)])

  return (
    <div className="adm-array">
      {items.map((item, i) => (
        <div className="adm-item" key={i}>
          <div className="adm-item__bar mono">
            <span className="adm-item__idx">{String(i + 1).padStart(2, '0')}</span>
            <span className="adm-item__ops">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                title="上移"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === items.length - 1}
                title="下移"
              >
                ↓
              </button>
              <button
                type="button"
                className="is-del"
                onClick={() => remove(i)}
                title="删除"
              >
                ×
              </button>
            </span>
          </div>
          <FieldEditor
            path={`${path}.${i}`}
            value={item}
            fonts={fonts}
            onChange={(next) => update(items.map((v, k) => (k === i ? next : v)))}
          />
        </div>
      ))}
      <button type="button" className="adm-add" onClick={add}>
        + 添加一项
      </button>
    </div>
  )
}

/* ---- 对象：逐字段递归 ---- */
function ObjectEditor({ path, value, onChange, fonts }) {
  const keys = Object.keys(value)
  return (
    <div className="adm-object">
      {keys.map((key) => (
        <div className="adm-field" key={key}>
          <div className="adm-field__label mono">
            {labelFor(path ? `${path}.${key}` : key)}
          </div>
          <FieldEditor
            path={path ? `${path}.${key}` : key}
            value={value[key]}
            fonts={fonts}
            onChange={(next) => onChange({ ...value, [key]: next })}
          />
        </div>
      ))}
    </div>
  )
}

export default function FieldEditor({ path, value, onChange, fonts }) {
  /* 字体角色不进通用表单：值是字体 id，得渲染成「挑字体」下拉 */
  if (TYPO_ROLES.test(path)) {
    return <FontSelect path={path} value={value} onChange={onChange} fonts={fonts} />
  }
  if (Array.isArray(value)) {
    return <ArrayEditor path={path} value={value} onChange={onChange} fonts={fonts} />
  }
  if (value !== null && typeof value === 'object') {
    return <ObjectEditor path={path} value={value} onChange={onChange} fonts={fonts} />
  }
  return <ScalarInput path={path} value={value} onChange={onChange} />
}
