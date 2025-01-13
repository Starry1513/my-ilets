<script setup lang="ts">
interface ActivityDay {
  date: string
  level: number
  count: number
  time: number
}

interface Props {
  data: ActivityDay[] | { value: ActivityDay[] }
  startDate: string
}

const props = defineProps<Props>()

const activityData = computed(() => {
  return Array.isArray(props.data) ? props.data : props.data.value
})

// 格式化日期显示
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}月${day}日`
}

// 格式化时间显示
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}小时${minutes}分钟`
  }
  return `${minutes}分钟`
}

// 获取活动强度对应的颜色
function getLevelColor(level: number): string {
  const colors = [
    'bg-gray-100 dark:bg-gray-800', // 0 - 无活动
    'bg-green-200 dark:bg-green-900', // 1 - 低
    'bg-green-400 dark:bg-green-700', // 2 - 中
    'bg-green-600 dark:bg-green-500', // 3 - 高
    'bg-green-800 dark:bg-green-400', // 4 - 极高
  ]
  return colors[level] || colors[0]
}

// 获取活动强度对应的边框颜色
function getLevelBorderColor(level: number): string {
  const colors = [
    'border-gray-200 dark:border-gray-700', // 0
    'border-green-300 dark:border-green-800', // 1
    'border-green-500 dark:border-green-600', // 2
    'border-green-700 dark:border-green-500', // 3
    'border-green-900 dark:border-green-400', // 4
  ]
  return colors[level] || colors[0]
}

// 组织数据为周格式（类似 GitHub）
const weeksData = computed(() => {
  const weeks: Array<Array<ActivityDay | null>> = []
  let currentWeek: Array<ActivityDay | null> = []
  
  // 获取开始日期是星期几（0=周日, 1=周一, ...）
  const start = new Date(props.startDate)
  const startDayOfWeek = start.getDay()
  
  // 在第一个周前面填充空位
  for (let i = 0; i < startDayOfWeek; i++) {
    currentWeek.push(null)
  }
  
  // 按日期顺序填充数据
  activityData.value.forEach((day) => {
    const date = new Date(day.date)
    const dayOfWeek = date.getDay()
    
    // 如果当前周已满（7天），开始新的一周
    if (currentWeek.length === 7) {
      weeks.push(currentWeek)
      currentWeek = []
    }
    
    currentWeek.push(day)
  })
  
  // 如果最后一周未满，填充空位
  while (currentWeek.length < 7) {
    currentWeek.push(null)
  }
  
  if (currentWeek.length > 0) {
    weeks.push(currentWeek)
  }
  
  return weeks
})

// 鼠标悬停状态
const hoveredDate = ref<string | null>(null)
const hoveredDay = computed(() => {
  if (!hoveredDate.value) return null
  return activityData.value.find(d => d.date === hoveredDate.value) || null
})

// 工具提示位置
const tooltipStyle = ref({ top: '0px', left: '0px' })

function onDayHover(e: MouseEvent, date: string) {
  hoveredDate.value = date
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  tooltipStyle.value = {
    top: `${rect.top - 60}px`,
    left: `${rect.left + rect.width / 2 - 100}px`,
  }
}

function onDayLeave() {
  hoveredDate.value = null
}

// 月份标签（显示每月的第一个周一）
const monthLabels = computed(() => {
  const labels: Array<{ month: number; weekIndex: number }> = []
  const months = new Set<number>()
  
  weeksData.value.forEach((week, weekIndex) => {
    const firstDay = week.find(day => day !== null)
    if (firstDay) {
      const date = new Date(firstDay.date)
      const month = date.getMonth() + 1
      if (!months.has(month)) {
        months.add(month)
        labels.push({ month, weekIndex })
      }
    }
  })
  
  return labels
})
</script>

<template>
  <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
    <div class="mb-3 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <i class="i-carbon-chart-line text-primary-600 dark:text-primary-400" />
        <span class="font-semibold text-gray-900 dark:text-white">学习活动图</span>
      </div>
      <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span>少</span>
        <div class="flex gap-0.5">
          <div class="h-3 w-3 rounded border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800" />
          <div class="h-3 w-3 rounded border border-green-300 bg-green-200 dark:border-green-800" />
          <div class="h-3 w-3 rounded border border-green-500 bg-green-400 dark:border-green-700" />
          <div class="h-3 w-3 rounded border border-green-700 bg-green-600 dark:border-green-500" />
          <div class="h-3 w-3 rounded border border-green-900 bg-green-800 dark:border-green-400" />
        </div>
        <span>多</span>
      </div>
    </div>
    
    <div class="relative overflow-x-auto">
      <div class="flex gap-1">
        <!-- 星期标签 -->
        <div class="flex flex-col gap-1 pr-2">
          <div class="h-3" />
          <div class="h-3 text-[10px] text-gray-500 dark:text-gray-400">日</div>
          <div class="h-3 text-[10px] text-gray-500 dark:text-gray-400">一</div>
          <div class="h-3 text-[10px] text-gray-500 dark:text-gray-400">二</div>
          <div class="h-3 text-[10px] text-gray-500 dark:text-gray-400">三</div>
          <div class="h-3 text-[10px] text-gray-500 dark:text-gray-400">四</div>
          <div class="h-3 text-[10px] text-gray-500 dark:text-gray-400">五</div>
          <div class="h-3 text-[10px] text-gray-500 dark:text-gray-400">六</div>
        </div>
        
        <!-- 月份标签和活动格子 -->
        <div class="flex gap-1">
          <div
            v-for="(week, weekIndex) in weeksData"
            :key="weekIndex"
            class="flex flex-col gap-1"
          >
            <!-- 月份标签（显示在第一个周一） -->
            <div class="h-3 text-[10px] text-gray-500 dark:text-gray-400">
              <template v-for="label in monthLabels" :key="label.month">
                <span v-if="label.weekIndex === weekIndex">{{ label.month }}月</span>
              </template>
            </div>
            
            <!-- 一周的格子 -->
            <div
              v-for="(day, dayIndex) in week"
              :key="dayIndex"
              class="relative"
            >
              <div
                v-if="day"
                :class="[
                  'h-3 w-3 rounded border transition-all hover:scale-125 hover:shadow-md',
                  getLevelColor(day.level),
                  getLevelBorderColor(day.level),
                ]"
                @mouseenter="onDayHover($event, day.date)"
                @mouseleave="onDayLeave"
              />
              <div
                v-else
                class="h-3 w-3"
              />
            </div>
          </div>
        </div>
      </div>
      
      <!-- 工具提示 -->
      <Transition name="fade">
        <div
          v-if="hoveredDay"
          class="pointer-events-none fixed z-50 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-gray-700 dark:bg-gray-800"
          :style="tooltipStyle"
        >
          <div class="font-semibold text-gray-900 dark:text-white">
            {{ formatDate(hoveredDay.date) }}
          </div>
          <div class="mt-1 text-gray-600 dark:text-gray-400">
            完成 {{ hoveredDay.count }} 个任务
          </div>
          <div v-if="hoveredDay.time > 0" class="mt-1 text-gray-600 dark:text-gray-400">
            学习时长 {{ formatTime(hoveredDay.time) }}
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

