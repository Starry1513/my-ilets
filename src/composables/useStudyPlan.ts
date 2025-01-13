import { useLocalStorage } from '@vueuse/core'

export interface TaskItem {
  id: string
  status: 'completed' | 'pending'
  completedAt?: string // 日期字符串，如 "2023-10-27"
  timeSpent?: number // 总花费时间（秒）
  timerStartTime?: number // 计时器开始时间戳（毫秒）
}

export interface VocabTask extends TaskItem {
  chapter: number
}

export interface ListeningTask extends TaskItem {
  book: number // 12-20
  test: number // 1-4
  section: number // 1-4
}

export interface DailyLog {
  date: string
  vocab: string[] // 完成的章节ID列表
  listening: string[] // 完成的section ID列表
  summary: string // 摘要文本
  totalTime: number // 总花费时间（秒）
}

// 计划配置
const VOCAB_TOTAL_CHAPTERS = 22
const LISTENING_BOOKS = [12, 13, 14, 15, 16, 17, 18, 19, 20] // 剑桥12-20
const TESTS_PER_BOOK = 4
const SECTIONS_PER_TEST = 4
const LISTENING_TOTAL_SECTIONS = LISTENING_BOOKS.length * TESTS_PER_BOOK * SECTIONS_PER_TEST // 144

// 每日目标
const VOCAB_DAILY_GOAL = 2 // 每天2章
const LISTENING_DAILY_GOAL = 16 // 每天16个section

export function useStudyPlan() {
  // 获取或设置开始日期
  const startDate = useLocalStorage<string>('study-plan-start-date', () => {
    return new Date().toISOString().split('T')[0] // 默认为今天
  })

  // 单词任务列表
  const vocabTasks = useLocalStorage<VocabTask[]>('study-plan-vocab-tasks', () => {
    return Array.from({ length: VOCAB_TOTAL_CHAPTERS }, (_, i) => ({
      id: `vocab-ch${i + 1}`,
      chapter: i + 1,
      status: 'pending' as const,
    }))
  })

  // 听力任务列表
  const listeningTasks = useLocalStorage<ListeningTask[]>('study-plan-listening-tasks', () => {
    const tasks: ListeningTask[] = []
    LISTENING_BOOKS.forEach((book) => {
      for (let test = 1; test <= TESTS_PER_BOOK; test++) {
        for (let section = 1; section <= SECTIONS_PER_TEST; section++) {
          tasks.push({
            id: `listening-c${book}t${test}s${section}`,
            book,
            test,
            section,
            status: 'pending' as const,
          })
        }
      }
    })
    return tasks
  })

  // 计算当前是第几天
  const currentDay = computed(() => {
    if (!startDate.value) return 1
    const start = new Date(startDate.value)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    start.setHours(0, 0, 0, 0)
    const diffTime = today.getTime() - start.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    return Math.max(1, diffDays + 1)
  })

  // 计算今日目标
  const todayGoals = computed(() => {
    const today = new Date().toISOString().split('T')[0]

    // 计算今日应该完成的单词章节
    const completedVocabCount = vocabTasks.value.filter(t => t.status === 'completed').length
    const todayVocabStart = completedVocabCount + 1
    const todayVocabEnd = Math.min(completedVocabCount + VOCAB_DAILY_GOAL, VOCAB_TOTAL_CHAPTERS)
    const todayVocabChapters = Array.from(
      { length: todayVocabEnd - todayVocabStart + 1 },
      (_, i) => todayVocabStart + i
    ).filter(ch => ch <= VOCAB_TOTAL_CHAPTERS)

    // 计算今日应该完成的听力section
    const completedListeningCount = listeningTasks.value.filter(t => t.status === 'completed').length
    const todayListeningStart = completedListeningCount + 1
    const todayListeningEnd = Math.min(completedListeningCount + LISTENING_DAILY_GOAL, LISTENING_TOTAL_SECTIONS)
    const todayListeningTasks = listeningTasks.value
      .filter(t => t.status === 'pending')
      .slice(0, LISTENING_DAILY_GOAL)

    return {
      vocab: todayVocabChapters,
      listening: todayListeningTasks,
    }
  })

  // 今日已完成统计
  const todayCompleted = computed(() => {
    const today = new Date().toISOString().split('T')[0]
    const todayVocab = vocabTasks.value.filter(
      t => t.status === 'completed' && t.completedAt === today
    )
    const todayListening = listeningTasks.value.filter(
      t => t.status === 'completed' && t.completedAt === today
    )
    return {
      vocab: todayVocab.length,
      listening: todayListening.length,
    }
  })

  // 总体进度
  const overallProgress = computed(() => {
    const vocabProgress = vocabTasks.value.filter(t => t.status === 'completed').length
    const listeningProgress = listeningTasks.value.filter(t => t.status === 'completed').length
    return {
      vocab: {
        completed: vocabProgress,
        total: VOCAB_TOTAL_CHAPTERS,
        percentage: Math.round((vocabProgress / VOCAB_TOTAL_CHAPTERS) * 100),
      },
      listening: {
        completed: listeningProgress,
        total: LISTENING_TOTAL_SECTIONS,
        percentage: Math.round((listeningProgress / LISTENING_TOTAL_SECTIONS) * 100),
      },
    }
  })

  // 计时器相关状态
  const activeTimerId = ref<string | null>(null) // 当前正在计时的任务ID
  const timerInterval = ref<number | null>(null) // 计时器间隔ID

  // 格式化时间显示（秒 -> HH:MM:SS 或 MM:SS）
  function formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // 获取任务的当前计时时间（包括正在计时的时间）
  function getTaskCurrentTime(taskId: string): number {
    const vocabTask = vocabTasks.value.find(t => t.id === taskId)
    const listeningTask = listeningTasks.value.find(t => t.id === taskId)
    const task = vocabTask || listeningTask

    if (!task) return 0

    let totalTime = task.timeSpent || 0

    // 如果正在计时，加上当前计时的时间
    if (activeTimerId.value === taskId && task.timerStartTime) {
      const elapsed = Math.floor((Date.now() - task.timerStartTime) / 1000)
      totalTime += elapsed
    }

    return totalTime
  }

  // 开始/暂停计时
  function toggleTimer(taskId: string) {
    const vocabTask = vocabTasks.value.find(t => t.id === taskId)
    const listeningTask = listeningTasks.value.find(t => t.id === taskId)
    const task = vocabTask || listeningTask

    if (!task) return

    // 如果当前任务正在计时，暂停它
    if (activeTimerId.value === taskId) {
      pauseTimer()
    }
    // 如果其他任务正在计时，先暂停它
    else if (activeTimerId.value) {
      pauseTimer()
      // 然后开始新任务的计时
      startTimer(taskId)
    }
    // 如果没有任务在计时，开始计时
    else {
      startTimer(taskId)
    }
  }

  // 开始计时
  function startTimer(taskId: string) {
    const vocabTask = vocabTasks.value.find(t => t.id === taskId)
    const listeningTask = listeningTasks.value.find(t => t.id === taskId)
    const task = vocabTask || listeningTask

    if (!task) return

    // 如果任务已经有计时开始时间，说明之前暂停过，继续计时
    if (!task.timerStartTime) {
      task.timerStartTime = Date.now()
    }

    activeTimerId.value = taskId

    // 启动计时器更新
    if (timerInterval.value) {
      clearInterval(timerInterval.value)
    }

    timerInterval.value = window.setInterval(() => {
      // 触发响应式更新
      if (vocabTask) {
        vocabTasks.value = [...vocabTasks.value]
      }
      if (listeningTask) {
        listeningTasks.value = [...listeningTasks.value]
      }
    }, 1000)
  }

  // 暂停计时
  function pauseTimer() {
    if (!activeTimerId.value) return

    const vocabTask = vocabTasks.value.find(t => t.id === activeTimerId.value)
    const listeningTask = listeningTasks.value.find(t => t.id === activeTimerId.value)
    const task = vocabTask || listeningTask

    if (task && task.timerStartTime) {
      // 计算本次计时的时间
      const elapsed = Math.floor((Date.now() - task.timerStartTime) / 1000)
      task.timeSpent = (task.timeSpent || 0) + elapsed
      task.timerStartTime = undefined
    }

    // 清除计时器
    if (timerInterval.value) {
      clearInterval(timerInterval.value)
      timerInterval.value = null
    }

    activeTimerId.value = null
  }

  // 停止计时（打卡时调用）
  function stopTimer(taskId: string) {
    if (activeTimerId.value === taskId) {
      pauseTimer()
    }
  }

  // 打卡单词章节
  function toggleVocabChapter(chapter: number) {
    const task = vocabTasks.value.find(t => t.chapter === chapter)
    if (!task) return

    const today = new Date().toISOString().split('T')[0]

    if (task.status === 'completed') {
      // 取消完成
      task.status = 'pending'
      task.completedAt = undefined
      // 停止计时
      stopTimer(task.id)
    }
    else {
      // 标记完成
      task.status = 'completed'
      task.completedAt = today
      // 停止计时并保存时间
      stopTimer(task.id)
    }

    // 触发响应式更新
    vocabTasks.value = [...vocabTasks.value]
  }

  // 打卡听力section
  function toggleListeningSection(book: number, test: number, section: number) {
    const task = listeningTasks.value.find(
      t => t.book === book && t.test === test && t.section === section
    )
    if (!task) return

    const today = new Date().toISOString().split('T')[0]

    if (task.status === 'completed') {
      // 取消完成
      task.status = 'pending'
      task.completedAt = undefined
      // 停止计时
      stopTimer(task.id)
    }
    else {
      // 标记完成
      task.status = 'completed'
      task.completedAt = today
      // 停止计时并保存时间
      stopTimer(task.id)
    }

    // 触发响应式更新
    listeningTasks.value = [...listeningTasks.value]
  }

  // 获取每日足迹（按日期倒序）
  const dailyLogs = computed<DailyLog[]>(() => {
    const logsMap = new Map<string, DailyLog>()

    // 收集所有完成的任务
    vocabTasks.value.forEach((task) => {
      if (task.status === 'completed' && task.completedAt) {
        if (!logsMap.has(task.completedAt)) {
          logsMap.set(task.completedAt, {
            date: task.completedAt,
            vocab: [],
            listening: [],
            summary: '',
            totalTime: 0,
          })
        }
        logsMap.get(task.completedAt)!.vocab.push(task.id)
        logsMap.get(task.completedAt)!.totalTime += task.timeSpent || 0
      }
    })

    listeningTasks.value.forEach((task) => {
      if (task.status === 'completed' && task.completedAt) {
        if (!logsMap.has(task.completedAt)) {
          logsMap.set(task.completedAt, {
            date: task.completedAt,
            vocab: [],
            listening: [],
            summary: '',
            totalTime: 0,
          })
        }
        logsMap.get(task.completedAt)!.listening.push(task.id)
        logsMap.get(task.completedAt)!.totalTime += task.timeSpent || 0
      }
    })

    // 生成摘要
    const logs = Array.from(logsMap.values())
    logs.forEach((log) => {
      const vocabChapters = log.vocab
        .map(id => {
          const match = id.match(/ch(\d+)/)
          return match ? parseInt(match[1]) : null
        })
        .filter((ch): ch is number => ch !== null)
        .sort((a, b) => a - b)

      const listeningSections = log.listening
        .map(id => {
          const match = id.match(/c(\d+)t(\d+)s(\d+)/)
          return match
            ? {
                book: parseInt(match[1]),
                test: parseInt(match[2]),
                section: parseInt(match[3]),
              }
            : null
        })
        .filter((s): s is { book: number; test: number; section: number } => s !== null)

      // 生成摘要文本
      const vocabText = vocabChapters.length > 0
        ? `单词 Ch.${vocabChapters.join(', Ch.')}`
        : ''

      const listeningGroups: string[] = []
      const grouped = new Map<string, number[]>()
      listeningSections.forEach((s) => {
        const key = `C${s.book}T${s.test}`
        if (!grouped.has(key)) {
          grouped.set(key, [])
        }
        grouped.get(key)!.push(s.section)
      })

      grouped.forEach((sections, key) => {
        sections.sort((a, b) => a - b)
        if (sections.length === 1) {
          listeningGroups.push(`${key}S${sections[0]}`)
        }
        else if (sections.length === SECTIONS_PER_TEST) {
          listeningGroups.push(`${key}S1-S4`)
        }
        else {
          listeningGroups.push(`${key}S${sections.join('-S')}`)
        }
      })

      const listeningText = listeningGroups.length > 0
        ? `听力 ${listeningGroups.join(', ')}`
        : ''

      log.summary = [vocabText, listeningText].filter(Boolean).join('，')
    })

    // 按日期倒序排列
    return logs.sort((a, b) => b.date.localeCompare(a.date))
  })

  // 活动图开始日期（可自定义）
  const activityGraphStartDate = useLocalStorage<string>('activity-graph-start-date', () => {
    // 默认从开始日期往前推一年，或从今天往前推一年
    const date = new Date(startDate.value || new Date().toISOString().split('T')[0])
    date.setFullYear(date.getFullYear() - 1)
    return date.toISOString().split('T')[0]
  })

  // 生成活动图数据
  const activityGraphData = computed(() => {
    const start = new Date(activityGraphStartDate.value)
    const end = new Date()
    end.setHours(23, 59, 59, 999)
    
    const days: Array<{ date: string; level: number; count: number; time: number }> = []
    const logsMap = new Map<string, DailyLog>()
    
    // 构建日志映射
    dailyLogs.value.forEach(log => {
      logsMap.set(log.date, log)
    })
    
    // 生成每一天的数据
    const current = new Date(start)
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0]
      const log = logsMap.get(dateStr)
      
      if (log) {
        // 计算活动强度：基于完成的任务数量和总时间
        const taskCount = log.vocab.length + log.listening.length
        const timeHours = log.totalTime / 3600 // 转换为小时
        
        // 活动强度分级：0-无活动, 1-低, 2-中, 3-高, 4-极高
        let level = 0
        if (taskCount > 0) {
          if (taskCount >= 20 || timeHours >= 3) {
            level = 4 // 极高
          }
          else if (taskCount >= 12 || timeHours >= 2) {
            level = 3 // 高
          }
          else if (taskCount >= 6 || timeHours >= 1) {
            level = 2 // 中
          }
          else {
            level = 1 // 低
          }
        }
        
        days.push({
          date: dateStr,
          level,
          count: taskCount,
          time: log.totalTime,
        })
      }
      else {
        days.push({
          date: dateStr,
          level: 0,
          count: 0,
          time: 0,
        })
      }
      
      current.setDate(current.getDate() + 1)
    }
    
    return days
  })

  // 格式化日期显示
  function formatDate(dateStr: string): string {
    const date = new Date(dateStr)
    const month = date.getMonth() + 1
    const day = date.getDate()
    return `${month}月${day}日`
  }

  // 重置所有进度
  function resetAll() {
    // 停止所有计时器
    pauseTimer()

    vocabTasks.value = vocabTasks.value.map(t => ({
      ...t,
      status: 'pending' as const,
      completedAt: undefined,
      timeSpent: undefined,
      timerStartTime: undefined,
    }))
    listeningTasks.value = listeningTasks.value.map(t => ({
      ...t,
      status: 'pending' as const,
      completedAt: undefined,
      timeSpent: undefined,
      timerStartTime: undefined,
    }))
  }

  // 导出所有数据
  function exportData() {
    const data = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      startDate: startDate.value,
      vocabTasks: vocabTasks.value,
      listeningTasks: listeningTasks.value,
    }
    const jsonStr = JSON.stringify(data, null, 2)
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `study-plan-backup-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // 导入数据
  function importData(jsonData: string) {
    try {
      const data = JSON.parse(jsonData)

      // 验证数据格式
      if (!data.vocabTasks || !data.listeningTasks) {
        throw new Error('数据格式不正确')
      }

      // 停止所有计时器
      pauseTimer()

      // 导入数据
      if (data.startDate) {
        startDate.value = data.startDate
      }
      vocabTasks.value = data.vocabTasks
      listeningTasks.value = data.listeningTasks

      return true
    }
    catch (error) {
      console.error('导入数据失败:', error)
      return false
    }
  }

  // 从文件导入数据
  function importFromFile(file: File): Promise<boolean> {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target?.result as string
        const success = importData(result)
        resolve(success)
      }
      reader.onerror = () => {
        resolve(false)
      }
      reader.readAsText(file)
    })
  }

  // 确保数据在初始化时正确加载和验证
  onMounted(() => {
    // useLocalStorage 会自动从 localStorage 加载数据
    // 验证并修复数据完整性
    let needsSave = false

    // 验证单词任务数据
    if (vocabTasks.value.length !== VOCAB_TOTAL_CHAPTERS) {
      // 如果数据不完整，重新初始化
      const existingTasks = new Map(vocabTasks.value.map(t => [t.chapter, t]))
      vocabTasks.value = Array.from({ length: VOCAB_TOTAL_CHAPTERS }, (_, i) => {
        const chapter = i + 1
        const existing = existingTasks.get(chapter)
        if (existing) {
          return existing
        }
        needsSave = true
        return {
          id: `vocab-ch${chapter}`,
          chapter,
          status: 'pending' as const,
        }
      })
    }

    // 验证听力任务数据
    if (listeningTasks.value.length !== LISTENING_TOTAL_SECTIONS) {
      // 如果数据不完整，重新初始化
      const existingTasks = new Map(
        listeningTasks.value.map(t => [`${t.book}-${t.test}-${t.section}`, t])
      )
      const tasks: ListeningTask[] = []
      LISTENING_BOOKS.forEach((book) => {
        for (let test = 1; test <= TESTS_PER_BOOK; test++) {
          for (let section = 1; section <= SECTIONS_PER_TEST; section++) {
            const key = `${book}-${test}-${section}`
            const existing = existingTasks.get(key)
            if (existing) {
              tasks.push(existing)
            }
            else {
              needsSave = true
              tasks.push({
                id: `listening-c${book}t${test}s${section}`,
                book,
                test,
                section,
                status: 'pending' as const,
              })
            }
          }
        }
      })
      listeningTasks.value = tasks
    }

    // 如果数据被修复，useLocalStorage 会自动保存
    if (needsSave) {
      console.log('数据已修复并保存')
    }
  })

  // 页面卸载前确保数据已保存（useLocalStorage 会自动处理，这里作为额外保障）
  onBeforeUnmount(() => {
    // 暂停所有计时器
    pauseTimer()
    // useLocalStorage 会自动保存数据，无需手动操作
  })

  // 组件卸载时清理计时器
  onUnmounted(() => {
    if (timerInterval.value) {
      clearInterval(timerInterval.value)
    }
  })

  // 按Book分组听力任务
  const listeningByBook = computed(() => {
    const grouped: Record<number, Record<number, ListeningTask[]>> = {}
    LISTENING_BOOKS.forEach((book) => {
      grouped[book] = {}
      for (let test = 1; test <= TESTS_PER_BOOK; test++) {
        grouped[book][test] = listeningTasks.value.filter(
          t => t.book === book && t.test === test
        )
      }
    })
    return grouped
  })

  return {
    // 状态
    startDate,
    vocabTasks,
    listeningTasks,
    currentDay,
    todayGoals,
    todayCompleted,
    overallProgress,
    dailyLogs,
    listeningByBook,
    activeTimerId,
    activityGraphStartDate,
    activityGraphData,

    // 方法
    toggleVocabChapter,
    toggleListeningSection,
    formatDate,
    formatTime,
    resetAll,
    toggleTimer,
    startTimer,
    pauseTimer,
    getTaskCurrentTime,
    exportData,
    importData,
    importFromFile,

    // 常量
    VOCAB_TOTAL_CHAPTERS,
    LISTENING_TOTAL_SECTIONS,
    VOCAB_DAILY_GOAL,
    LISTENING_DAILY_GOAL,
  }
}

