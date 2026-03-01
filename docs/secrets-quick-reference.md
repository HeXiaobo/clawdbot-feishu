# Feishu Secrets 快速参考

## 一行命令

```bash
# 添加
feishu_secrets --action add --key KEY_NAME --value "secret" --description "描述"

# 列出（不显示明文）
feishu_secrets --action list

# 更新
feishu_secrets --action update --key KEY_NAME --value "new-secret"

# 删除
feishu_secrets --action delete --key KEY_NAME
```

## SecretRef 引用格式

```json
{
  "source": "feishu",
  "id": "KEY_NAME"
}
```

## 文件位置

- **存储**: `~/.openclaw/extensions/feishu/.secrets.json`
- **权限**: 600（自动设置）
- **Git**: 已在 `.gitignore` 中

## 安全特性

- ✅ 文件权限 600
- ✅ list 不显示明文
- ✅ 支持 SecretRef
- ✅ 时间戳追踪
- ✅ 错误提示清晰

## 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| "already exists" | 密钥已存在 | 使用 `update` |
| "not found" | 密钥不存在 | 使用 `add` |
| "required" | 缺少参数 | 检查必填参数 |

## 完整文档

- [使用文档](./secrets-usage.md)
- [使用示例](./secrets-examples.md)
