/**
 * 跨平台键盘工具函数
 * 在 Mac 上使用 Command 键，在其他平台上使用 Alt 键
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
 * 检测修饰键是否被按下（跨平台兼容）
 * 在 Mac 上检查 Command 键（metaKey），在其他平台上检查 Alt 键
 *
 * @param e 键盘事件
 * @returns 如果修饰键被按下则返回 true
 */
export function isAltKeyPressed(e: KeyboardEvent): boolean {
  if (isMac()) {
    // Mac 上使用 Command 键（metaKey）
    if (e.getModifierState('Meta'))
      return true
    if (e.metaKey)
      return true
  }
  else {
    // 其他平台使用 Alt 键
    if (e.getModifierState('Alt') || e.getModifierState('AltGraph'))
      return true
    if (e.altKey)
      return true
  }

  return false
}

