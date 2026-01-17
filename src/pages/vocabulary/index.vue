<!-- eslint-disable eslint-comments/no-unlimited-disable -->
<script setup lang="ts">
import vocabulary from './vocabulary'
import { addToErrorBook, removeFromErrorBook, isInErrorBook, getErrorBookStats } from '~/composables/errorBook'
import { useRouter } from 'vue-router'
import { isAltKeyPressed } from '~/composables/useKeyboard'

const router = useRouter()
const CHAPTER_KEY = 'vocabulary_chapter'

const isTrainingModel = ref(false)
const isShowMeaning = ref(true)
const isShowExample = ref(true)
const isAutoPlayWordAudio = ref(true)
const isOnlyShowErrors = ref(false)
const isFinishTraining = ref(false)
const isShowSource = ref(false)

const trainingStats = ref('')
const keyword = ref('')
const chapters = Object.keys(vocabulary)
const category = ref<string>(localStorage.getItem(CHAPTER_KEY) || (chapters.length > 0 ? chapters[0] : ''))

const loaded = ref(false)
const refVocabulary = reactive(vocabulary)
const wordList = computed(() => {
  const result = structuredClone(vocabulary) // deep clone
  // const keywordValue = keyword.value.trim().toLowerCase()
  const categoryValue = category.value

  if (categoryValue !== '') {
    // for (const key in result) {
    //   if (key !== categoryValue)
    //     delete result[key]
    // }
    return { [categoryValue]: result[categoryValue] }
  }

  /* if (keywordValue !== '') {
    for (const key in result) {
      const category = result[key]
      const words = []
      category.words.forEach((group) => {
        words.push(group.filter((item) => {
          return item.word.toLowerCase().includes(keywordValue)
        }))
      })
      category.words = words
    }
  } */
  return {}
})

watch(category, (newVal, oldVal) => {
  // console.log(newVal, oldVal)
  localStorage.setItem(CHAPTER_KEY, newVal)
})

function calcStats() {
  let error = 0
  let missing = 0
  let correct = 0
  if (isTrainingModel.value && category.value) {
    const cur = refVocabulary[category.value]
    if (cur && cur.words) {
      // 遍历所有单词的属性
      for (const group of cur.words) {
        for (const item of group) {
          if (item.spellValue) {
            if (item.spellError)
              error++
            else
              correct++
          }
          else { missing++ }
        }
      }
    }
  }
  return `${missing} 个未完成，${correct} 个正确，${error} 个错误`
}


function reloadAudioElements() {
  // 音频再切换 SRC 之后需要调用一下 load() 不然看不到效果
  const audioElements = document.getElementsByTagName('audio')
  for (const el of audioElements) {
    el.load()
  }
}

onUpdated(() => {
  reloadAudioElements()
})

function handleKeydown(ev: KeyboardEvent) {
  // 激活的那个音频可以通过方向键进行快进/退
  if (['ArrowLeft', 'ArrowRight', ' '].includes(ev.key)) {
    ev.preventDefault()
    const audioTags = document.getElementsByTagName('audio')
    const keyMap: Record<string, number> = {
      ArrowLeft: -5,
      ArrowRight: 5,
    }
    for (const audioTag of audioTags) {
      audioTag.blur()
      if (keyMap[ev.key]) {
        const step = keyMap[ev.key]
        audioTag.currentTime = audioTag.currentTime + step
      }
      if (ev.key === ' ') {
        if (audioTag.paused)
          audioTag.play()
        else
          audioTag.pause()
      }
    }
  }
}

// 监听 localStorage 变化（跨标签页同步错题本数据）
function handleStorageChange(e: StorageEvent) {
  if (e.key === 'vocabulary_error_book' && e.newValue !== e.oldValue) {
    // 强制更新错题本统计
    errorBookStatsKey.value++
  }
}

// 监听页面可见性变化，当页面重新可见时重新加载错题本统计
function handleVisibilityChange() {
  if (!document.hidden) {
    errorBookStatsKey.value++
  }
}

onMounted(() => {
  loaded.value = true
  document.addEventListener('keydown', handleKeydown)

  // 只能同时播放一个音频
  const audioTags = document.getElementsByTagName('audio')
  for (const audio of audioTags) {
    audio.onplay = () => {
      for (const _audio of audioTags) {
        _audio.blur()
        if (audio !== _audio)
          _audio.pause()
      }
    }
  }

  // 监听 localStorage 变化（跨标签页同步）
  window.addEventListener('storage', handleStorageChange)
  // 监听页面可见性变化
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

let audio: HTMLAudioElement | null = null
const currentAudioPath = ref<string>('')

function play(audioPath: string) {
  if (audio) {
    audio.pause()
    audio.currentTime = 0
  }
  audio = document.createElement('audio')
  audio.src = audioPath
  currentAudioPath.value = audioPath
  audio.play()
}

function replayCurrentAudio() {
  if (currentAudioPath.value) {
    play(currentAudioPath.value)
  }
}

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  if (audio) {
    audio.pause()
    audio = null
  }
  // 清理 localStorage 和页面可见性监听器
  window.removeEventListener('storage', handleStorageChange)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

function copyText(item: any) {
  const wordText = Array.isArray(item.word) ? item.word.join(', ') : item.word
  const text = wordText + ' ' + item.pos + ' ' + item.meaning
  navigator.clipboard.writeText(text)
}

function onInputKeydown(e: KeyboardEvent, audioPath: string, item: any) {
  e.stopPropagation()
  const target = e.target as HTMLInputElement

  if (e.key === ' ') {
    e.preventDefault() // 阻止默认的空格键行为
    if (e.ctrlKey) {
      // Ctrl + Space: 切换显示/隐藏例句
      isShowExample.value = !isShowExample.value
    }
    else {
      // Space: 切换显示/隐藏单词（使用全局 isShowSource）
      isShowSource.value = !isShowSource.value
    }
  }
  else if (e.key === 'Tab') {
    e.preventDefault() // 阻止默认的 Tab 行为
    // 重复播放当前单词的音频
    play(audioPath)
    currentAudioPath.value = audioPath
  }
  else if (e.key === 'Enter' && target.id) {
    if (e.shiftKey) {
      e.preventDefault()
      // Shift + Enter: 切换到上一个 input
      const prevId = Number(target.id) - 1
      if (prevId > 0) {
        document.getElementById(prevId.toString())?.focus()
      }
    }
    else {
      // Enter: 切换到下一个 input
      document.getElementById((Number(target.id) + 1).toString())?.focus()
    }
  }
  else if (e.key === 'w' && isAltKeyPressed(e)) {
    e.preventDefault()
    // Alt + W: 加入/取消错题本（Mac 上 Option + W）
    toggleErrorBook(item)
  }
}

function onInputFocusIn(e: FocusEvent, audioPath: string) {
  currentAudioPath.value = audioPath
  if (isAutoPlayWordAudio.value)
    play(audioPath)
}

function checkSpelling(item: any, value: string) {
  const spellValue = value.toLowerCase().trim()
  if (spellValue.length < 1) {
    item.spellValue = ''
    item.spellError = false
  }
  else {
    item.spellValue = spellValue
    const wordArray = Array.isArray(item.word) ? item.word : [item.word]
    item.spellError = !wordArray.map((v: string) => v.toLowerCase().trim()).includes(spellValue)
  }
  trainingStats.value = calcStats()
}

function onInputFocusOut(e: FocusEvent, item: any) {
  const target = e.target as HTMLInputElement
  checkSpelling(item, target.value)
}

function onInputChange(e: Event, item: any) {
  const target = e.target as HTMLInputElement
  checkSpelling(item, target.value)
}

function getInputStyleClass(item: any) {
  const cls = {
    error: 'ml-4 bg-red-50 border border-red-500 text-red-900 placeholder-red-700 text-sm rounded-lg focus:ring-red-500 dark:bg-gray-700 focus:border-red-500 inline-block p-2.5 dark:text-red-500 dark:placeholder-red-500 dark:border-red-500',
    normal: 'ml-4 inline-block border border-gray-300 rounded-lg bg-gray-50 p-2.5 text-sm text-gray-900 dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:ring-blue-500 dark:focus:border-blue-500 dark:focus:ring-blue-500 dark:placeholder-gray-400',
    success: 'ml-4 bg-green-50 border border-green-500 text-green-900 dark:text-green-400 placeholder-green-700 dark:placeholder-green-500 text-sm rounded-lg focus:ring-green-500 focus:border-green-500 inline-block p-2.5 dark:bg-gray-700 dark:border-green-500',
  }
  // 如果有输入值，立即显示对错状态
  if (item.spellValue && item.spellValue.length > 0) {
    if (item.spellError)
      return cls.error
    if (!item.spellError)
      return cls.success
  }
  return cls.normal
}

function copyAllError() {
  if (!category.value || !refVocabulary[category.value]) {
    return
  }
  const words = refVocabulary[category.value].words
  const errorWords: string[] = []
  for (const group of words) {
    for (const item of group) {
      if (item.spellError) {
        const wordText = Array.isArray(item.word) ? item.word.join(', ') : item.word
        const text = wordText + ' ' + item.pos + ' ' + item.meaning
        errorWords.push(text)
      }
    }
  }
  navigator.clipboard.writeText(errorWords.join('\n\n'))
}

// 错题本相关函数
const recentlyToggledItems = ref<Set<number>>(new Set())

function toggleErrorBook(item: any) {
  const wordData = {
    id: item.id,
    word: item.word,
    pos: item.pos,
    meaning: item.meaning,
    example: item.example,
    extra: item.extra,
    category: category.value,
  }

  const wasInBook = isInErrorBook(item.id, category.value)

  if (wasInBook) {
    removeFromErrorBook(item.id, category.value)
  }
  else {
    const success = addToErrorBook(wordData)
    if (success) {
      // 添加成功，触发视觉反馈
      recentlyToggledItems.value.add(item.id)
      setTimeout(() => {
        recentlyToggledItems.value.delete(item.id)
      }, 1000) // 1秒后移除高亮
    }
  }

  // 强制更新统计
  errorBookStatsKey.value++
}

function goToErrorBook() {
  router.push('/vocabulary/error-book')
}

// 使用 ref 来强制更新统计
const errorBookStatsKey = ref(0)
const errorBookStats = computed(() => {
  // 通过 key 变化来触发重新计算
  errorBookStatsKey.value
  return getErrorBookStats()
})
</script>

<template>
  <div class="px-4 pt-6 2xl:px-0">
    <!-- 快捷键提示卡片：仅在练习模式下显示 -->
      <div v-if="isTrainingModel" class="mb-4 border border-blue-200 rounded-lg bg-blue-50 p-3 shadow-sm dark:border-blue-800 dark:bg-blue-900/20">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <i class="i-carbon-keyboard text-lg text-blue-600 dark:text-blue-400" />
            <span class="text-sm font-semibold text-blue-800 dark:text-blue-300">快捷键：</span>
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
              <kbd class="rounded bg-white px-2 py-1 font-mono text-xs font-semibold text-gray-800 shadow-sm ring-1 ring-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600">Alt</kbd>
              <span class="text-gray-500 dark:text-gray-400">+</span>
              <kbd class="rounded bg-white px-2 py-1 font-mono text-xs font-semibold text-gray-800 shadow-sm ring-1 ring-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-600">W</kbd>
              <span class="text-gray-700 dark:text-gray-300">错题本</span>
            </div>
          </div>
        </div>
      </div>

    <div class="border border-gray-200 rounded-lg bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
      <!-- Card header -->
      <div class="items-center justify-between lg:flex">
        <div class="mb-4 lg:mb-0">
          <h3 class="mb-2 text-xl font-bold text-gray-900 dark:text-white">
            雅思词汇真经
          </h3>
          <span class="text-base font-normal text-gray-500 dark:text-gray-400">涵盖雅思必备核心词，逻辑词群记忆法</span>
        </div>
        <div class="items-center sm:flex">
          <div class="flex items-center">
            <button
              type="button"
              class="mr-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-300 dark:bg-red-600 dark:hover:bg-red-700 dark:focus:ring-red-800"
              @click="goToErrorBook"
            >
              <i class="i-ph-bookmark-bold mr-1" />
              错题本 ({{ errorBookStats.total }})
            </button>
            <select
              v-model="category"
              class="block w-full flex-1 border border-gray-300 rounded-lg bg-gray-50 p-2.5 text-sm text-gray-900 dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:ring-blue-500 dark:focus:border-blue-500 dark:focus:ring-blue-500 dark:placeholder-gray-400"
            >
              <!-- <option value="">
                全部章节
              </option> -->
              <option v-for="(_, k) in refVocabulary" :key="k" :value="k">
                {{ k }}
              </option>
            </select>
            <!-- <input type="text" name="email" class="ml-3 block w-full border border-gray-300 rounded-lg bg-gray-50 p-2.5 text-gray-900 dark:border-gray-600 focus:border-primary-500 dark:bg-gray-700 sm:text-sm dark:text-white focus:ring-primary-500 dark:focus:border-primary-500 dark:focus:ring-primary-500 dark:placeholder-gray-400" placeholder="关键词"> -->
            <!-- <div class="relative ml-2 flex-1">
              <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <svg class="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20">
                  <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z" />
                </svg>
              </div>
              <input v-model="keyword" type="search"
                class="block w-full border border-gray-300 rounded-lg bg-gray-50 p-2.5 pl-10 text-sm text-gray-900 dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:ring-blue-500 dark:focus:border-blue-500 dark:focus:ring-blue-500 dark:placeholder-gray-400"
                placeholder="Search">
            </div> -->
            <label class="ml-2 inline-flex cursor-pointer items-center">
              <input v-model="isTrainingModel" type="checkbox" class="peer sr-only">
              <div
                class="peer relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:border after:border-gray-300 dark:border-gray-600 after:rounded-full after:bg-white dark:bg-gray-700 peer-checked:bg-blue-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white dark:peer-focus:ring-blue-800 rtl:peer-checked:after:-translate-x-full"
              />
              <span class="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300">练习模式</span>
            </label>
            <label v-if="isTrainingModel" class="ml-2 inline-flex cursor-pointer items-center">
              <input v-model="isShowMeaning" type="checkbox" class="peer sr-only">
              <div
                class="peer relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:border after:border-gray-300 dark:border-gray-600 after:rounded-full after:bg-white dark:bg-gray-700 peer-checked:bg-blue-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white dark:peer-focus:ring-blue-800 rtl:peer-checked:after:-translate-x-full"
              />
              <span class="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300">释义</span>
            </label>
            <label v-if="isTrainingModel" class="ml-2 inline-flex cursor-pointer items-center">
              <input v-model="isShowExample" type="checkbox" class="peer sr-only">
              <div
                class="peer relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:border after:border-gray-300 dark:border-gray-600 after:rounded-full after:bg-white dark:bg-gray-700 peer-checked:bg-blue-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white dark:peer-focus:ring-blue-800 rtl:peer-checked:after:-translate-x-full"
              />
              <span class="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300">例句</span>
            </label>
            <label v-if="isTrainingModel" class="ml-2 inline-flex cursor-pointer items-center">
              <input v-model="isShowSource" type="checkbox" class="peer sr-only">
              <div
                class="peer relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:border after:border-gray-300 dark:border-gray-600 after:rounded-full after:bg-white dark:bg-gray-700 peer-checked:bg-blue-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white dark:peer-focus:ring-blue-800 rtl:peer-checked:after:-translate-x-full"
              />
              <span class="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300">原词</span>
            </label>
            <label v-if="isTrainingModel" class="ml-2 inline-flex cursor-pointer items-center">
              <input v-model="isAutoPlayWordAudio" type="checkbox" class="peer sr-only">
              <div
                class="peer relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:border after:border-gray-300 dark:border-gray-600 after:rounded-full after:bg-white dark:bg-gray-700 peer-checked:bg-blue-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white dark:peer-focus:ring-blue-800 rtl:peer-checked:after:-translate-x-full"
              />
              <span class="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300">自动播放</span>
            </label>
          </div>
        </div>
      </div>
      <!-- Table -->
      <div class="mt-6 flex flex-col">
        <div class="overflow-x-auto rounded-lg">
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
                      拓展
                    </th>
                    <th class="p-4 text-left text-xs font-medium tracking-wider text-gray-500 dark:text-white">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody class="bg-white dark:bg-gray-800">
                  <tr class="bg-hex-f3f3f3">
                    <td
                      colspan="8"
                      class="px-4 py-6 text-sm font-normal text-gray-900 dark:bg-gray-500 dark:text-white"
                    >
                      <div class="flex flex-row">
                        <div class="flex flex-1 items-center">
                          <span class="text-lg">{{ category }}</span>
                          <span v-if="refVocabulary[category]">
                            （ {{ refVocabulary[category].groupCount }} 组 {{ refVocabulary[category].wordCount }} 个词 ）
                          </span>
                        </div>
                        <div class="justify-items-end">
                          <audio controls class="chapter">
                            <source :src="`vocabulary/audio/${refVocabulary[category].audio}`" type="audio/mpeg">
                          </audio>
                        </div>
                      </div>
                    </td>
                  </tr>
                  <template v-if="refVocabulary[category] && refVocabulary[category].words">
                    <template v-for="(wordGroup, i) of refVocabulary[category].words" :key="wordGroup.label">
                    <tr
                      v-for="item of wordGroup"
                      v-show="!isTrainingModel || (isOnlyShowErrors ? item.spellError : true)"
                      :id="`tr_${item.id}`"
                      :key="item.id"
                      :class="{
                        'bg-gray-50 dark:bg-gray-700': item.id % 2 === 0 && !(isTrainingModel && item.spellValue && item.spellError),
                        'bg-red-100 dark:bg-red-900/30 border-l-4 border-red-500': isTrainingModel && item.spellValue && item.spellValue.length > 0 && item.spellError,
                        [`group-color-${i % 15}`]: true
                      }"
                      class="text-sm text-gray-900 dark:text-white transition-colors"
                    >
                      <td class="p-4">
                        {{ item.id }}
                      </td>
                      <td>
                        <i
                          v-if="item.word && item.word.length > 0"
                          class="i-ph-speaker-simple-high-bold inline-block cursor-pointer"
                          @click="play(`vocabulary/audio/${category}/${item.word[0]}.mp3`)"
                        />

                        <template v-if="isTrainingModel">
                          <i
                            :class="`${item.showSource ? 'i-ph-eye-slash-bold' : 'i-ph-eye-bold'} inline-block cursor-pointer ml-4`"
                            title="显示原词" @click="item.showSource = !item.showSource"
                          />
                          <input
                            v-if="item.word && item.word.length > 0"
                            :id="item.id" autocomplete="off" :class="getInputStyleClass(item)"
                            type="text"
                            :title="`按 Space 显示单词，按 Ctrl+Space 显示例句，按 Tab 重复播放，按 Enter 下一个，按 Shift+Enter 上一个，按 Alt+W 错题本`"
                            @input="onInputChange($event, item)"
                            @focusout="onInputFocusOut($event, item)"
                            @focusin="onInputFocusIn($event, `vocabulary/audio/${category}/${item.word[0]}.mp3`)"
                            @keydown="onInputKeydown($event, `vocabulary/audio/${category}/${item.word[0]}.mp3`, item)"
                          >
                        </template>
                      </td>
                      <td class="group relative whitespace-nowrap p-4">
                        <div class="flex items-center gap-2">
                          <div v-if="!isTrainingModel || (isTrainingModel && isOnlyShowErrors && item.spellError) || isShowSource" class="flex-1">
                            <p v-for="w in item.word" :key="w">
                              <a
                                class="hover:underline" :title="`在剑桥词典中查询 ${w}`" target="_blank"
                                :href="`https://dictionary.cambridge.org/dictionary/english-chinese-simplified/${w}`"
                              >{{ w }}</a>
                            </p>

                            <div
                              class="absolute right-0 top-0 hidden h-100% items-center group-hover:flex"
                              @click="copyText(item)"
                            >
                              <i class="i-ph-copy block cursor-pointer px-4" />
                            </div>
                          </div>
                          <div v-else class="flex-1">
                            <!-- 练习模式下单词被隐藏时的占位 -->
                          </div>
                          <button
                            type="button"
                            :class="[
                              isInErrorBook(item.id, category)
                                ? 'text-white bg-red-500 hover:bg-red-600 border border-red-600'
                                : 'text-gray-700 bg-gray-200 hover:bg-gray-300 border border-gray-300 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:border-gray-600',
                              recentlyToggledItems.has(item.id) ? 'animate-pulse scale-110 ring-2 ring-red-400 ring-offset-2' : ''
                            ]"
                            @click.stop="toggleErrorBook(item)"
                            :title="isInErrorBook(item.id, category) ? '从错题本移除' : '添加到错题本'"
                            class="px-3 py-1.5 rounded-md transition-all duration-300 flex-shrink-0 inline-flex items-center justify-center text-sm font-medium shadow-sm"
                          >
                            <i :class="[
                              isInErrorBook(item.id, category) ? 'i-ph-bookmark-fill' : 'i-ph-bookmark',
                              'text-base mr-1 transition-transform duration-300',
                              recentlyToggledItems.has(item.id) ? 'scale-125' : ''
                            ]" />
                            <span>{{ isInErrorBook(item.id, category) ? '已添加' : '添加' }}</span>
                          </button>
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
                        {{ isTrainingModel ? '' : item.extra }}
                      </td>
                      <td class="p-4">
                        <button
                          type="button"
                          :class="[
                            isInErrorBook(item.id, category) ? 'text-red-600 hover:text-red-700' : 'text-gray-500 hover:text-gray-700',
                            recentlyToggledItems.has(item.id) ? 'animate-pulse scale-125 ring-2 ring-red-400' : ''
                          ]"
                          @click="toggleErrorBook(item)"
                          :title="isInErrorBook(item.id, category) ? '从错题本移除' : '添加到错题本'"
                          class="transition-all duration-300 p-1 rounded"
                        >
                          <i :class="isInErrorBook(item.id, category) ? 'i-ph-bookmark-fill' : 'i-ph-bookmark'" class="text-xl" />
                        </button>
                      </td>
                    </tr>
                    </template>
                  </template>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <!-- Card Footer -->
      <div class="flex items-center justify-between pt-3 sm:pt-6">
        <div>
          <p v-if="isTrainingModel">
            {{ trainingStats }}
          </p>
        </div>
        <div v-if="isTrainingModel" class="flex-shrink-0">
          <button
            type="button"
            class="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white dark:bg-blue-600 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
            @click="isFinishTraining = true"
          >
            完成练习
          </button>
          <button
            type="button"
            class="ml-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white dark:bg-blue-600 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
            @click="isOnlyShowErrors = !isOnlyShowErrors"
          >
            {{ isOnlyShowErrors ? '展示所有' : '仅展示错词' }}
          </button>
          <button
            type="button"
            class="ml-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white dark:bg-blue-600 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
            @click="copyAllError"
          >
            拷贝错词
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
