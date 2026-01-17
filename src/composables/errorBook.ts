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

// 导出错题本为JSON
export function exportErrorBook(): string {
  const words = getErrorWords()
  return JSON.stringify(words, null, 2)
}

// 导入错题本
export function importErrorBook(json: string): { success: boolean; message: string; count: number } {
  try {
    const words = JSON.parse(json) as ErrorWord[]
    if (!Array.isArray(words))
      return { success: false, message: '导入数据格式错误：必须是数组', count: 0 }

    // 验证数据结构
    for (const word of words) {
      if (!word.id || !word.word || !word.category)
        return { success: false, message: '导入数据格式错误：缺少必要字段', count: 0 }
    }

    // 合并到现有错题本（去重）
    const existing = getErrorWords()
    const existingKeys = new Set(existing.map(w => `${w.id}-${w.category}`))
    const newWords = words.filter(w => !existingKeys.has(`${w.id}-${w.category}`))

    const merged = [...existing, ...newWords]
    localStorage.setItem(ERROR_BOOK_KEY, JSON.stringify(merged))
    return { success: true, message: `成功导入 ${newWords.length} 个单词，${words.length - newWords.length} 个已存在`, count: newWords.length }
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
  
  // 切换特别注意状态
  word.isSpecialAttention = !word.isSpecialAttention
  
  // 保存
  localStorage.setItem(ERROR_BOOK_KEY, JSON.stringify(words))
  return true
}

// 检查单词是否为特别注意
export function isSpecialAttention(wordId: number, category: string): boolean {
  const words = getErrorWords()
  const word = words.find(w => w.id === wordId && w.category === category)
  return word?.isSpecialAttention || false
}

