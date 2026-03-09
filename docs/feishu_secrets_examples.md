# feishu_secrets Usage Examples

## Basic Usage

### 1. List All Secrets

```bash
# Using OpenClaw agent
openclaw agent --session-id test --message "Use feishu_secrets with action: list"
```

Expected output:
```json
{
  "count": 0,
  "secrets": [],
  "note": "Values are hidden for security. Use SecretRef format: {\"source\": \"feishu\", \"id\": \"KEY_NAME\"}"
}
```

### 2. Add a Secret

```bash
openclaw agent --session-id test --message "Use feishu_secrets to add a secret with key: MY_API_KEY, value: sk-1234567890, description: API key for external service"
```

Expected output:
```json
{
  "success": true,
  "key": "MY_API_KEY",
  "description": "API key for external service",
  "created_at": "2026-03-01T16:45:00.000Z",
  "secret_ref": {
    "source": "feishu",
    "id": "MY_API_KEY"
  }
}
```

### 3. Update a Secret

```bash
openclaw agent --session-id test --message "Use feishu_secrets to update secret MY_API_KEY with new value: sk-0987654321"
```

Expected output:
```json
{
  "success": true,
  "key": "MY_API_KEY",
  "description": "API key for external service",
  "updated_at": "2026-03-01T16:50:00.000Z",
  "secret_ref": {
    "source": "feishu",
    "id": "MY_API_KEY"
  }
}
```

### 4. Delete a Secret

```bash
openclaw agent --session-id test --message "Use feishu_secrets to delete secret MY_API_KEY"
```

Expected output:
```json
{
  "success": true,
  "deleted_key": "MY_API_KEY"
}
```

## Common Use Cases

### Storing Webhook URLs

```bash
openclaw agent --session-id test --message "Use feishu_secrets to add: key=NOTIFICATION_WEBHOOK, value=https://open.feishu.cn/open-apis/bot/v2/hook/abc123, description=Notification webhook for alerts"
```

### Storing API Tokens

```bash
openclaw agent --session-id test --message "Use feishu_secrets to add: key=EXTERNAL_API_TOKEN, value=Bearer eyJ..., description=Token for third-party API integration"
```

### Storing Database Credentials

```bash
openclaw agent --session-id test --message "Use feishu_secrets to add: key=DB_PASSWORD, value=super_secret_pass, description=Database password for production"
```

## Direct File Access (Advanced)

For programmatic access, you can read the secrets file directly:

```javascript
const fs = require('fs');
const path = require('path');

const SECRETS_FILE = path.join(
  process.env.HOME,
  '.openclaw/extensions/feishu/.secrets.json'
);

function getSecret(key) {
  const data = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf-8'));
  return data.secrets[key]?.value;
}

// Usage
const apiKey = getSecret('MY_API_KEY');
console.log('API Key:', apiKey);
```

## Integration with Feishu Plugin

### Using SecretRef in Configuration

```json
{
  "feishu": {
    "accounts": [
      {
        "appId": "cli_xxx",
        "appSecret": {
          "source": "feishu",
          "id": "FEISHU_APP_SECRET"
        }
      }
    ]
  }
}
```

### Resolving SecretRef at Runtime

```typescript
function resolveSecret(ref: { source: string; id: string }): string {
  if (ref.source === 'feishu') {
    const secretsFile = path.join(
      process.env.HOME,
      '.openclaw/extensions/feishu/.secrets.json'
    );
    const data = JSON.parse(fs.readFileSync(secretsFile, 'utf-8'));
    return data.secrets[ref.id]?.value || '';
  }
  throw new Error(`Unknown secret source: ${ref.source}`);
}
```

## Security Best Practices

1. **Never log secret values**
   ```javascript
   // ❌ Bad
   console.log('API Key:', apiKey);
   
   // ✅ Good
   console.log('API Key:', apiKey ? '***' : 'not set');
   ```

2. **Use environment-specific keys**
   ```
   PROD_API_KEY
   DEV_API_KEY
   TEST_API_KEY
   ```

3. **Rotate secrets regularly**
   ```bash
   # Update with new value
   openclaw agent --session-id test --message "Use feishu_secrets to update PROD_API_KEY with new rotated value"
   ```

4. **Audit secrets periodically**
   ```bash
   # List all secrets to review
   openclaw agent --session-id test --message "Use feishu_secrets to list all secrets"
   ```

## Troubleshooting

### Secret Not Found

```bash
# Check if secret exists
openclaw agent --session-id test --message "Use feishu_secrets to list all secrets"

# If not found, add it
openclaw agent --session-id test --message "Use feishu_secrets to add the missing secret"
```

### Permission Denied

```bash
# Fix file permissions
chmod 600 ~/.openclaw/extensions/feishu/.secrets.json
```

### Duplicate Key Error

```bash
# Use update instead of add
openclaw agent --session-id test --message "Use feishu_secrets to update (not add) the existing secret"
```

## Migration from Environment Variables

If you have secrets in `~/.openclaw/.env`, you can migrate them:

```bash
# 1. List current env secrets
cat ~/.openclaw/.env

# 2. Add each to feishu_secrets
openclaw agent --session-id test --message "Use feishu_secrets to add: key=FEISHU_APP_ID, value=cli_xxx, description=Migrated from .env"

# 3. Update references to use SecretRef format
# Change: "appId": "cli_xxx"
# To: "appId": {"source": "feishu", "id": "FEISHU_APP_ID"}
```

## Backup and Restore

### Backup

```bash
cp ~/.openclaw/extensions/feishu/.secrets.json ~/.openclaw/extensions/feishu/.secrets.json.backup
```

### Restore

```bash
cp ~/.openclaw/extensions/feishu/.secrets.json.backup ~/.openclaw/extensions/feishu/.secrets.json
chmod 600 ~/.openclaw/extensions/feishu/.secrets.json
```

## Testing

Run the test suite:

```bash
# Create test script
cat > /tmp/test_feishu_secrets.sh << 'SCRIPT'
#!/bin/bash
set -e

echo "=== Testing feishu_secrets ==="

# Test 1: List (empty)
echo "1. List secrets (should be empty)..."
openclaw agent --session-id test-secrets --message "Use feishu_secrets with action: list"

# Test 2: Add
echo "2. Adding test secret..."
openclaw agent --session-id test-secrets --message "Use feishu_secrets to add: key=TEST_KEY, value=test_value_123, description=Test secret"

# Test 3: List (with entry)
echo "3. List secrets (should show TEST_KEY)..."
openclaw agent --session-id test-secrets --message "Use feishu_secrets with action: list"

# Test 4: Update
echo "4. Updating test secret..."
openclaw agent --session-id test-secrets --message "Use feishu_secrets to update: key=TEST_KEY, value=updated_value_456"

# Test 5: Delete
echo "5. Deleting test secret..."
openclaw agent --session-id test-secrets --message "Use feishu_secrets to delete: key=TEST_KEY"

# Test 6: Verify deletion
echo "6. List secrets (should be empty again)..."
openclaw agent --session-id test-secrets --message "Use feishu_secrets with action: list"

echo "=== All tests passed! ==="
SCRIPT

chmod +x /tmp/test_feishu_secrets.sh
/tmp/test_feishu_secrets.sh
```
