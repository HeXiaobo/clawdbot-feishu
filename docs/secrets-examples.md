# Feishu Secrets 使用示例

## 快速开始

### 1. 添加飞书应用凭据

```bash
# 添加 App ID
feishu_secrets --action add \
  --key FEISHU_APP_ID \
  --value "cli_a909c4a740785cef" \
  --description "飞书应用ID"

# 添加 App Secret
feishu_secrets --action add \
  --key FEISHU_APP_SECRET \
  --value "your-app-secret-here" \
  --description "飞书应用密钥"
```

### 2. 列出所有密钥

```bash
feishu_secrets --action list
```

输出示例：
```json
{
  "count": 2,
  "secrets": [
    {
      "key": "FEISHU_APP_ID",
      "description": "飞书应用ID",
      "created_at": "2026-03-01T16:00:00.000Z",
      "updated_at": "2026-03-01T16:00:00.000Z"
    },
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

### 3. 在配置中使用 SecretRef

在 `openclaw.json` 或其他配置文件中引用密钥：

```json
{
  "feishu": {
    "appId": {
      "source": "feishu",
      "id": "FEISHU_APP_ID"
    },
    "appSecret": {
      "source": "feishu",
      "id": "FEISHU_APP_SECRET"
    }
  }
}
```

### 4. 更新密钥

```bash
# 轮换 App Secret
feishu_secrets --action update \
  --key FEISHU_APP_SECRET \
  --value "new-secret-value" \
  --description "飞书应用密钥（已轮换）"
```

### 5. 删除不再使用的密钥

```bash
feishu_secrets --action delete --key OLD_KEY
```

## 常见场景

### 场景 1: 初始化新环境

```bash
# 1. 添加所有必需的密钥
feishu_secrets --action add --key FEISHU_APP_ID --value "cli_xxx" --description "应用ID"
feishu_secrets --action add --key FEISHU_APP_SECRET --value "secret_xxx" --description "应用密钥"
feishu_secrets --action add --key FEISHU_ENCRYPT_KEY --value "encrypt_xxx" --description "加密密钥"
feishu_secrets --action add --key FEISHU_VERIFICATION_TOKEN --value "token_xxx" --description "验证令牌"

# 2. 验证
feishu_secrets --action list
```

### 场景 2: 密钥轮换

```bash
# 1. 更新密钥
feishu_secrets --action update \
  --key FEISHU_APP_SECRET \
  --value "new-secret" \
  --description "应用密钥（2026-03-01 轮换）"

# 2. 重启服务以应用新密钥
openclaw gateway restart
```

### 场景 3: 迁移到 Secrets 系统

如果你之前在配置文件中硬编码了密钥：

```bash
# 1. 将密钥添加到 Secrets 系统
feishu_secrets --action add \
  --key FEISHU_APP_SECRET \
  --value "your-current-secret" \
  --description "从配置迁移"

# 2. 更新配置文件，使用 SecretRef
# 将 "appSecret": "your-current-secret"
# 改为 "appSecret": {"source": "feishu", "id": "FEISHU_APP_SECRET"}

# 3. 验证配置
openclaw config validate

# 4. 重启服务
openclaw gateway restart
```

### 场景 4: 多环境管理

```bash
# 开发环境
feishu_secrets --action add --key FEISHU_APP_ID_DEV --value "cli_dev_xxx" --description "开发环境应用ID"
feishu_secrets --action add --key FEISHU_APP_SECRET_DEV --value "secret_dev_xxx" --description "开发环境密钥"

# 生产环境
feishu_secrets --action add --key FEISHU_APP_ID_PROD --value "cli_prod_xxx" --description "生产环境应用ID"
feishu_secrets --action add --key FEISHU_APP_SECRET_PROD --value "secret_prod_xxx" --description "生产环境密钥"
```

## 安全检查清单

- [ ] `.secrets.json` 文件权限为 600
- [ ] `.secrets.json` 已添加到 `.gitignore`
- [ ] 配置文件中使用 SecretRef 而非明文
- [ ] 定期轮换敏感密钥
- [ ] 备份密钥到安全位置（如密码管理器）
- [ ] 删除不再使用的密钥

## 故障排查

### 问题 1: 文件权限错误

```bash
# 检查权限
ls -la ~/.openclaw/extensions/feishu/.secrets.json

# 修复权限
chmod 600 ~/.openclaw/extensions/feishu/.secrets.json
```

### 问题 2: 密钥未生效

```bash
# 1. 验证密钥存在
feishu_secrets --action list

# 2. 检查配置文件中的 SecretRef 格式
cat ~/.openclaw/openclaw.json | grep -A 2 "feishu"

# 3. 重启 gateway
openclaw gateway restart
```

### 问题 3: 误删密钥

如果你有备份：
```bash
# 重新添加
feishu_secrets --action add \
  --key DELETED_KEY \
  --value "backup-value" \
  --description "从备份恢复"
```

## 最佳实践

1. **使用描述性的 key 名称**
   - ✅ `FEISHU_APP_SECRET_PROD`
   - ❌ `SECRET1`

2. **添加有意义的描述**
   - ✅ "飞书应用密钥（生产环境，2026-03-01 创建）"
   - ❌ "密钥"

3. **定期审计**
   ```bash
   # 每月检查一次
   feishu_secrets --action list
   ```

4. **备份策略**
   - 将密钥备份到密码管理器（1Password、Bitwarden 等）
   - 不要将 `.secrets.json` 提交到 Git
   - 考虑使用加密备份

5. **轮换周期**
   - 生产环境密钥：每 90 天
   - 开发环境密钥：每 180 天
   - 发生安全事件后立即轮换

## 与其他系统集成

### 与 OpenClaw Secrets 系统配合

```bash
# Feishu 插件专用密钥
feishu_secrets --action add --key FEISHU_WEBHOOK_URL --value "https://..." --description "Webhook URL"

# OpenClaw 全局密钥
openclaw secrets add --provider default --id GLOBAL_API_KEY --value "xxx" --description "全局 API Key"
```

### 在代码中使用

```typescript
import { getFeishuSecret } from './secrets-tools/actions.js';

// 读取密钥（仅在插件内部使用）
const secret = await getFeishuSecret('FEISHU_APP_SECRET');
```

## 参考

- [OpenClaw Secrets 文档](https://docs.openclaw.ai/gateway/secrets)
- [飞书开放平台文档](https://open.feishu.cn/document/home/introduction)
