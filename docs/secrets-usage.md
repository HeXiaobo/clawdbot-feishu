# Feishu Secrets 工具使用文档

## 概述

`feishu_secrets` 工具用于管理飞书插件的敏感凭据，支持安全存储和引用。

## 存储位置

- **文件路径**: `~/.openclaw/extensions/feishu/.secrets.json`
- **文件权限**: 600 (仅所有者可读写)
- **格式**: JSON

## 支持的操作

### 1. 列出所有密钥 (list)

```json
{
  "action": "list"
}
```

**返回示例**:
```json
{
  "count": 2,
  "secrets": [
    {
      "key": "FEISHU_APP_SECRET",
      "description": "飞书应用密钥",
      "created_at": "2026-03-01T16:00:00.000Z",
      "updated_at": "2026-03-01T16:00:00.000Z"
    }
  ],
  "note": "Values are hidden for security. Use SecretRef format: {\"source\": \"feishu\", \"id\": \"KEY_NAME\"}"
}
```

**安全特性**: list 操作不会返回密钥的明文值，仅显示 key、description 和时间戳。

### 2. 添加新密钥 (add)

```json
{
  "action": "add",
  "key": "FEISHU_APP_SECRET",
  "value": "your-secret-value-here",
  "description": "飞书应用密钥"
}
```

**返回示例**:
```json
{
  "success": true,
  "key": "FEISHU_APP_SECRET",
  "description": "飞书应用密钥",
  "created_at": "2026-03-01T16:00:00.000Z",
  "secret_ref": {
    "source": "feishu",
    "id": "FEISHU_APP_SECRET"
  }
}
```

### 3. 更新现有密钥 (update)

```json
{
  "action": "update",
  "key": "FEISHU_APP_SECRET",
  "value": "new-secret-value",
  "description": "更新后的描述"
}
```

### 4. 删除密钥 (delete)

```json
{
  "action": "delete",
  "key": "FEISHU_APP_SECRET"
}
```

## SecretRef 引用格式

在配置文件或其他地方引用密钥时，使用以下格式：

```json
{
  "source": "feishu",
  "id": "KEY_NAME"
}
```

## 安全最佳实践

1. **文件权限**: 工具会自动设置 `.secrets.json` 文件权限为 600
2. **不要提交到 Git**: 确保 `.secrets.json` 在 `.gitignore` 中
3. **定期轮换**: 定期更新敏感凭据
4. **最小权限**: 只存储必要的密钥
5. **使用 SecretRef**: 在配置中使用引用而非明文

## 与 OpenClaw Secrets 系统的集成

本工具遵循 OpenClaw Secrets 系统的设计模式：

- 支持 SecretRef 格式: `{"source": "feishu", "id": "KEY_NAME"}`
- 文件权限自动设置为 600
- list 操作不泄露明文值
- 提供完整的 CRUD 操作

参考: https://docs.openclaw.ai/gateway/secrets
