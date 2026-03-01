# feishu_secrets 快速开始

## 一分钟上手

### 添加密钥
```bash
openclaw agent --session-id test --message "Use feishu_secrets to add: key=MY_KEY, value=my_secret_value, description=My first secret"
```

### 查看所有密钥
```bash
openclaw agent --session-id test --message "Use feishu_secrets with action: list"
```

### 更新密钥
```bash
openclaw agent --session-id test --message "Use feishu_secrets to update: key=MY_KEY, value=new_value"
```

### 删除密钥
```bash
openclaw agent --session-id test --message "Use feishu_secrets to delete: key=MY_KEY"
```

## 常见用例

### 存储 Webhook URL
```bash
openclaw agent --session-id test --message "Use feishu_secrets to add: key=WEBHOOK_URL, value=https://open.feishu.cn/open-apis/bot/v2/hook/xxx, description=Notification webhook"
```

### 存储 API Token
```bash
openclaw agent --session-id test --message "Use feishu_secrets to add: key=API_TOKEN, value=Bearer eyJ..., description=External API token"
```

### 在配置中引用
```json
{
  "webhookUrl": {
    "source": "feishu",
    "id": "WEBHOOK_URL"
  }
}
```

## 安全特性

✅ 文件权限 600（仅所有者可读写）  
✅ List 操作不显示密钥值  
✅ 支持 SecretRef 格式引用  
✅ 自动时间戳记录  

## 存储位置

```
~/.openclaw/extensions/feishu/.secrets.json
```

## 完整文档

- 详细文档：`docs/feishu_secrets.md`
- 使用示例：`docs/feishu_secrets_examples.md`
- 实现说明：`SECRETS_IMPLEMENTATION.md`

## 故障排除

### 工具找不到？
```bash
# 重启 gateway
pkill -f "openclaw gateway" && openclaw gateway start

# 检查日志
grep "feishu_secrets" /tmp/openclaw/openclaw-*.log
```

### 权限错误？
```bash
chmod 600 ~/.openclaw/extensions/feishu/.secrets.json
```

---

**快速帮助**：所有操作都通过 `feishu_secrets` 工具，使用 `action` 参数指定操作类型（list/add/update/delete）。
