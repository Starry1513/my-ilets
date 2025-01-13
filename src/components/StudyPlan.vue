<script setup lang="ts">
import { useStudyPlan } from '~/composables/useStudyPlan'

defineOptions({
  name: 'StudyPlan',
})

const {
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
  toggleVocabChapter,
  toggleListeningSection,
  formatDate,
  formatTime,
  resetAll,
  toggleTimer,
  getTaskCurrentTime,
  exportData,
  importData,
  importFromFile,
  VOCAB_TOTAL_CHAPTERS,
  LISTENING_TOTAL_SECTIONS,
  VOCAB_DAILY_GOAL,
  LISTENING_DAILY_GOAL,
} = useStudyPlan()

// 控制侧边栏显示/隐藏（默认显示）
const isOpen = useLocalStorage('study-plan-open', true)

// 响应式：检测是否为移动端
const isMobile = useMediaQuery('(max-width: 768px)')

// 移动端控制显示/隐藏
const isMobileOpen = ref(false)

// 监听屏幕尺寸变化，在桌面端自动显示
watch(isMobile, (mobile: boolean) => {
  if (!mobile) {
    // 切换到桌面端时，恢复默认显示状态
    isMobileOpen.value = false
  }
  else {
    // 切换到移动端时，默认隐藏
    isMobileOpen.value = false
  }
})

// 计算实际显示状态：桌面端使用isOpen，移动端使用isMobileOpen
const actualIsOpen = computed(() => {
  return isMobile.value ? isMobileOpen.value : isOpen.value
})

// 切换显示状态
function toggleSidebar() {
  if (isMobile.value) {
    isMobileOpen.value = !isMobileOpen.value
  }
  else {
    isOpen.value = !isOpen.value
  }
}

// 关闭侧边栏
function closeSidebar() {
  if (isMobile.value) {
    isMobileOpen.value = false
  }
  else {
    isOpen.value = false
  }
}

// 控制每日足迹展开/收起
const showDailyLogs = ref(true)

// 监听侧边栏关闭，暂停计时器
watch(actualIsOpen, (newVal: boolean) => {
  if (!newVal && activeTimerId.value) {
    // 侧边栏关闭时，暂停当前计时器
    toggleTimer(activeTimerId.value)
  }
})
</script>

<template>
  <!-- 移动端遮罩层 -->
  <Transition name="fade">
    <div
      v-if="isMobile && actualIsOpen"
      class="fixed inset-0 z-40 bg-black/50 dark:bg-black/70 md:hidden"
      @click="closeSidebar"
    />
  </Transition>

  <!-- 侧边栏容器：桌面端在分栏中，移动端 fixed 定位覆盖 -->
  <aside
    class="h-full transition-all duration-300"
    :class="
      isMobile
        ? `fixed right-0 top-0 z-50 h-full w-80 overflow-hidden transform transition-transform duration-300 sm:w-96 ${
            actualIsOpen ? 'translate-x-0' : 'translate-x-full'
          }`
        : `md:relative ${
            actualIsOpen ? 'w-80 sm:w-96' : 'w-0'
          }`
    "
  >
    <!-- 面板：当侧边栏打开时显示 -->
    <div
      v-if="actualIsOpen"
      class="relative flex h-full flex-col bg-white shadow-xl dark:bg-gray-800"
      @click.stop
    >
      <!-- 边缘折叠按钮：桌面端左侧边缘 -->
      <button
        v-if="!isMobile"
        class="absolute -left-5 top-1/2 z-50 flex h-12 w-5 -translate-y-1/2 items-center justify-center rounded-l-md border border-r-0 border-gray-200 bg-white text-gray-600 shadow-md transition-all hover:bg-gray-50 hover:text-primary-600 active:scale-95 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-primary-400"
        @click="closeSidebar"
        title="收起侧边栏"
        aria-label="收起侧边栏"
      >
        <i class="i-carbon-chevron-right text-base" />
      </button>

      <!-- 标题栏 -->
      <div class="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white">
          <i class="i-carbon-calendar mr-2" />学习计划
        </h3>
        <button
          class="flex h-9 w-9 items-center justify-center rounded-md bg-gray-100 text-gray-700 transition-all hover:bg-red-100 hover:text-red-600 active:scale-95 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-red-900/30 dark:hover:text-red-400"
          @click="closeSidebar"
          title="隐藏侧边栏"
          aria-label="隐藏侧边栏"
        >
          <i class="i-carbon-close text-lg font-bold" />
          <span v-if="false" class="text-xl font-bold leading-none">×</span>
        </button>
      </div>

      <!-- 内容区域 -->
      <div class="flex-1 overflow-y-auto px-4 py-4">

      <!-- 概览面板 -->
      <div class="mb-4 space-y-3">
        <!-- 当前天数 -->
        <div class="flex items-center justify-between rounded-lg bg-primary-50 p-3 dark:bg-primary-900/20">
          <span class="text-sm text-gray-600 dark:text-gray-400">第</span>
          <span class="text-2xl font-bold text-primary-600 dark:text-primary-400">{{ currentDay }}</span>
          <span class="text-sm text-gray-600 dark:text-gray-400">天</span>
        </div>

        <!-- 今日已完成汇总 -->
        <div class="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
          <div class="mb-2 text-xs font-semibold text-gray-600 dark:text-gray-400">今日已完成</div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <div class="flex items-center gap-1">
                <i class="i-carbon-chart-histogram text-primary-600 dark:text-primary-400" />
                <span class="text-sm text-gray-700 dark:text-gray-300">
                  单词：{{ todayCompleted.vocab }}/{{ VOCAB_DAILY_GOAL }}章
                </span>
              </div>
              <div class="flex items-center gap-1">
                <i class="i-carbon-headphones text-green-600 dark:text-green-400" />
                <span class="text-sm text-gray-700 dark:text-gray-300">
                  听力：{{ todayCompleted.listening }}/{{ LISTENING_DAILY_GOAL }}个
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 总体进度条 -->
        <div class="space-y-2">
          <div>
            <div class="mb-1 flex items-center justify-between text-xs">
              <span class="text-gray-600 dark:text-gray-400">单词进度</span>
              <span class="font-semibold text-gray-700 dark:text-gray-300">
                {{ overallProgress.vocab.completed }}/{{ overallProgress.vocab.total }}
              </span>
            </div>
            <div class="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                class="h-full bg-primary-600 transition-all duration-300"
                :style="{ width: `${overallProgress.vocab.percentage}%` }"
              />
            </div>
          </div>
          <div>
            <div class="mb-1 flex items-center justify-between text-xs">
              <span class="text-gray-600 dark:text-gray-400">听力进度</span>
              <span class="font-semibold text-gray-700 dark:text-gray-300">
                {{ overallProgress.listening.completed }}/{{ overallProgress.listening.total }}
              </span>
            </div>
            <div class="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                class="h-full bg-green-600 transition-all duration-300"
                :style="{ width: `${overallProgress.listening.percentage}%` }"
              />
            </div>
          </div>
        </div>

        <!-- 今日目标提醒 -->
        <div
          v-if="todayGoals.vocab.length > 0 || todayGoals.listening.length > 0"
          class="rounded-lg border border-blue-200 bg-blue-50 p-2 text-xs dark:border-blue-800 dark:bg-blue-900/20"
        >
          <div class="font-semibold text-blue-700 dark:text-blue-300">今日目标：</div>
          <div v-if="todayGoals.vocab.length > 0" class="mt-1 text-blue-600 dark:text-blue-400">
            单词：第{{ todayGoals.vocab.join('、') }}章
          </div>
          <div v-if="todayGoals.listening.length > 0" class="mt-1 text-blue-600 dark:text-blue-400">
            听力：{{ todayGoals.listening.length }}个section
          </div>
        </div>

        <!-- 当前计时器显示 -->
        <div
          v-if="activeTimerId"
          class="rounded-lg border border-orange-200 bg-orange-50 p-2 text-xs dark:border-orange-800 dark:bg-orange-900/20"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <i class="i-carbon-timer text-orange-600 dark:text-orange-400" />
              <span class="font-semibold text-orange-700 dark:text-orange-300">
                {{ (() => {
                  const vocabTask = vocabTasks.find(t => t.id === activeTimerId)
                  const listeningTask = listeningTasks.find(t => t.id === activeTimerId)
                  if (vocabTask) return `单词 第${vocabTask.chapter}章`
                  if (listeningTask) return `听力 C${listeningTask.book}T${listeningTask.test}S${listeningTask.section}`
                  return '计时中'
                })() }}
              </span>
            </div>
            <div class="text-lg font-bold text-orange-600 dark:text-orange-400">
              {{ (() => {
                const vocabTask = vocabTasks.find(t => t.id === activeTimerId)
                const listeningTask = listeningTasks.find(t => t.id === activeTimerId)
                const task = vocabTask || listeningTask
                return task ? formatTime(getTaskCurrentTime(task.id)) : '00:00'
              })() }}
            </div>
          </div>
          <button
            class="mt-2 w-full rounded bg-orange-600 px-2 py-1 text-xs text-white hover:bg-orange-700 dark:bg-orange-500 dark:hover:bg-orange-600"
            @click="toggleTimer(activeTimerId)"
          >
            暂停计时
          </button>
        </div>
      </div>

      <!-- 单词任务网格 -->
      <div class="mb-4">
        <div class="mb-2 flex items-center justify-between">
          <div class="flex items-center">
            <i class="i-carbon-chart-histogram mr-2 text-primary-600 dark:text-primary-400" />
            <span class="font-semibold text-gray-900 dark:text-white">真经单词</span>
          </div>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {{ overallProgress.vocab.completed }}/{{ VOCAB_TOTAL_CHAPTERS }}
          </span>
        </div>
        <div class="grid grid-cols-11 gap-1 pb-6">
          <div
            v-for="chapter in VOCAB_TOTAL_CHAPTERS"
            :key="chapter"
            class="relative"
          >
            <button
              class="aspect-square w-full rounded border text-xs font-medium transition-colors"
              :class="
                vocabTasks.find(t => t.chapter === chapter)?.status === 'completed'
                  ? 'border-primary-600 bg-primary-100 text-primary-700 dark:border-primary-500 dark:bg-primary-900 dark:text-primary-300'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              "
              @click="toggleVocabChapter(chapter)"
            >
              {{ chapter }}
            </button>
            <button
              v-if="vocabTasks.find(t => t.chapter === chapter)"
              class="absolute -right-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white shadow-sm hover:bg-blue-600"
              :class="
                activeTimerId === vocabTasks.find(t => t.chapter === chapter)?.id
                  ? 'bg-red-500 hover:bg-red-600'
                  : ''
              "
              @click.stop="toggleTimer(vocabTasks.find(t => t.chapter === chapter)!.id)"
              :title="
                activeTimerId === vocabTasks.find(t => t.chapter === chapter)?.id
                  ? '暂停计时'
                  : '开始计时'
              "
            >
              <i
                v-if="activeTimerId === vocabTasks.find(t => t.chapter === chapter)?.id"
                class="i-carbon-pause text-xs"
              />
              <i
                v-else
                class="i-carbon-play text-xs"
              />
            </button>
            <div
              v-if="vocabTasks.find(t => t.chapter === chapter)?.timeSpent || activeTimerId === vocabTasks.find(t => t.chapter === chapter)?.id"
              class="absolute -bottom-5 left-0 right-0 text-center text-[10px] text-gray-500 dark:text-gray-400"
            >
              {{ formatTime(getTaskCurrentTime(vocabTasks.find(t => t.chapter === chapter)!.id)) }}
            </div>
          </div>
        </div>
      </div>

      <!-- 听力任务网格 -->
      <div class="mb-4">
        <div class="mb-2 flex items-center justify-between">
          <div class="flex items-center">
            <i class="i-carbon-headphones mr-2 text-green-600 dark:text-green-400" />
            <span class="font-semibold text-gray-900 dark:text-white">听力练习</span>
          </div>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {{ overallProgress.listening.completed }}/{{ LISTENING_TOTAL_SECTIONS }}
          </span>
        </div>
        <div class="space-y-3 max-h-64 overflow-y-auto">
          <div
            v-for="book in Object.keys(listeningByBook).map(Number).sort((a, b) => b - a)"
            :key="book"
            class="rounded border border-gray-200 p-2 dark:border-gray-700"
          >
            <div class="mb-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
              剑桥{{ book }}
            </div>
            <div class="space-y-2">
              <div
                v-for="test in Object.keys(listeningByBook[book]).map(Number).sort((a, b) => a - b)"
                :key="test"
                class="flex items-center gap-1"
              >
                <span class="w-8 text-xs text-gray-500 dark:text-gray-400">T{{ test }}</span>
                <div class="flex flex-1 gap-1 pb-5">
                  <div
                    v-for="section in 4"
                    :key="section"
                    class="relative flex-1"
                  >
                    <button
                      class="aspect-square w-full rounded border text-xs transition-colors"
                      :class="
                        listeningByBook[book][test].find(t => t.section === section)?.status === 'completed'
                          ? 'border-green-600 bg-green-100 text-green-700 dark:border-green-500 dark:bg-green-900 dark:text-green-300'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                      "
                      @click="toggleListeningSection(book, test, section)"
                    >
                      S{{ section }}
                    </button>
                    <button
                      v-if="listeningByBook[book][test].find(t => t.section === section)"
                      class="absolute -right-0.5 -top-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white shadow-sm hover:bg-blue-600"
                      :class="
                        activeTimerId === listeningByBook[book][test].find(t => t.section === section)?.id
                          ? 'bg-red-500 hover:bg-red-600'
                          : ''
                      "
                      @click.stop="toggleTimer(listeningByBook[book][test].find(t => t.section === section)!.id)"
                      :title="
                        activeTimerId === listeningByBook[book][test].find(t => t.section === section)?.id
                          ? '暂停计时'
                          : '开始计时'
                      "
                    >
                      <i
                        v-if="activeTimerId === listeningByBook[book][test].find(t => t.section === section)?.id"
                        class="i-carbon-pause text-[8px]"
                      />
                      <i
                        v-else
                        class="i-carbon-play text-[8px]"
                      />
                    </button>
                    <div
                      v-if="listeningByBook[book][test].find(t => t.section === section)?.timeSpent || activeTimerId === listeningByBook[book][test].find(t => t.section === section)?.id"
                      class="absolute -bottom-4 left-0 right-0 text-center text-[9px] text-gray-500 dark:text-gray-400"
                    >
                      {{ formatTime(getTaskCurrentTime(listeningByBook[book][test].find(t => t.section === section)!.id)) }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 学习活动图 -->
      <div class="mb-4 border-t border-gray-200 pt-3 dark:border-gray-700">
        <ActivityGraph
          :data="activityGraphData"
          :start-date="activityGraphStartDate"
        />
        <div class="mt-2 flex items-center justify-end gap-2">
          <label class="text-xs text-gray-600 dark:text-gray-400">开始日期：</label>
          <input
            v-model="activityGraphStartDate"
            type="date"
            class="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
          />
        </div>
      </div>

      <!-- 每日足迹 -->
      <div class="mb-4 border-t border-gray-200 pt-3 dark:border-gray-700">
        <button
          class="mb-2 flex w-full items-center justify-between text-sm font-semibold text-gray-700 dark:text-gray-300"
          @click="showDailyLogs = !showDailyLogs"
        >
          <span class="flex items-center">
            <i class="i-carbon-history mr-2" />每日足迹
          </span>
          <i
            class="transition-transform"
            :class="showDailyLogs ? 'i-carbon-chevron-up' : 'i-carbon-chevron-down'"
          />
        </button>
        <div
          v-show="showDailyLogs"
          class="space-y-2 max-h-48 overflow-y-auto"
        >
          <div
            v-for="log in dailyLogs"
            :key="log.date"
            class="rounded border border-gray-200 p-2 text-xs dark:border-gray-700"
          >
            <div class="mb-1 flex items-center justify-between">
              <span class="font-semibold text-gray-700 dark:text-gray-300">
                {{ formatDate(log.date) }}
              </span>
              <span
                v-if="log.totalTime > 0"
                class="text-gray-500 dark:text-gray-400"
              >
                <i class="i-carbon-timer mr-1" />
                {{ formatTime(log.totalTime) }}
              </span>
            </div>
            <div class="text-gray-600 dark:text-gray-400">
              {{ log.summary || '无记录' }}
            </div>
          </div>
          <div
            v-if="dailyLogs.length === 0"
            class="py-4 text-center text-xs text-gray-400 dark:text-gray-500"
          >
            暂无打卡记录
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="space-y-2 border-t border-gray-200 pt-3 dark:border-gray-700">
        <div class="flex gap-2">
          <button
            class="flex-1 rounded bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600"
            @click="exportData"
            title="导出数据到本地文件"
          >
            <i class="i-carbon-download mr-1" />导出
          </button>
          <label
            class="flex-1 cursor-pointer rounded bg-green-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600"
            title="从本地文件导入数据"
          >
            <input
              type="file"
              accept=".json"
              class="hidden"
              @change="(e) => {
                const file = (e.target as HTMLInputElement).files?.[0]
                if (file) {
                  importFromFile(file).then(success => {
                    if (success) {
                      alert('数据导入成功！')
                    } else {
                      alert('数据导入失败，请检查文件格式。')
                    }
                    // 清空input，允许重复选择同一文件
                    (e.target as HTMLInputElement).value = ''
                  })
                }
              }"
            >
            <i class="i-carbon-upload mr-1" />导入
          </label>
        </div>
        <button
          class="w-full rounded bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
          @click="() => {
            if (confirm('确定要重置所有进度吗？此操作不可恢复！')) {
              resetAll()
            }
          }"
          title="重置所有进度和时间记录"
        >
          <i class="i-carbon-reset mr-1" />重置进度
        </button>
      </div>
      </div>
    </div>
  </aside>

  <!-- 移动端浮动按钮：始终显示在右下角 -->
  <Transition name="fade">
    <button
      v-if="isMobile && !actualIsOpen"
      class="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg transition-all hover:bg-primary-700 hover:scale-110 active:scale-95 dark:bg-primary-500 dark:hover:bg-primary-600 md:hidden"
      @click="toggleSidebar"
      title="打开学习计划"
      aria-label="打开学习计划"
    >
      <i class="i-carbon-calendar text-2xl" />
    </button>
  </Transition>

  <!-- 桌面端边缘展开按钮：当侧边栏隐藏时显示在右边缘 -->
  <button
    v-if="!isMobile && !actualIsOpen"
    class="fixed top-1/2 right-0 z-[60] flex h-16 w-6 -translate-y-1/2 items-center justify-center rounded-l-md bg-primary-600 text-white shadow-lg transition-all hover:w-8 hover:bg-primary-700 active:scale-95 dark:bg-primary-500 dark:hover:bg-primary-600"
    @click="toggleSidebar"
    title="打开学习计划"
    aria-label="打开学习计划"
  >
    <i class="i-carbon-chevron-left text-lg" />
  </button>
</template>

<style scoped>
/* 显示按钮淡入淡出动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
