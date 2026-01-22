---
description: Add translations to i18n files efficiently without reading entire files
---
$json = Get-Content i18n_input_zh.json -Raw | ConvertFrom-Json | ConvertTo-Json -Compress; python scripts/add_i18n.py -f zh-CN.json --keys options.navigation --input $json

# add_i18n.py - i18n 翻译管理工具

## 可用参数

| 参数 | 简写 | 说明 |
|------|------|------|
| `--list-files` | | 列出所有 locale 文件 |
| `--file` | `-f` | 指定 locale 文件 (如 `en-US.json`) |
| `--keys` | `-k` | 浏览或指定 keys 路径 (如 `settings` 或 `options.navigation`) |
| `--line` | `-l` | 显示 N 个 key:value 预览 (默认 0 = 仅显示 key 名) |
| `--input` | `-i` | 添加翻译内容 JSON (如 `'{"key": "value"}'`) |
| `--input-file` | | 从文件读取 JSON 内容 (推荐用于复杂/含中文的内容) |
| `--add-key` | `-a` | 创建新的 key 节点 (如 `newSection` 或 `subSection`) |
| `--batch` | `-b` | 批量应用到所有 locale 文件 |

## 常用组合

```bash
# 1. 列出所有翻译文件
python scripts/add_i18n.py --list-files

# 2. 浏览 root keys (仅 key 名)
python scripts/add_i18n.py -f en-US.json --keys

# 3. 浏览 root keys (显示 1 个子 value 预览)
python scripts/add_i18n.py -f en-US.json --keys --line 1

# 4. 浏览子路径
python scripts/add_i18n.py -f en-US.json --keys settings
python scripts/add_i18n.py -f en-US.json --keys settings --line 2

# 5. 添加新的一级 key
python scripts/add_i18n.py -f en-US.json --add-key newFeature

# 6. 添加二级 key (在 settings 下创建 advanced)
python scripts/add_i18n.py -f en-US.json --keys settings --add-key advanced

# 7. 添加翻译到单个文件
python scripts/add_i18n.py -f en-US.json --keys settings --input '{"newKey": "New Value"}'

# 8. 批量操作 (所有 locale 文件)
python scripts/add_i18n.py --batch --add-key newFeature
python scripts/add_i18n.py --batch --keys newFeature --input '{"title": "Title Here"}'
```

## --line 参数说明

- **Leaf section** (如 `settings`，内容全是字符串): `--line N` 限制显示 N 个 key:value
- **Dict section** (如 root，内容是嵌套 dict): `--line N` 显示所有 keys，每个显示 N 个子 value 预览

# 常见问题

## PowerShell / CMD 解析错误
如果遇到 `error: unrecognized arguments`，通常是因为终端对 JSON 中的引号或空格解析错误。

**解决方法：**
1. 使用 `--input-file` 参数读取临时文件（推荐）：
   ```bash
   # 1. 创建 input.json
   # 2. 运行命令
   python scripts/add_i18n.py -f zh-CN.json --keys options --input-file input.json
   ```

2. 在 PowerShell 中正确转义引号：
   ```powershell
   # 尝试使用单引号包裹整个 JSON
   python scripts/add_i18n.py ... --input '{"key": "value"}'
   
   # 或者转义内部双引号 (不推荐，很麻烦)
   python scripts/add_i18n.py ... --input "{\`"key\`": \`"value\`"}"
   ```
