<script setup lang="ts">
import { getErrorWords, removeFromErrorBook, clearErrorBook, exportErrorBook, importErrorBook, addToErrorBook, getWordsToReview, markWordAsReviewed, getReviewStats, formatReviewDate, calculateNextReviewDate, toggleSpecialAttention, type ErrorWord } from '~/composables/errorBook'
import { useRouter } from 'vue-router'
import { isAltKeyPressed, isMac } from '~/composables/useKeyboard'

const router = useRouter()

const errorWords = ref<ErrorWord[]>([])
const isTrainingModel = ref(false)
const isShowMeaning = ref(true)
const isShowExample = ref(true)
const isAutoPlayWordAudio = ref(true)
const isShowSource = ref(false)
const trainingStats = ref('')
const keyword = ref('')
const selectedCategory = ref<string>('')
const onlyShowSpecialAttention = ref(false) // 是否只显示特别注意的单词
const showImportDialog = ref(false)
const showAddDialog = ref(false)
const importText = ref('')
const importResult = ref('')
const showGitSyncDialog = ref(false)
const gitSyncStep = ref(1) // 当前同步步骤

// 复习计划相关
const showReviewPlan = ref(true)
const reviewMode = ref<'all' | 'review'>('all') // 'all' 显示所有，'review' 只显示待复习

// 自动播放相关状态
const isAutoPlaying = ref(false)
const currentPlayingIndex = ref(-1)
const playInterval = ref(3000) // 播放间隔（毫秒），默认3秒
const autoPlayTimer = ref<number | null>(null)
const currentAudio = ref<HTMLAudioElement | null>(null)

// 手动添加单词的表单
const newWord = ref({
  word: '',
  pos: '',
  meaning: '',
  example: '',
  extra: '',
  category: '',
})

const categories = computed(() => {
  const cats = new Set<string>()
  errorWords.value.forEach(w => cats.add(w.category))
  return Array.from(cats).sort()
})

// 根据平台生成快捷键提示文本
const specialAttentionShortcut = computed(() => {
  return isMac() ? 'Command+W' : 'Alt+W'
})

const filteredWords = computed(() => {
  // 根据模式选择数据源：全部 or 待复习
  let words = reviewMode.value === 'review' ? wordsToReview.value : errorWords.value

  // 按分类筛选
  if (selectedCategory.value)
    words = words.filter(w => w.category === selectedCategory.value)

  // 按关键词筛选
  if (keyword.value.trim()) {
    const kw = keyword.value.trim().toLowerCase()
    words = words.filter(w =>
      w.word.some(wd => wd.toLowerCase().includes(kw))
      || w.meaning.toLowerCase().includes(kw)
      || w.pos.toLowerCase().includes(kw),
    )
  }

  // 只显示特别注意的单词
  if (onlyShowSpecialAttention.value) {
    words = words.filter(w => w.isSpecialAttention === true)
  }

  return words
})

function loadErrorWords() {
  errorWords.value = getErrorWords()
  // 为每个单词计算下次复习时间（如果还没有）
  let needsSave = false
  errorWords.value.forEach(word => {
    if (!word.nextReviewDate) {
      word.nextReviewDate = calculateNextReviewDate(word)
      needsSave = true
    }
  })
  // 保存更新后的数据
  if (needsSave && errorWords.value.length > 0) {
    localStorage.setItem('vocabulary_error_book', JSON.stringify(errorWords.value))
  }
}

// 获取待复习的单词（基于内存中的 errorWords，避免频繁读取 localStorage）
const wordsToReview = computed(() => {
  const now = Date.now()

  return errorWords.value
    .map((word) => {
      if (!word.nextReviewDate) {
        word.nextReviewDate = calculateNextReviewDate(word)
      }
      return word
    })
    .filter((word) => {
      if (word.nextReviewDate === 0) return false
      // 允许提前1小时开始复习
      return (word.nextReviewDate || 0) <= now + 60 * 60 * 1000
    })
    .sort((a, b) => {
      const aDate = a.nextReviewDate || 0
      const bDate = b.nextReviewDate || 0
      return aDate - bDate
    })
})

// 获取复习统计
const reviewStats = computed(() => {
  return getReviewStats()
})

// 标记单词为已复习
function markAsReviewed(word: ErrorWord) {
  const success = markWordAsReviewed(word.id, word.category)
  if (success) {
    loadErrorWords()
  }
}

function calcStats() {
  let error = 0
  let missing = 0
  let correct = 0
  if (isTrainingModel.value) {
    for (const item of filteredWords.value) {
      const wordItem = item as ErrorWord & { spellValue?: string; spellError?: boolean }
      if (wordItem.spellValue) {
        if (wordItem.spellError)
          error++
        else
          correct++
      }
      else { missing++ }
    }
  }
  return `${missing} 个未完成，${correct} 个正确，${error} 个错误`
}

function removeWord(word: ErrorWord) {
  removeFromErrorBook(word.id, word.category)
  loadErrorWords()
}

// 切换单词的特别注意状态
function toggleWordSpecialAttention(item: ErrorWord) {
  const success = toggleSpecialAttention(item.id, item.category)
  if (success) {
    // 更新本地数据
    const word = errorWords.value.find(w => w.id === item.id && w.category === item.category)
    if (word) {
      word.isSpecialAttention = !word.isSpecialAttention
    }
  }
}

// 根据单词内容和分类查找错题本中的单词
function findWordInErrorBook(wordText: string, category: string): ErrorWord | null {
  if (!wordText.trim() || !category.trim()) {
    return null
  }
  const wordArray = wordText.split(',').map((w: string) => w.trim().toLowerCase()).filter(Boolean)
  if (wordArray.length === 0) {
    return null
  }

  return errorWords.value.find((w: ErrorWord) => {
    if (w.category !== category) {
      return false
    }
    // 检查单词是否匹配（不区分大小写）
    const wWords = w.word.map((ww: string) => ww.toLowerCase().trim())
    return wordArray.some((wa: string) => wWords.includes(wa)) || wWords.some((ww: string) => wordArray.includes(ww))
  }) || null
}

// 计算属性：检查当前输入的单词是否已在错题本中
const currentWordInErrorBook = computed(() => {
  if (!newWord.value.word.trim() || !newWord.value.category.trim()) {
    return null
  }
  return findWordInErrorBook(newWord.value.word, newWord.value.category)
})

// 从错题本移除当前输入的单词
function removeCurrentWordFromErrorBook() {
  const foundWord = currentWordInErrorBook.value
  if (foundWord) {
    removeFromErrorBook(foundWord.id, foundWord.category)
    loadErrorWords()
    // 清空表单
    newWord.value = {
      word: '',
      pos: '',
      meaning: '',
      example: '',
      extra: '',
      category: '',
    }
  }
}

function handleExport() {
  const json = exportErrorBook()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `错题本_${new Date().toISOString().split('T')[0]}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function handleImport() {
  if (!importText.value.trim()) {
    importResult.value = '请输入要导入的JSON内容'
    return
  }

  const result = importErrorBook(importText.value)
  importResult.value = result.message
  if (result.success) {
    loadErrorWords()
    setTimeout(() => {
      showImportDialog.value = false
      importText.value = ''
      importResult.value = ''
    }, 2000)
  }
}

// 处理文件上传
const fileInputRef = ref<HTMLInputElement | null>(null)

function handleFileSelect() {
  fileInputRef.value?.click()
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) {
    return
  }

  if (!file.name.endsWith('.json')) {
    importResult.value = '请选择JSON格式的文件'
    return
  }

  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string
    if (content) {
      importText.value = content
      importResult.value = '文件已加载，点击"导入"按钮完成导入'
    }
  }
  reader.onerror = () => {
    importResult.value = '文件读取失败，请重试'
  }
  reader.readAsText(file)

  // 清空input，允许重复选择同一个文件
  input.value = ''
}

// 自动导入项目内的错题本JSON文件
async function handleAutoImport() {
  try {
    importResult.value = '正在读取项目错题本文件...'
    const response = await fetch('/data/error-book.json')

    if (!response.ok) {
      importResult.value = '项目中未找到错题本文件（/data/error-book.json）'
      return
    }

    const content = await response.text()
    importText.value = content

    // 自动执行导入
    const result = importErrorBook(content)
    importResult.value = result.message

    if (result.success) {
      loadErrorWords()
      setTimeout(() => {
        showImportDialog.value = false
        importText.value = ''
        importResult.value = ''
      }, 2000)
    }
  }
  catch (error) {
    importResult.value = `读取失败: ${error instanceof Error ? error.message : '未知错误'}`
  }
}

// Git同步功能
function handleGitSync() {
  showGitSyncDialog.value = true
  gitSyncStep.value = 1
  importResult.value = '' // 清空上次的消息
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  }
  catch {
    // 降级方案
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const success = document.execCommand('copy')
    document.body.removeChild(textarea)
    return success
  }
}

// 一键导出：自动保存到项目文件
async function exportAndSaveToProject() {
  try {
    const json = exportErrorBook()

    // 调用API保存到文件
    const response = await fetch('/api/save-error-book', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: json,
    })

    const result = await response.json()

    if (result.success) {
      gitSyncStep.value = 2
      importResult.value = '✅ ' + result.message
    }
    else {
      importResult.value = '❌ ' + result.message
    }
  }
  catch (error) {
    importResult.value = `❌ 保存失败: ${error instanceof Error ? error.message : '未知错误'}`
  }
}

function handleAddWord() {
  if (!newWord.value.word.trim() || !newWord.value.meaning.trim() || !newWord.value.category.trim()) {
    alert('请填写单词、词义和分类')
    return
  }

  // 如果单词已存在，先移除再添加（实现更新功能）
  const existingWord = currentWordInErrorBook.value
  if (existingWord) {
    removeFromErrorBook(existingWord.id, existingWord.category)
  }

  const wordData: ErrorWord = {
    id: existingWord?.id || Date.now(), // 如果已存在，保留原ID；否则使用时间戳
    word: newWord.value.word.split(',').map(w => w.trim()).filter(Boolean),
    pos: newWord.value.pos || '-',
    meaning: newWord.value.meaning,
    example: newWord.value.example || '-',
    extra: newWord.value.extra || '-',
    category: newWord.value.category,
    addedAt: existingWord?.addedAt || Date.now(), // 保留原添加时间
    isSpecialAttention: existingWord?.isSpecialAttention, // 保留特别注意状态
    reviewRecords: existingWord?.reviewRecords, // 保留复习记录
    nextReviewDate: existingWord?.nextReviewDate, // 保留下次复习时间
  }

  addToErrorBook(wordData)
  loadErrorWords()
  showAddDialog.value = false
  // 重置表单
  newWord.value = {
    word: '',
    pos: '',
    meaning: '',
    example: '',
    extra: '',
    category: '',
  }
}

function handleClear() {
  if (confirm('确定要清空所有错题吗？此操作不可恢复！')) {
    clearErrorBook()
    loadErrorWords()
  }
}

let audio = null
// 跟踪当前播放的单词，用于在播放完成后更新状态
let currentPlayingWord: ErrorWord | null = null

function play(audioPath: string) {
  if (audio) {
    audio.pause()
    audio.currentTime = 0
  }
  audio = document.createElement('audio')
  audio.src = audioPath

  // 查找对应的单词
  const word = filteredWords.value.find(w =>
    `vocabulary/audio/${w.category}/${w.word[0]}.mp3` === audioPath
  )
  currentPlayingWord = word || null

  // 在音频播放完成时更新状态
  audio.onended = () => {
    updateWordStateAfterAudio()
    currentPlayingWord = null
  }

  audio.play()
}

// 在音频播放完成后更新错题本状态
function updateWordStateAfterAudio() {
  if (currentPlayingWord) {
    // 找到对应的输入框并更新状态
    const inputId = currentPlayingWord.id.toString()
    const inputElement = document.getElementById(inputId) as HTMLInputElement
    if (inputElement) {
      const spellValue = inputElement.value.toLowerCase().trim()
      const wordItem = currentPlayingWord as ErrorWord & { spellValue?: string; spellError?: boolean }
      if (spellValue.length < 1) {
        wordItem.spellValue = ''
        wordItem.spellError = false
      }
      else {
        wordItem.spellValue = spellValue
        wordItem.spellError = !currentPlayingWord.word.map((v: string) => v.toLowerCase().trim()).includes(spellValue)
      }
    }
  }
  // 更新统计信息
  trainingStats.value = calcStats()
}

// 自动播放功能
function startAutoPlay() {
  if (filteredWords.value.length === 0) {
    alert('没有可播放的单词')
    return
  }

  isAutoPlaying.value = true
  currentPlayingIndex.value = 0
  playWordAtIndex(0)
}

function playWordAtIndex(index: number) {
  if (index < 0 || index >= filteredWords.value.length) {
    return
  }

  // 停止自动播放计时器
  if (autoPlayTimer.value) {
    clearTimeout(autoPlayTimer.value)
    autoPlayTimer.value = null
  }

  currentPlayingIndex.value = index
  const word = filteredWords.value[index]
  const audioPath = `vocabulary/audio/${word.category}/${word.word[0]}.mp3`

  // 停止当前音频
  if (currentAudio.value) {
    currentAudio.value.pause()
    currentAudio.value = null
  }

  // 创建并播放新音频
  const newAudio = document.createElement('audio')
  newAudio.src = audioPath
  currentAudio.value = newAudio

  newAudio.onended = () => {
    // 音频播放完成后，更新当前单词的状态
    // 使用 currentPlayingIndex 而不是闭包中的 index，确保获取正确的单词
    if (currentPlayingIndex.value >= 0 && currentPlayingIndex.value < filteredWords.value.length) {
      const currentWord = filteredWords.value[currentPlayingIndex.value]
      if (currentWord) {
        const inputId = currentWord.id.toString()
        const inputElement = document.getElementById(inputId) as HTMLInputElement
        if (inputElement) {
          const spellValue = inputElement.value.toLowerCase().trim()
          const wordItem = currentWord as ErrorWord & { spellValue?: string; spellError?: boolean }
          if (spellValue.length < 1) {
            wordItem.spellValue = ''
            wordItem.spellError = false
          }
          else {
            wordItem.spellValue = spellValue
            wordItem.spellError = !currentWord.word.map((v: string) => v.toLowerCase().trim()).includes(spellValue)
          }
        }
      }
    }
    // 更新统计信息
    trainingStats.value = calcStats()

    // 只有在自动播放状态下才继续播放下一个
    if (isAutoPlaying.value) {
      // 音频播放完成后，等待指定间隔后播放下一个
      autoPlayTimer.value = window.setTimeout(() => {
        if (isAutoPlaying.value) {
          currentPlayingIndex.value++
          if (currentPlayingIndex.value < filteredWords.value.length) {
            scrollToCurrentWord()
            playWordAtIndex(currentPlayingIndex.value)
          }
          else {
            stopAutoPlay()
          }
        }
      }, playInterval.value)
    }
  }

  // 播放开始时也滚动
  scrollToCurrentWord()

  newAudio.onerror = () => {
    // 如果音频加载失败，跳过这个单词
    console.warn(`Failed to load audio: ${audioPath}`)
    if (isAutoPlaying.value) {
      currentPlayingIndex.value++
      if (currentPlayingIndex.value < filteredWords.value.length) {
        playWordAtIndex(currentPlayingIndex.value)
      }
      else {
        stopAutoPlay()
      }
    }
  }

  newAudio.play()
}

function playNextWord() {
  if (currentPlayingIndex.value >= filteredWords.value.length - 1) {
    return
  }
  playWordAtIndex(currentPlayingIndex.value + 1)
}

function playPreviousWord() {
  if (currentPlayingIndex.value <= 0) {
    return
  }
  playWordAtIndex(currentPlayingIndex.value - 1)
}

function replayCurrentWord() {
  if (currentPlayingIndex.value >= 0 && currentPlayingIndex.value < filteredWords.value.length) {
    playWordAtIndex(currentPlayingIndex.value)
  }
}

function pauseAutoPlay() {
  isAutoPlaying.value = false
  if (autoPlayTimer.value) {
    clearTimeout(autoPlayTimer.value)
    autoPlayTimer.value = null
  }
  if (currentAudio.value) {
    currentAudio.value.pause()
  }
}

function resumeAutoPlay() {
  if (currentPlayingIndex.value >= 0 && currentPlayingIndex.value < filteredWords.value.length) {
    isAutoPlaying.value = true
    // 如果当前音频还在且已暂停，继续播放
    if (currentAudio.value && currentAudio.value.paused && currentAudio.value.currentTime > 0) {
      currentAudio.value.play()
    }
    else {
      // 否则从当前位置继续播放下一个
      playNextWord()
    }
  }
  else {
    // 如果索引无效，重新开始
    startAutoPlay()
  }
}

function stopAutoPlay() {
  pauseAutoPlay()
  currentPlayingIndex.value = -1
  if (currentAudio.value) {
    currentAudio.value.pause()
    currentAudio.value.currentTime = 0
    currentAudio.value = null
  }
}

function scrollToCurrentWord() {
  if (currentPlayingIndex.value >= 0 && currentPlayingIndex.value < filteredWords.value.length) {
    const word = filteredWords.value[currentPlayingIndex.value]
    const element = document.getElementById(`tr_${word.id}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
}

// 键盘和鼠标热键处理
function handleErrorBookHotkeys(e: KeyboardEvent | MouseEvent) {
  // 只在错题本页面且不在输入框中时响应
  const target = e.target as HTMLElement
  // 对于键盘事件，如果在输入框中则忽略（Enter 键在输入框中的处理由 onInputKeydown 处理）
  if (e instanceof KeyboardEvent) {
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') {
      return
    }
  }
  // 对于鼠标事件，如果在输入框、按钮或文本框中则忽略
  else if (e instanceof MouseEvent) {
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') {
      return
    }
  }

  // 键盘快捷键
  if (e instanceof KeyboardEvent) {
    // Alt + 左方向键（鼠标按钮5映射的"上一步"）：下一个（Mac 上 Option + 左方向键）
    if (e.key === 'ArrowLeft' && isAltKeyPressed(e)) {
      e.preventDefault()
      e.stopPropagation()
      playNextWord()
      return
    }
    // 左方向键（鼠标按钮4映射）：上一个
    if (e.key === 'ArrowLeft' && !isAltKeyPressed(e)) {
      e.preventDefault()
      e.stopPropagation()
      playPreviousWord()
      return
    }
    // 右方向键：下一个
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      e.stopPropagation()
      playNextWord()
      return
    }
    // 空格键：暂停/继续
    if (e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      if (isAutoPlaying.value) {
        pauseAutoPlay()
      }
      else if (currentPlayingIndex.value >= 0) {
        resumeAutoPlay()
      }
      return
    }
    // R键：重播
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault()
      e.stopPropagation()
      replayCurrentWord()
      return
    }
    // Alt + W / Command + W: 切换当前播放单词的特别注意状态（Mac 上 Command + W）
    if (e.key === 'w' && isAltKeyPressed(e)) {
      e.preventDefault()
      e.stopPropagation()
      if (currentPlayingIndex.value >= 0 && currentPlayingIndex.value < filteredWords.value.length) {
        const currentWord = filteredWords.value[currentPlayingIndex.value]
        toggleWordSpecialAttention(currentWord)
      }
      return
    }
  }
  // 鼠标按钮事件现在由 handleMouseEvent 单独处理
}

// 监听筛选结果变化，如果正在播放则停止
watch([filteredWords, selectedCategory, keyword], () => {
  if (isAutoPlaying.value) {
    stopAutoPlay()
  }
})


function onInputFoucsOut(e: FocusEvent, item: ErrorWord) {
  const target = e.target as HTMLInputElement
  const spellValue = target.value.toLowerCase().trim()
  const wordItem = item as ErrorWord & { spellValue?: string; spellError?: boolean }
  if (spellValue.length < 1) {
    wordItem.spellValue = ''
    wordItem.spellError = false
  }
  else {
    wordItem.spellValue = spellValue
    wordItem.spellError = !item.word.map((v: string) => v.toLowerCase().trim()).includes(spellValue)
  }
  // 不在输入时更新状态，避免卡顿，只在音频播放完成时更新
  // trainingStats.value = calcStats()
}

function onInputFoucsIn(e: FocusEvent, audioPath: string) {
  if (isAutoPlayWordAudio.value)
    play(audioPath)
}

function onInputKeydown(e: KeyboardEvent, audioPath: string, item: ErrorWord) {
  e.stopPropagation()
  const { key, target } = e

  if (key === ' ') {
    // 在错题本中，Space 键不处理，让全局事件处理（用于暂停/继续播放）
    // 只在 Ctrl+Space 时切换显示/隐藏例句
    if (e.ctrlKey) {
      e.preventDefault()
      // Ctrl + Space: 切换显示/隐藏例句
      isShowExample.value = !isShowExample.value
    }
    // 否则不阻止，让事件冒泡到全局处理
  }
  else if (key === 'Tab') {
    e.preventDefault() // 阻止默认的 Tab 行为
    // 重复播放当前单词的音频
    play(audioPath)
  }
  else if (key === 'Enter' && (target as HTMLInputElement).id) {
    e.preventDefault()
    const currentId = Number((target as HTMLInputElement).id)
    // 在 filteredWords 中找到当前单词的索引
    const currentIndex = filteredWords.value.findIndex(w => w.id === currentId)

    if (e.shiftKey) {
      // Shift + Enter: 切换到上一个 input
      if (currentIndex > 0) {
        const prevWord = filteredWords.value[currentIndex - 1]
        const prevInput = document.getElementById(prevWord.id.toString()) as HTMLInputElement
        if (prevInput) {
          prevInput.focus()
        }
      }
    }
    else {
      // Enter: 切换到下一个 input
      if (currentIndex >= 0 && currentIndex < filteredWords.value.length - 1) {
        const nextWord = filteredWords.value[currentIndex + 1]
        const nextInput = document.getElementById(nextWord.id.toString()) as HTMLInputElement
        if (nextInput) {
          nextInput.focus()
        }
      }
    }
  }
  else if (key === 'w' && isAltKeyPressed(e)) {
    e.preventDefault()
    // Alt + W / Command + W: 切换特别注意状态（Mac 上 Command + W）
    toggleWordSpecialAttention(item)
  }
}

function getInputStyleClass(item: ErrorWord) {
  const cls = {
    error: 'ml-4 bg-red-50 border border-red-500 text-red-900 placeholder-red-700 text-sm rounded-lg focus:ring-red-500 dark:bg-gray-700 focus:border-red-500 inline-block p-2.5 dark:text-red-500 dark:placeholder-red-500 dark:border-red-500',
    normal: 'ml-4 inline-block border border-gray-300 rounded-lg bg-gray-50 p-2.5 text-sm text-gray-900 dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:ring-blue-500 dark:focus:border-blue-500 dark:focus:ring-blue-500 dark:placeholder-gray-400',
    success: 'ml-4 bg-green-50 border border-green-500 text-green-900 dark:text-green-400 placeholder-green-700 dark:placeholder-green-500 text-sm rounded-lg focus:ring-green-500 focus:border-green-500 inline-block p-2.5 dark:bg-gray-700 dark:border-green-500',
  }
  const wordItem = item as ErrorWord & { spellValue?: string; spellError?: boolean }
  if (wordItem.spellError)
    return cls.error
  if (wordItem.spellValue && wordItem.spellValue.length > 0 && !wordItem.spellError)
    return cls.success
  return cls.normal
}

function copyText(item: ErrorWord) {
  const text = `${item.word.join(', ')} ${item.pos} ${item.meaning}`
  navigator.clipboard.writeText(text)
}

function handleMouseEvent(e: MouseEvent) {
  // 只在错题本页面且不在输入框中时响应
  const target = e.target as HTMLElement
  // 检查是否在输入框、按钮或文本框中
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') {
    return
  }
  // 检查是否在可点击元素内（如链接、按钮等）
  const clickableParent = target.closest('a, button, [role="button"]')
  if (clickableParent && clickableParent !== target) {
    return
  }

  // 鼠标按钮4（JavaScript button 3，侧键后退）：上一个
  if (e.button === 3) {
    e.preventDefault()
    e.stopPropagation()
    playPreviousWord()
    return
  }
  // 鼠标按钮5（JavaScript button 4，侧键前进）：下一个
  if (e.button === 4) {
    e.preventDefault()
    e.stopPropagation()
    playNextWord()
    return
  }
  // 鼠标中键（button 1）：重播
  if (e.button === 1) {
    e.preventDefault()
    e.stopPropagation()
    replayCurrentWord()
    return
  }
}

// 监听 localStorage 变化（跨标签页同步）
function handleStorageChange(e: StorageEvent) {
  if (e.key === 'vocabulary_error_book' && e.newValue !== e.oldValue) {
    loadErrorWords()
  }
}

// 监听页面可见性变化，当页面重新可见时重新加载数据
function handleVisibilityChange() {
  if (!document.hidden) {
    loadErrorWords()
  }
}

onMounted(() => {
  // 页面加载时自动从 localStorage 加载错题本数据
  loadErrorWords()

  // 添加键盘事件监听
  document.addEventListener('keydown', handleErrorBookHotkeys)
  // 添加鼠标事件监听（使用多个事件类型以确保侧键能被捕获）
  document.addEventListener('mousedown', handleMouseEvent)
  document.addEventListener('auxclick', handleMouseEvent)
  // 阻止鼠标中键和侧键的默认行为
  document.addEventListener('contextmenu', (e) => {
    // 允许右键菜单，但阻止侧键的默认行为
    if (e.button === 3 || e.button === 4) {
      e.preventDefault()
    }
  })

  // 监听 localStorage 变化（跨标签页同步）
  window.addEventListener('storage', handleStorageChange)
  // 监听页面可见性变化
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

// 组件卸载时清理
onUnmounted(() => {
  stopAutoPlay()
  document.removeEventListener('keydown', handleErrorBookHotkeys)
  document.removeEventListener('mousedown', handleMouseEvent)
  document.removeEventListener('auxclick', handleMouseEvent)
  // 清理 localStorage 和页面可见性监听器
  window.removeEventListener('storage', handleStorageChange)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <div class="px-4 pt-6 2xl:px-0">
    <div class="border border-gray-200 rounded-lg bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
      <!-- Card header -->
      <div class="items-center justify-between lg:flex">
        <div class="mb-4 lg:mb-0">
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-lg bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              @click="router.push('/vocabulary')"
            >
              <i class="i-ph-arrow-left mr-1" />
              返回
            </button>
            <h3 class="mb-2 text-xl font-bold text-gray-900 dark:text-white">
              错题本
            </h3>
          </div>
          <span class="text-base font-normal text-gray-500 dark:text-gray-400">
            共 {{ errorWords.length }} 个单词
            <span v-if="selectedCategory">，当前分类：{{ selectedCategory }}</span>
          </span>
        </div>
        <div class="items-center sm:flex">
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-300 dark:bg-green-600 dark:hover:bg-green-700 dark:focus:ring-green-800"
              @click="showAddDialog = true"
            >
              <i class="i-ph-plus-bold mr-1" />
              手动添加
            </button>
            <button
              type="button"
              class="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
              @click="handleExport"
            >
              <i class="i-ph-download-bold mr-1" />
              导出
            </button>
            <button
              type="button"
              class="rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-700 focus:outline-none focus:ring-4 focus:ring-purple-300 dark:bg-purple-600 dark:hover:bg-purple-700 dark:focus:ring-purple-800"
              @click="showImportDialog = true"
            >
              <i class="i-ph-upload-bold mr-1" />
              导入
            </button>
            <button
              type="button"
              class="rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-300 dark:bg-orange-600 dark:hover:bg-orange-700 dark:focus:ring-orange-800"
              @click="handleGitSync"
              title="通过Git同步错题本到其他电脑"
            >
              <i class="i-ph-git-branch-bold mr-1" />
              Git同步
            </button>
            <button
              type="button"
              class="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-300 dark:bg-red-600 dark:hover:bg-red-700 dark:focus:ring-red-800"
              @click="handleClear"
            >
              <i class="i-ph-trash-bold mr-1" />
              清空
            </button>
          </div>
        </div>
      </div>

      <!-- 快捷键提示卡片：仅在练习模式下显示 -->
      <div v-if="isTrainingModel" class="mt-4 border border-blue-200 rounded-lg bg-blue-50 p-3 shadow-sm dark:border-blue-800 dark:bg-blue-900/20">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <i class="i-carbon-keyboard text-lg text-blue-600 dark:text-blue-400" />
            <span class="text-sm font-semibold text-blue-800 dark:text-blue-300">练习快捷键：</span>
          </div>
          <div class="flex flex-wrap gap-3 text-sm">
            <div class="flex items-center gap-1.5">
              <kbd class="rounded bg-white px-2 py-1 font-mono text-xs font-semibold text-gray-800 shadow-sm ring-1 ring-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600">Space</kbd>
              <span class="text-gray-700 dark:text-gray-300">显示单词</span>
            </div>
            <div class="flex items-center gap-1.5">
              <kbd class="rounded bg-white px-2 py-1 font-mono text-xs font-semibold text-gray-800 shadow-sm ring-1 ring-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600">Ctrl</kbd>
              <span class="text-gray-500 dark:text-gray-400">+</span>
              <kbd class="rounded bg-white px-2 py-1 font-mono text-xs font-semibold text-gray-800 shadow-sm ring-1 ring-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600">Space</kbd>
              <span class="text-gray-700 dark:text-gray-300">显示例句</span>
            </div>
            <div class="flex items-center gap-1.5">
              <kbd class="rounded bg-white px-2 py-1 font-mono text-xs font-semibold text-gray-800 shadow-sm ring-1 ring-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600">Tab</kbd>
              <span class="text-gray-700 dark:text-gray-300">重复播放</span>
            </div>
            <div class="flex items-center gap-1.5">
              <kbd class="rounded bg-white px-2 py-1 font-mono text-xs font-semibold text-gray-800 shadow-sm ring-1 ring-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600">Enter</kbd>
              <span class="text-gray-700 dark:text-gray-300">下一个单词</span>
            </div>
            <div class="flex items-center gap-1.5">
              <kbd class="rounded bg-white px-2 py-1 font-mono text-xs font-semibold text-gray-800 shadow-sm ring-1 ring-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600">Shift</kbd>
              <span class="text-gray-500 dark:text-gray-400">+</span>
              <kbd class="rounded bg-white px-2 py-1 font-mono text-xs font-semibold text-gray-800 shadow-sm ring-1 ring-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600">Enter</kbd>
              <span class="text-gray-700 dark:text-gray-300">上一个单词</span>
            </div>
            <div class="flex items-center gap-1.5">
              <kbd class="rounded bg-white px-2 py-1 font-mono text-xs font-semibold text-gray-800 shadow-sm ring-1 ring-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600">{{ isMac() ? 'Command' : 'Alt' }}</kbd>
              <span class="text-gray-500 dark:text-gray-400">+</span>
              <kbd class="rounded bg-white px-2 py-1 font-mono text-xs font-semibold text-gray-800 shadow-sm ring-1 ring-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600">W</kbd>
              <span class="text-gray-700 dark:text-gray-300">特别注意</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 复习计划 -->
      <div class="mt-4 rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-900/20">
        <div class="mb-3 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <i class="i-carbon-calendar text-purple-600 dark:text-purple-400" />
            <span class="text-sm font-semibold text-purple-800 dark:text-purple-300">遗忘曲线复习计划</span>
          </div>
          <button
            type="button"
            class="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600"
            @click="reviewMode = reviewMode === 'all' ? 'review' : 'all'"
          >
            {{ reviewMode === 'all' ? '只看待复习' : '显示全部' }}
          </button>
        </div>

        <!-- 复习统计 -->
        <div class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <div class="rounded-lg border border-purple-200 bg-white p-2 text-center dark:border-purple-700 dark:bg-gray-800">
            <div class="text-lg font-bold text-red-600 dark:text-red-400">{{ reviewStats.overdue }}</div>
            <div class="text-xs text-gray-600 dark:text-gray-400">已过期</div>
          </div>
          <div class="rounded-lg border border-purple-200 bg-white p-2 text-center dark:border-purple-700 dark:bg-gray-800">
            <div class="text-lg font-bold text-orange-600 dark:text-orange-400">{{ reviewStats.today }}</div>
            <div class="text-xs text-gray-600 dark:text-gray-400">今天</div>
          </div>
          <div class="rounded-lg border border-purple-200 bg-white p-2 text-center dark:border-purple-700 dark:bg-gray-800">
            <div class="text-lg font-bold text-yellow-600 dark:text-yellow-400">{{ reviewStats.tomorrow }}</div>
            <div class="text-xs text-gray-600 dark:text-gray-400">明天</div>
          </div>
          <div class="rounded-lg border border-purple-200 bg-white p-2 text-center dark:border-purple-700 dark:bg-gray-800">
            <div class="text-lg font-bold text-blue-600 dark:text-blue-400">{{ reviewStats.thisWeek }}</div>
            <div class="text-xs text-gray-600 dark:text-gray-400">本周</div>
          </div>
          <div class="rounded-lg border border-purple-200 bg-white p-2 text-center dark:border-purple-700 dark:bg-gray-800">
            <div class="text-lg font-bold text-green-600 dark:text-green-400">{{ reviewStats.completed }}</div>
            <div class="text-xs text-gray-600 dark:text-gray-400">已完成</div>
          </div>
        </div>

        <!-- 待复习单词列表 -->
        <div v-if="wordsToReview.length > 0" class="space-y-2">
          <div class="text-xs font-medium text-purple-700 dark:text-purple-300">
            待复习单词（{{ wordsToReview.length }} 个）：
          </div>
          <div class="max-h-48 space-y-1 overflow-y-auto">
            <div
              v-for="word in wordsToReview"
              :key="`${word.id}-${word.category}`"
              class="flex items-center justify-between rounded-lg border border-purple-200 bg-white p-2 dark:border-purple-700 dark:bg-gray-800"
            >
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-gray-900 dark:text-white">
                    {{ word.word.join(', ') }}
                  </span>
                  <span class="text-xs text-gray-500 dark:text-gray-400">
                    {{ word.pos }}
                  </span>
                </div>
                <div class="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  {{ word.meaning }}
                </div>
                <div class="mt-1 flex items-center gap-2 text-xs">
                  <span
                    :class="
                      (word.nextReviewDate || 0) < Date.now()
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-purple-600 dark:text-purple-400'
                    "
                  >
                    {{ formatReviewDate(word.nextReviewDate || 0) }}
                  </span>
                  <span v-if="word.reviewRecords && word.reviewRecords.length > 0" class="text-gray-500 dark:text-gray-400">
                    已复习 {{ word.reviewRecords.length }}/7 次
                  </span>
                </div>
              </div>
              <button
                type="button"
                class="ml-2 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600"
                @click="markAsReviewed(word)"
              >
                标记已复习
              </button>
            </div>
          </div>
        </div>
        <div v-else class="rounded-lg border border-purple-200 bg-white p-3 text-center text-sm text-gray-500 dark:border-purple-700 dark:bg-gray-800 dark:text-gray-400">
          暂无待复习的单词
        </div>
      </div>

      <!-- Auto Play Control -->
      <div v-if="filteredWords.length > 0" class="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <div class="flex flex-wrap items-center gap-4">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">自动播放：</span>
            <button
              v-if="!isAutoPlaying"
              type="button"
              class="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-300 dark:bg-green-600 dark:hover:bg-green-700 dark:focus:ring-green-800"
              @click="startAutoPlay"
            >
              <i class="i-ph-play-bold mr-1" />
              开始播放 ({{ filteredWords.length }} 个单词)
            </button>
            <template v-else>
              <button
                type="button"
                class="rounded-lg bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700 focus:outline-none focus:ring-4 focus:ring-yellow-300 dark:bg-yellow-600 dark:hover:bg-yellow-700 dark:focus:ring-yellow-800"
                @click="pauseAutoPlay"
              >
                <i class="i-ph-pause-bold mr-1" />
                暂停
              </button>
              <button
                type="button"
                class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-300 dark:bg-red-600 dark:hover:bg-red-700 dark:focus:ring-red-800"
                @click="stopAutoPlay"
              >
                <i class="i-ph-stop-bold mr-1" />
                停止
              </button>
            </template>
            <button
              v-if="!isAutoPlaying && currentPlayingIndex >= 0"
              type="button"
              class="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-300 dark:bg-green-600 dark:hover:bg-green-700 dark:focus:ring-green-800"
              @click="resumeAutoPlay"
            >
              <i class="i-ph-play-bold mr-1" />
              继续播放
            </button>
            <button
              v-if="currentPlayingIndex >= 0 && filteredWords.length > 0"
              type="button"
              class="rounded-lg bg-gray-600 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-4 focus:ring-gray-300 dark:bg-gray-600 dark:hover:bg-gray-700 dark:focus:ring-gray-800"
              @click="playPreviousWord"
              :disabled="currentPlayingIndex <= 0"
              title="上一个 (← 或 鼠标4)"
            >
              <i class="i-ph-caret-left-bold" />
            </button>
            <button
              v-if="currentPlayingIndex >= 0 && filteredWords.length > 0"
              type="button"
              class="rounded-lg bg-gray-600 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-4 focus:ring-gray-300 dark:bg-gray-600 dark:hover:bg-gray-700 dark:focus:ring-gray-800"
              @click="replayCurrentWord"
              title="重播 (空格/R 或 中键)"
            >
              <i class="i-ph-repeat-bold" />
            </button>
            <button
              v-if="currentPlayingIndex >= 0 && filteredWords.length > 0"
              type="button"
              class="rounded-lg bg-gray-600 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-4 focus:ring-gray-300 dark:bg-gray-600 dark:hover:bg-gray-700 dark:focus:ring-gray-800"
              @click="playNextWord"
              :disabled="currentPlayingIndex >= filteredWords.length - 1"
              title="下一个 (→ 或 鼠标5)"
            >
              <i class="i-ph-caret-right-bold" />
            </button>
          </div>
          <div v-if="isAutoPlaying" class="flex items-center gap-2">
            <span class="text-sm text-gray-600 dark:text-gray-400">
              正在播放: {{ currentPlayingIndex + 1 }} / {{ filteredWords.length }}
            </span>
            <span v-if="currentPlayingIndex >= 0 && currentPlayingIndex < filteredWords.length" class="text-sm font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-2">
              {{ filteredWords[currentPlayingIndex].word.join(', ') }}
              <i
                v-if="filteredWords[currentPlayingIndex].isSpecialAttention"
                class="i-ph-star-fill text-yellow-500 dark:text-yellow-400"
                title="特别注意"
              />
            </span>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300">播放间隔：</label>
            <input
              v-model.number="playInterval"
              type="number"
              min="1000"
              max="10000"
              step="500"
              class="w-24 border border-gray-300 rounded-lg bg-gray-50 p-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              :disabled="isAutoPlaying"
            >
            <span class="text-sm text-gray-600 dark:text-gray-400">毫秒</span>
          </div>
          <label class="inline-flex cursor-pointer items-center">
            <input v-model="isShowMeaning" type="checkbox" class="peer sr-only">
            <div
              class="peer relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:border after:border-gray-300 dark:border-gray-600 after:rounded-full after:bg-white dark:bg-gray-700 peer-checked:bg-blue-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white dark:peer-focus:ring-blue-800"
            />
            <span class="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300">显示释义</span>
          </label>
          <div class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            <span class="font-medium">快捷键：</span>
            <span>← 上一个</span>
            <span>→ 下一个</span>
            <span>空格 暂停/继续</span>
            <span>R 重播</span>
            <span>{{ specialAttentionShortcut }} 特别注意</span>
            <span>鼠标4 上一个</span>
            <span>鼠标5 下一个</span>
            <span>中键 重播</span>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="mt-4 flex flex-wrap items-center gap-4">
        <div class="flex items-center gap-2">
          <label class="text-sm font-medium text-gray-700 dark:text-gray-300">分类：</label>
          <select
            v-model="selectedCategory"
            class="block border border-gray-300 rounded-lg bg-gray-50 p-2 text-sm text-gray-900 dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:ring-blue-500 dark:focus:border-blue-500 dark:focus:ring-blue-500"
          >
            <option value="">
              全部
            </option>
            <option v-for="cat in categories" :key="cat" :value="cat">
              {{ cat }}
            </option>
          </select>
        </div>
        <div class="flex items-center gap-2">
          <label class="text-sm font-medium text-gray-700 dark:text-gray-300">搜索：</label>
          <input
            v-model="keyword"
            type="text"
            class="block border border-gray-300 rounded-lg bg-gray-50 p-2 text-sm text-gray-900 dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:ring-blue-500 dark:focus:border-blue-500 dark:focus:ring-blue-500"
            placeholder="搜索单词、词义..."
          >
        </div>
        <label class="inline-flex cursor-pointer items-center">
          <input v-model="isTrainingModel" type="checkbox" class="peer sr-only">
          <div
            class="peer relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:border after:border-gray-300 dark:border-gray-600 after:rounded-full after:bg-white dark:bg-gray-700 peer-checked:bg-blue-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white dark:peer-focus:ring-blue-800"
          />
          <span class="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300">练习模式</span>
        </label>
        <label v-if="isTrainingModel" class="inline-flex cursor-pointer items-center">
          <input v-model="isShowMeaning" type="checkbox" class="peer sr-only">
          <div
            class="peer relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:border after:border-gray-300 dark:border-gray-600 after:rounded-full after:bg-white dark:bg-gray-700 peer-checked:bg-blue-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white dark:peer-focus:ring-blue-800"
          />
          <span class="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300">显示释义</span>
        </label>
        <label v-if="isTrainingModel" class="inline-flex cursor-pointer items-center">
          <input v-model="isShowExample" type="checkbox" class="peer sr-only">
          <div
            class="peer relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:border after:border-gray-300 dark:border-gray-600 after:rounded-full after:bg-white dark:bg-gray-700 peer-checked:bg-blue-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white dark:peer-focus:ring-blue-800"
          />
          <span class="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300">显示例句</span>
        </label>
        <label v-if="isTrainingModel" class="inline-flex cursor-pointer items-center">
          <input v-model="isAutoPlayWordAudio" type="checkbox" class="peer sr-only">
          <div
            class="peer relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:border after:border-gray-300 dark:border-gray-600 after:rounded-full after:bg-white dark:bg-gray-700 peer-checked:bg-blue-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white dark:peer-focus:ring-blue-800"
          />
          <span class="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300">自动播放</span>
        </label>
        <label class="inline-flex cursor-pointer items-center">
          <input v-model="onlyShowSpecialAttention" type="checkbox" class="peer sr-only">
          <div
            class="peer relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:border after:border-gray-300 dark:border-gray-600 after:rounded-full after:bg-white dark:bg-gray-700 peer-checked:bg-yellow-500 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-yellow-300 after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white dark:peer-focus:ring-yellow-800"
          />
          <span class="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300">只显示特别注意</span>
        </label>
      </div>

      <!-- Table -->
      <div class="mt-6 flex flex-col">
        <div v-if="filteredWords.length === 0" class="py-12 text-center text-gray-500 dark:text-gray-400">
          <i class="i-ph-bookmark-x mb-4 text-6xl" />
          <p class="text-lg">暂无错题</p>
          <p class="text-sm">点击"手动添加"按钮添加单词到错题本</p>
        </div>
        <div v-else class="overflow-x-auto rounded-lg">
          <div class="inline-block min-w-full align-middle">
            <div class="overflow-hidden shadow sm:rounded-lg">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                <thead class="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th class="p-4 text-left text-xs font-medium tracking-wider text-gray-500 dark:text-white">
                      #
                    </th>
                    <th class="p-4 text-xs font-medium tracking-wider text-gray-500 dark:text-white">
                      <br>
                    </th>
                    <th class="p-4 text-left text-xs font-medium tracking-wider text-gray-500 dark:text-white">
                      词
                    </th>
                    <th class="w-0 text-left text-xs font-medium text-gray-500 dark:text-white">
                      词性
                    </th>
                    <th class="p-4 text-left text-xs font-medium tracking-wider text-gray-500 dark:text-white">
                      词义
                    </th>
                    <th class="p-4 text-left text-xs font-medium tracking-wider text-gray-500 dark:text-white">
                      例句
                    </th>
                    <th class="p-4 text-left text-xs font-medium tracking-wider text-gray-500 dark:text-white">
                      分类
                    </th>
                    <th class="p-4 text-left text-xs font-medium tracking-wider text-gray-500 dark:text-white">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody class="bg-white dark:bg-gray-800">
                  <tr
                    v-for="(item, index) in filteredWords"
                    :key="`${item.id}-${item.category}`"
                    :id="`tr_${item.id}`"
                    :class="{
                      'bg-gray-50 dark:bg-gray-700': index % 2 === 0 && index !== currentPlayingIndex,
                      'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500': index === currentPlayingIndex && isAutoPlaying,
                    }"
                    class="text-sm text-gray-900 dark:text-white transition-colors"
                  >
                    <td class="p-4">
                      {{ index + 1 }}
                    </td>
                    <td>
                      <i
                        v-if="index !== currentPlayingIndex || !isAutoPlaying"
                        class="i-ph-speaker-simple-high-bold inline-block cursor-pointer"
                        @click="play(`vocabulary/audio/${item.category}/${item.word[0]}.mp3`)"
                      />
                      <i
                        v-else
                        class="i-ph-speaker-simple-high-bold inline-block cursor-pointer text-blue-600 dark:text-blue-400 animate-pulse"
                        title="正在播放"
                      />
                      <template v-if="isTrainingModel">
                        <input
                          :id="item.id.toString()"
                          autocomplete="off"
                          :class="getInputStyleClass(item)"
                          type="text"
                          :title="`按 Ctrl+Space 显示例句，按 Tab 重复播放，按 Enter 下一个，按 Shift+Enter 上一个，按 ${specialAttentionShortcut} 切换特别注意`"
                          @focusout="onInputFoucsOut($event, item)"
                          @focusin="onInputFoucsIn($event, `vocabulary/audio/${item.category}/${item.word[0]}.mp3`)"
                          @keydown="onInputKeydown($event, `vocabulary/audio/${item.category}/${item.word[0]}.mp3`, item)"
                        >
                      </template>
                    </td>
                    <td class="group relative whitespace-nowrap p-4">
                      <div v-if="!isTrainingModel || isShowSource" class="flex items-center gap-2">
                        <div class="flex-1">
                          <p v-for="w in item.word" :key="w">
                            <a
                              class="hover:underline"
                              :title="`在剑桥词典中查询 ${w}`"
                              target="_blank"
                              :href="`https://dictionary.cambridge.org/dictionary/english-chinese-simplified/${w}`"
                            >{{ w }}</a>
                          </p>
                        </div>
                        <i
                          v-if="item.isSpecialAttention"
                          class="i-ph-star-fill text-yellow-500 dark:text-yellow-400"
                          title="特别注意"
                        />
                        <div
                          class="absolute right-0 top-0 hidden h-100% items-center group-hover:flex"
                          @click="copyText(item)"
                        >
                          <i class="i-ph-copy block cursor-pointer px-4" />
                        </div>
                      </div>
                      <div v-else class="flex items-center gap-2">
                        <!-- 练习模式下单词被隐藏时的占位 -->
                        <i
                          v-if="item.isSpecialAttention"
                          class="i-ph-star-fill text-yellow-500 dark:text-yellow-400"
                          title="特别注意"
                        />
                      </div>
                    </td>
                    <td style="font-style: italic; font-family: times;">
                      {{ item.pos }}
                    </td>
                    <td class="p-4">
                      {{ isShowMeaning ? item.meaning : '' }}
                    </td>
                    <td class="p-4">
                      {{ isShowExample ? item.example : '' }}
                    </td>
                    <td class="p-4">
                      {{ item.category }}
                    </td>
                    <td class="p-4">
                      <div class="flex items-center gap-2">
                        <button
                          type="button"
                          :class="item.isSpecialAttention ? 'text-yellow-500 hover:text-yellow-600 dark:text-yellow-400' : 'text-gray-400 hover:text-yellow-500 dark:hover:text-yellow-400'"
                          @click="toggleWordSpecialAttention(item)"
                          :title="item.isSpecialAttention ? `取消特别注意 (${specialAttentionShortcut})` : `添加特别注意 (${specialAttentionShortcut})`"
                        >
                          <i :class="item.isSpecialAttention ? 'i-ph-star-fill text-xl' : 'i-ph-star text-xl'" />
                        </button>
                        <button
                          type="button"
                          class="text-red-600 hover:text-red-700"
                          @click="removeWord(item)"
                          title="从错题本移除"
                        >
                          <i class="i-ph-trash text-xl" />
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div v-if="isTrainingModel" class="mt-4 flex items-center justify-between">
        <div>
          <p>{{ trainingStats }}</p>
        </div>
      </div>
    </div>

    <!-- 导入对话框 -->
    <div
      v-if="showImportDialog"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      @click.self="showImportDialog = false"
    >
      <div class="w-full max-w-2xl rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
        <h3 class="mb-4 text-xl font-bold text-gray-900 dark:text-white">
          导入错题本
        </h3>

        <!-- 文件上传按钮 -->
        <div class="mb-4 flex justify-center gap-3">
          <input
            ref="fileInputRef"
            type="file"
            accept=".json"
            class="hidden"
            @change="handleFileChange"
          >
          <button
            type="button"
            class="rounded-lg bg-green-600 px-6 py-3 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-300 dark:bg-green-600 dark:hover:bg-green-700 dark:focus:ring-green-800 flex items-center gap-2"
            @click="handleFileSelect"
          >
            <i class="i-ph-file-arrow-up-bold text-lg" />
            选择本地JSON文件
          </button>
          <button
            type="button"
            class="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-300 dark:bg-indigo-600 dark:hover:bg-indigo-700 dark:focus:ring-indigo-800 flex items-center gap-2"
            @click="handleAutoImport"
          >
            <i class="i-ph-download-simple-bold text-lg" />
            自动导入项目错题本
          </button>
        </div>

        <div class="mb-4 text-center text-sm text-gray-500 dark:text-gray-400">
          或者手动粘贴JSON内容
        </div>

        <textarea
          v-model="importText"
          rows="10"
          class="mb-4 w-full border border-gray-300 rounded-lg bg-gray-50 p-3 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          placeholder="请粘贴JSON格式的错题本数据..."
        />
        <div v-if="importResult" class="mb-4 rounded-lg p-3" :class="importResult.includes('成功') ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'">
          {{ importResult }}
        </div>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            @click="showImportDialog = false; importText = ''; importResult = ''"
          >
            取消
          </button>
          <button
            type="button"
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
            @click="handleImport"
          >
            导入
          </button>
        </div>
      </div>
    </div>

    <!-- 添加单词对话框 -->
    <div
      v-if="showAddDialog"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      @click.self="showAddDialog = false"
    >
      <div class="w-full max-w-2xl rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
        <h3 class="mb-4 text-xl font-bold text-gray-900 dark:text-white">
          手动添加单词
        </h3>
        <div class="space-y-4">
          <div>
            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              单词 <span class="text-red-500">*</span>（多个单词用逗号分隔）
            </label>
            <input
              v-model="newWord.word"
              type="text"
              class="w-full border border-gray-300 rounded-lg bg-gray-50 p-2.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              placeholder="例如: word, words"
            >
          </div>
          <div>
            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              词性
            </label>
            <input
              v-model="newWord.pos"
              type="text"
              class="w-full border border-gray-300 rounded-lg bg-gray-50 p-2.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              placeholder="例如: n."
            >
          </div>
          <div>
            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              词义 <span class="text-red-500">*</span>
            </label>
            <input
              v-model="newWord.meaning"
              type="text"
              class="w-full border border-gray-300 rounded-lg bg-gray-50 p-2.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              placeholder="例如: 单词；词语"
            >
          </div>
          <div>
            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              例句
            </label>
            <input
              v-model="newWord.example"
              type="text"
              class="w-full border border-gray-300 rounded-lg bg-gray-50 p-2.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              placeholder="例如: This is an example sentence."
            >
          </div>
          <div>
            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              拓展
            </label>
            <input
              v-model="newWord.extra"
              type="text"
              class="w-full border border-gray-300 rounded-lg bg-gray-50 p-2.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              placeholder="例如: 拓展信息"
            >
          </div>
          <div>
            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              分类 <span class="text-red-500">*</span>
            </label>
            <div class="flex gap-2">
              <select
                v-model="newWord.category"
                class="flex-1 border border-gray-300 rounded-lg bg-gray-50 p-2.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="">
                  选择或输入分类
                </option>
                <option v-for="cat in categories" :key="cat" :value="cat">
                  {{ cat }}
                </option>
              </select>
              <input
                v-model="newWord.category"
                type="text"
                class="flex-1 border border-gray-300 rounded-lg bg-gray-50 p-2.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                placeholder="或输入新分类，例如: 01_自然地理"
              >
            </div>
          </div>
        </div>
        <!-- 提示：单词已在错题本中 -->
        <div v-if="currentWordInErrorBook" class="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <i class="i-ph-warning-circle text-yellow-600 dark:text-yellow-400" />
              <span class="text-sm text-yellow-800 dark:text-yellow-300">
                该单词已在错题本中
              </span>
            </div>
            <button
              type="button"
              class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 flex items-center gap-2"
              @click="removeCurrentWordFromErrorBook"
            >
              <i class="i-ph-trash" />
              移出错题本
            </button>
          </div>
        </div>
        <div class="mt-6 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            @click="showAddDialog = false"
          >
            取消
          </button>
          <button
            type="button"
            class="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            @click="handleAddWord"
          >
            {{ currentWordInErrorBook ? '已存在' : '添加' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Git同步对话框 -->
    <div
      v-if="showGitSyncDialog"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      @click.self="showGitSyncDialog = false"
    >
      <div class="w-full max-w-3xl rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
        <h3 class="mb-4 text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <i class="i-ph-git-branch-bold" />
          通过 Git 同步错题本
        </h3>

        <div class="mb-6 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/30">
          <p class="text-sm text-blue-700 dark:text-blue-300">
            <i class="i-ph-info-bold mr-2" />
            此功能将帮助你把错题本数据同步到其他电脑，适合在多台电脑间共享学习进度。
          </p>
        </div>

        <!-- 步骤1: 一键导出到项目文件 -->
        <div class="mb-6">
          <div class="mb-3 flex items-center gap-2">
            <div class="flex h-8 w-8 items-center justify-center rounded-full" :class="gitSyncStep >= 1 ? 'bg-orange-600 text-white' : 'bg-gray-300 text-gray-600'">
              1
            </div>
            <h4 class="text-lg font-semibold text-gray-900 dark:text-white">
              一键导出到项目文件
            </h4>
          </div>
          <div class="ml-10 space-y-3">
            <p class="text-sm text-gray-600 dark:text-gray-400">
              点击下面的按钮，自动将错题本保存到项目文件（共 {{ errorWords.length }} 个单词）
            </p>
            <button
              type="button"
              class="rounded-lg bg-orange-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-300"
              @click="exportAndSaveToProject"
            >
              <i class="i-ph-floppy-disk-bold mr-2" />
              自动保存到 public/data/error-book.json
            </button>
            <div v-if="importResult" class="rounded-lg p-3 text-sm" :class="importResult.includes('✅') ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'">
              {{ importResult }}
            </div>
          </div>
        </div>

        <!-- 步骤2: Git提交 -->
        <div class="mb-6" :class="gitSyncStep < 2 ? 'opacity-50' : ''">
          <div class="mb-3 flex items-center gap-2">
            <div class="flex h-8 w-8 items-center justify-center rounded-full" :class="gitSyncStep >= 2 ? 'bg-orange-600 text-white' : 'bg-gray-300 text-gray-600'">
              2
            </div>
            <h4 class="text-lg font-semibold text-gray-900 dark:text-white">
              提交并推送到GitHub
            </h4>
          </div>
          <div class="ml-10 space-y-2">
            <p class="text-sm text-gray-600 dark:text-gray-400">
              在项目目录执行以下命令：
            </p>
            <div class="space-y-2">
              <code class="block rounded-lg bg-gray-800 px-4 py-2 text-sm text-green-400 font-mono">
                git add public/data/error-book.json
              </code>
              <code class="block rounded-lg bg-gray-800 px-4 py-2 text-sm text-green-400 font-mono">
                git commit -m "update error book"
              </code>
              <code class="block rounded-lg bg-gray-800 px-4 py-2 text-sm text-green-400 font-mono">
                git push
              </code>
            </div>
          </div>
        </div>

        <!-- 步骤3: 在另一台电脑导入 -->
        <div class="mb-6" :class="gitSyncStep < 2 ? 'opacity-50' : ''">
          <div class="mb-3 flex items-center gap-2">
            <div class="flex h-8 w-8 items-center justify-center rounded-full" :class="gitSyncStep >= 2 ? 'bg-orange-600 text-white' : 'bg-gray-300 text-gray-600'">
              3
            </div>
            <h4 class="text-lg font-semibold text-gray-900 dark:text-white">
              在另一台电脑导入
            </h4>
          </div>
          <div class="ml-10 space-y-2">
            <p class="text-sm text-gray-600 dark:text-gray-400">
              在另一台电脑上，先拉取最新代码：
            </p>
            <code class="block rounded-lg bg-gray-800 px-4 py-2 text-sm text-green-400 font-mono">
              git pull
            </code>
            <p class="text-sm text-gray-600 dark:text-gray-400 mt-3">
              然后打开错题本页面，点击 <span class="font-semibold text-indigo-600 dark:text-indigo-400">"导入"</span> 按钮，再点击 <span class="font-semibold text-indigo-600 dark:text-indigo-400">"自动导入项目错题本"</span> 即可！
            </p>
          </div>
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            @click="showGitSyncDialog = false; gitSyncStep = 1"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

