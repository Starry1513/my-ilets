export interface ReviewRecord {
  reviewDate: number // 复习时间戳
  level: number // 复习级别（0-6，表示第几次复习）
}

export interface ErrorWord {
  id: number
  word: string[]
  pos: string
  meaning: string
  example: string
  extra: string
  category: string
  addedAt: number // 添加时间戳
  reviewRecords?: ReviewRecord[] // 复习记录
  nextReviewDate?: number // 下次复习时间戳
  isSpecialAttention?: boolean // 是否特别注意
}

const ERROR_BOOK_KEY = 'vocabulary_error_book'

// 获取错题本所有单词
export function getErrorWords(): ErrorWord[] {
  const stored = localStorage.getItem(ERROR_BOOK_KEY)
  if (!stored)
    return []
  try {
    return JSON.parse(stored)
  }
  catch {
    return []
  }
}

// 添加单词到错题本
export function addToErrorBook(word: ErrorWord): boolean {
  const words = getErrorWords()
  // 检查是否已存在（通过id和category判断）
  const exists = words.some(w => w.id === word.id && w.category === word.category)
  if (exists)
    return false

  const newWord: ErrorWord = {
    ...word,
    addedAt: Date.now(),
    // 显式初始化所有可选字段，确保数据完整性
    reviewRecords: word.reviewRecords || [],
    nextReviewDate: word.nextReviewDate || undefined,
    isSpecialAttention: word.isSpecialAttention === true, // 显式检查 true
  }
  words.push(newWord)
  localStorage.setItem(ERROR_BOOK_KEY, JSON.stringify(words))
  return true
}

// 从错题本移除单词
export function removeFromErrorBook(id: number, category: string): void {
  const words = getErrorWords()
  const filtered = words.filter(w => !(w.id === id && w.category === category))
  localStorage.setItem(ERROR_BOOK_KEY, JSON.stringify(filtered))
}

// 检查单词是否在错题本中
export function isInErrorBook(id: number, category: string): boolean {
  const words = getErrorWords()
  return words.some(w => w.id === id && w.category === category)
}

// 清空错题本
export function clearErrorBook(): void {
  localStorage.removeItem(ERROR_BOOK_KEY)
}

// 导出错题本为JSON（包含特别注意的单词统计）
export function exportErrorBook(): string {
  const words = getErrorWords()

  // 确保所有单词都有完整的字段（规范化数据）
  const normalizedWords = words.map(word => ({
    ...word,
    reviewRecords: word.reviewRecords || [],
    nextReviewDate: word.nextReviewDate || undefined,
    isSpecialAttention: word.isSpecialAttention === true, // 显式检查 true，确保导出正确的布尔值
  }))

  // 筛选出特别注意的单词
  const specialAttentionWords = normalizedWords.filter(w => w.isSpecialAttention === true)

  // 构建导出数据，包含完整单词列表和特别注意单词列表
  const exportData = {
    exportDate: new Date().toISOString(),
    totalWords: normalizedWords.length,
    specialAttentionCount: specialAttentionWords.length,
    allWords: normalizedWords,
    specialAttentionWords: specialAttentionWords,
  }

  return JSON.stringify(exportData, null, 2)
}

// 导入错题本
export function importErrorBook(json: string): { success: boolean; message: string; count: number } {
  try {
    const parsed = JSON.parse(json)

    // 兼容新旧格式：新格式是对象（包含allWords字段），旧格式是数组
    let words: ErrorWord[]
    if (Array.isArray(parsed)) {
      // 旧格式：直接是数组
      words = parsed
    } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.allWords)) {
      // 新格式：包含allWords字段的对象
      words = parsed.allWords
    } else {
      return { success: false, message: '导入数据格式错误：必须是数组或包含allWords字段的对象', count: 0 }
    }

    // 验证数据结构
    for (const word of words) {
      if (!word.id || !word.word || !word.category)
        return { success: false, message: '导入数据格式错误：缺少必要字段', count: 0 }
    }

    // 规范化导入的数据，确保所有可选字段都存在
    const normalizedWords = words.map(word => ({
      ...word,
      reviewRecords: word.reviewRecords || [],
      nextReviewDate: word.nextReviewDate || undefined,
      isSpecialAttention: word.isSpecialAttention === true, // 显式检查 true
    }))

    // 合并到现有错题本（智能合并）
    const existing = getErrorWords()
    const existingMap = new Map(existing.map(w => [`${w.id}-${w.category}`, w]))

    let newCount = 0
    let updatedCount = 0

    const merged = normalizedWords.map(importWord => {
      const key = `${importWord.id}-${importWord.category}`
      const existingWord = existingMap.get(key)

      if (existingWord) {
        // 单词已存在，智能合并信息
        updatedCount++

        // 合并复习记录（按时间戳去重）
        const allRecords = [...(existingWord.reviewRecords || []), ...(importWord.reviewRecords || [])]
        const recordMap = new Map(allRecords.map(r => [r.reviewDate, r]))
        const mergedRecords = Array.from(recordMap.values()).sort((a, b) => a.reviewDate - b.reviewDate)

        return {
          ...existingWord,
          // 特别注意：如果任意一方为 true，结果为 true
          isSpecialAttention: existingWord.isSpecialAttention === true || importWord.isSpecialAttention === true,
          // 使用合并后的复习记录
          reviewRecords: mergedRecords,
          // 重新计算下次复习时间
          nextReviewDate: calculateNextReviewDate({
            ...existingWord,
            reviewRecords: mergedRecords,
          }),
        }
      } else {
        // 新单词
        newCount++
        existingMap.set(key, importWord)
        return importWord
      }
    })

    // 添加导入数据中不存在但本地存在的单词
    for (const existingWord of existing) {
      const key = `${existingWord.id}-${existingWord.category}`
      if (!normalizedWords.some(w => `${w.id}-${w.category}` === key)) {
        merged.push(existingWord)
      }
    }

    localStorage.setItem(ERROR_BOOK_KEY, JSON.stringify(merged))

    if (updatedCount > 0) {
      return {
        success: true,
        message: `成功导入 ${newCount} 个新单词，更新 ${updatedCount} 个已存在单词`,
        count: newCount
      }
    } else {
      return {
        success: true,
        message: `成功导入 ${newCount} 个单词`,
        count: newCount
      }
    }
  }
  catch (error) {
    return { success: false, message: `导入失败：${error instanceof Error ? error.message : '未知错误'}`, count: 0 }
  }
}

// 获取错题本统计信息
export function getErrorBookStats() {
  const words = getErrorWords()
  return {
    total: words.length,
    byCategory: words.reduce((acc, word) => {
      acc[word.category] = (acc[word.category] || 0) + 1
      return acc
    }, {} as Record<string, number>),
  }
}

// 遗忘曲线复习间隔（天）：1天、2天、4天、7天、15天、30天、60天
const REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30, 60]

// 计算下次复习时间
export function calculateNextReviewDate(word: ErrorWord): number {
  const now = Date.now()
  
  // 如果没有复习记录，使用添加时间作为起点
  if (!word.reviewRecords || word.reviewRecords.length === 0) {
    // 第一次复习：添加后1天
    const firstReview = new Date(word.addedAt)
    firstReview.setDate(firstReview.getDate() + REVIEW_INTERVALS[0])
    return firstReview.getTime()
  }
  
  // 获取最后一次复习记录
  const lastReview = word.reviewRecords[word.reviewRecords.length - 1]
  const currentLevel = lastReview.level
  
  // 如果已经完成所有复习级别，不再需要复习
  if (currentLevel >= REVIEW_INTERVALS.length - 1) {
    return 0 // 0 表示已完成所有复习
  }
  
  // 计算下次复习时间：最后一次复习时间 + 对应间隔
  const nextLevel = currentLevel + 1
  const intervalDays = REVIEW_INTERVALS[nextLevel]
  const nextReview = new Date(lastReview.reviewDate)
  nextReview.setDate(nextReview.getDate() + intervalDays)
  
  return nextReview.getTime()
}

// 标记单词为已复习
export function markWordAsReviewed(wordId: number, category: string): boolean {
  const words = getErrorWords()
  const word = words.find(w => w.id === wordId && w.category === category)
  
  if (!word) return false
  
  // 初始化复习记录数组
  if (!word.reviewRecords) {
    word.reviewRecords = []
  }
  
  // 计算当前复习级别
  const currentLevel = word.reviewRecords.length
  
  // 如果已完成所有复习，不再添加
  if (currentLevel >= REVIEW_INTERVALS.length) {
    return false
  }
  
  // 添加复习记录
  word.reviewRecords.push({
    reviewDate: Date.now(),
    level: currentLevel,
  })
  
  // 计算下次复习时间
  word.nextReviewDate = calculateNextReviewDate(word)
  
  // 保存
  localStorage.setItem(ERROR_BOOK_KEY, JSON.stringify(words))
  return true
}

// 获取待复习的单词列表
export function getWordsToReview(): ErrorWord[] {
  const words = getErrorWords()
  const now = Date.now()
  
  return words.filter(word => {
    // 如果没有设置下次复习时间，计算它
    if (!word.nextReviewDate) {
      word.nextReviewDate = calculateNextReviewDate(word)
    }
    
    // 如果已完成所有复习（nextReviewDate === 0），不显示
    if (word.nextReviewDate === 0) {
      return false
    }
    
    // 如果到了复习时间（允许提前1小时开始复习）
    return word.nextReviewDate <= now + 60 * 60 * 1000
  }).sort((a, b) => {
    // 按复习时间排序，即将到期的优先
    const aDate = a.nextReviewDate || 0
    const bDate = b.nextReviewDate || 0
    return aDate - bDate
  })
}

// 获取复习计划统计
export function getReviewStats() {
  const words = getErrorWords()
  const now = Date.now()
  
  let todayCount = 0
  let tomorrowCount = 0
  let thisWeekCount = 0
  let overdueCount = 0
  let completedCount = 0
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const nextWeek = new Date(today)
  nextWeek.setDate(nextWeek.getDate() + 7)
  
  words.forEach(word => {
    if (!word.nextReviewDate) {
      word.nextReviewDate = calculateNextReviewDate(word)
    }
    
    if (word.nextReviewDate === 0) {
      completedCount++
      return
    }
    
    const reviewDate = new Date(word.nextReviewDate)
    
    if (reviewDate < now) {
      overdueCount++
    }
    else if (reviewDate < tomorrow) {
      todayCount++
    }
    else if (reviewDate < nextWeek) {
      thisWeekCount++
      if (reviewDate < new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)) {
        tomorrowCount++
      }
    }
  })
  
  return {
    today: todayCount,
    tomorrow: tomorrowCount,
    thisWeek: thisWeekCount,
    overdue: overdueCount,
    completed: completedCount,
    total: words.length,
  }
}

// 格式化复习时间显示
export function formatReviewDate(timestamp: number): string {
  if (timestamp === 0) return '已完成'
  
  const now = Date.now()
  const reviewDate = new Date(timestamp)
  const diff = timestamp - now
  
  // 已过期
  if (diff < 0) {
    const days = Math.floor(Math.abs(diff) / (24 * 60 * 60 * 1000))
    if (days === 0) return '今天过期'
    return `已过期 ${days} 天`
  }
  
  // 今天
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const reviewToday = new Date(reviewDate)
  reviewToday.setHours(0, 0, 0, 0)
  
  if (reviewToday.getTime() === today.getTime()) {
    return '今天'
  }
  
  // 明天
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (reviewToday.getTime() === tomorrow.getTime()) {
    return '明天'
  }
  
  // 未来几天
  const days = Math.floor(diff / (24 * 60 * 60 * 1000))
  if (days <= 7) {
    return `${days} 天后`
  }
  
  // 格式化日期
  const month = reviewDate.getMonth() + 1
  const day = reviewDate.getDate()
  return `${month}月${day}日`
}

// 切换单词的特别注意状态
export function toggleSpecialAttention(wordId: number, category: string): boolean {
  const words = getErrorWords()
  const word = words.find(w => w.id === wordId && w.category === category)

  if (!word) return false

  // 切换特别注意状态（确保 boolean 值的正确性）
  word.isSpecialAttention = !(word.isSpecialAttention === true)

  // 保存
  localStorage.setItem(ERROR_BOOK_KEY, JSON.stringify(words))
  return true
}

// 检查单词是否为特别注意
export function isSpecialAttention(wordId: number, category: string): boolean {
  const words = getErrorWords()
  const word = words.find(w => w.id === wordId && w.category === category)
  return word?.isSpecialAttention === true
}

