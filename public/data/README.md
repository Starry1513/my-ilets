# 错题本数据目录

## 使用说明

将你从其他电脑导出的错题本JSON文件放到这个目录，命名为 `error-book.json`

然后在错题本页面点击"自动导入项目错题本"按钮即可自动导入。

## 文件格式

错题本JSON文件格式示例：

```json
[
  {
    "id": 1,
    "word": ["example"],
    "pos": "n.",
    "meaning": "例子",
    "example": "For example, ...",
    "extra": "",
    "category": "IELTS",
    "addedAt": 1673942400000,
    "reviewRecords": [],
    "nextReviewDate": 1673942400000
  }
]
```

## 提示

- 文件必须是有效的JSON格式
- 导入时会自动与现有错题合并，重复的会被跳过
