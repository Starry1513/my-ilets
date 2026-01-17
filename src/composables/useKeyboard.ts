/**
 * 跨平台键盘工具函数
 * 解决 Mac 上 Alt 键（Option 键）的兼容性问题
 */

/**
 * 检测是否为 Mac 平台
 */
export function isMac(): boolean {
  if (typeof window === 'undefined')
    return false
  return /Mac|iPhone|iPod|iPad/i.test(navigator.platform) || /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent)
}

/**
 * 检测 Alt 键是否被按下（跨平台兼容）
 * 在 Mac 上，Option 键对应 Alt 键
 * 
 * @param e 键盘事件
 * @returns 如果 Alt/Option 键被按下则返回 true
 */
export function isAltKeyPressed(e: KeyboardEvent): boolean {
  // 优先使用 getModifierState，这是最可靠的方法
  if (e.getModifierState('Alt') || e.getModifierState('AltGraph'))
    return true
  
  // 回退到 altKey 属性
  if (e.altKey)
    return true
  
  // 在 Mac 上，某些情况下可能需要检查 metaKey（虽然通常 metaKey 是 Cmd 键）
  // 但为了兼容性，我们只在明确是 Mac 且 altKey 为 false 时才检查
  // 注意：这个检查可能不是必需的，因为 Mac 的 Option 键通常会被识别为 altKey
  // 保留此代码作为额外的兼容性检查
  if (isMac() && e.metaKey && !e.ctrlKey) {
    // 在某些特殊情况下，Mac 的 Option 键可能被映射为 metaKey
    // 但这种情况比较少见，所以注释掉，只在需要时启用
    // return true
  }
  
  return false
}

