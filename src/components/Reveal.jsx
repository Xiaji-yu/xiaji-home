import { useReveal } from '../hooks/useReveal.js'

/**
 * 包一层就能获得「滚动到就淡入上浮」的效果
 *
 * <Reveal delay={120}>内容</Reveal>
 *
 * @param as     渲染成什么标签，默认 div
 * @param delay  延迟多少毫秒出现（做错落感用）
 */
export default function Reveal({
  as: Tag = 'div',
  delay = 0,
  className = '',
  style,
  children,
  ...rest
}) {
  const ref = useReveal()
  return (
    <Tag
      ref={ref}
      className={`reveal ${className}`.trim()}
      style={{ '--d': `${delay}ms`, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  )
}
