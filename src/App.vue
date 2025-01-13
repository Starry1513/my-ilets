<template>
  <TheHeader />
  <div class="flex h-[calc(100vh-64px)] overflow-hidden bg-gray-50 dark:bg-gray-900">
    <!-- 主内容区 -->
    <main class="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 dark:text-white">
      <div class="mx-auto max-w-screen-2xl px-4 py-8 2xl:px-0">
        <RouterView />
      </div>
    </main>

    <!-- 学习计划侧边栏：桌面端显示在分栏中，移动端通过 fixed 定位覆盖（不占用布局空间） -->
    <StudyPlan class="hidden h-full border-l border-gray-200 dark:border-gray-700 md:block" />
  </div>
  <TheFooter />
</template>
