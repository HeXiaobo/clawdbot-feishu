# feishu_secrets Tool

## Overview

The `feishu_secrets` tool provides secure secret management for the Feishu plugin. Secrets are stored locally in `~/.openclaw/extensions/feishu/.secrets.json` with 600 file permissions.

## Features

- **Secure Storage**: Secrets stored with 600 permissions (owner read/write only)
- **List Protection**: List operation never reveals secret values
- **CRUD Operations**: Full create, read, update, delete support
- **SecretRef Format**: Compatible with OpenClaw SecretRef pattern

## Actions

### list

List all secrets (keys and descriptions only, values are hidden).

**Parameters:**
- `action`: "list"

**Example:**
```json
{
  "action": "list"
}
```

**Response:**
```json
{
  "count": 2,
  "secrets": [
    {
      "key": "FEISHU_WEBHOOK_URL",
      "description": "Webhook URL for notifications",
      "created_at": "2026-03-01T16:00:00.000Z",
      "updated_at": "2026-03-01T16:00:00.000Z"
    }
  ],
  "note": "Values are hidden for security. Use SecretRef format: {\"source\": \"feishu\", \"id\": \"KEY_NAME\"}"
}
```

### add

Create a new secret.

**Parameters:**
- `action`: "add"
- `key`: Secret key name (required)
- `value`: Secret value (required)
- `description`: Optional description

**Example:**
```json
{
  "action": "add",
  "key": "FEISHU_WEBHOOK_URL",
  "value": "https://open.feishu.cn/open-apis/bot/v2/hook/xxx",
  "description": "Webhook URL for notifications"
}
```

**Response:**
```json
{
  "success": true,
  "key": "FEISHU_WEBHOOK_URL",
  "description": "Webhook URL for notifications",
  "created_at": "2026-03-01T16:00:00.000Z",
  "secret_ref": {
    "source": "feishu",
    "id": "FEISHU_WEBHOOK_URL"
  }
}
```

### update

Update an existing secret.

**Parameters:**
- `action`: "update"
- `key`: Secret key name (required)
- `value`: New secret value (required)
- `description`: Optional new description

**Example:**
```json
{
  "action": "update",
  "key": "FEISHU_WEBHOOK_URL",
  "value": "https://open.feishu.cn/open-apis/bot/v2/hook/yyy",
  "description": "Updated webhook URL"
}
```

**Response:**
```json
{
  "success": true,
  "key": "FEISHU_WEBHOOK_URL",
  "description": "Updated webhook URL",
  "updated_at": "2026-03-01T16:30:00.000Z",
  "secret_ref": {
    "source": "feishu",
    "id": "FEISHU_WEBHOOK_URL"
  }
}
```

### delete

Delete a secret.

**Parameters:**
- `action`: "delete"
- `key`: Secret key name (required)

**Example:**
```json
{
  "action": "delete",
  "key": "FEISHU_WEBHOOK_URL"
}
```

**Response:**
```json
{
  "success": true,
  "deleted_key": "FEISHU_WEBHOOK_URL"
}
```

## SecretRef Format

Secrets can be referenced in configurations using the SecretRef format:

```json
{
  "source": "feishu",
  "id": "KEY_NAME"
}
```

This allows secure reference to secrets without embedding values in configuration files.

## Security Features

1. **File Permissions**: `.secrets.json` is created with 600 permissions (owner read/write only)
2. **No Value Exposure**: List operation never returns secret values
3. **Validation**: Add/update operations validate required parameters
4. **Error Handling**: Clear error messages for missing keys or duplicate entries

## Storage Location

Secrets are stored in:
```
~/.openclaw/extensions/feishu/.secrets.json
```

**File Format:**
```json
{
  "secrets": {
    "KEY_NAME": {
      "key": "KEY_NAME",
      "value": "secret_value",
      "description": "Optional description",
      "created_at": "2026-03-01T16:00:00.000Z",
      "updated_at": "2026-03-01T16:00:00.000Z"
    }
  }
}
```

## Error Handling

- **Duplicate Key**: Adding a key that already exists returns an error
- **Missing Key**: Updating or deleting a non-existent key returns an error
- **Missing Parameters**: Required parameters (key, value) are validated

## Best Practices

1. Use descriptive key names (e.g., `FEISHU_WEBHOOK_URL`, `API_TOKEN`)
2. Always provide descriptions for better documentation
3. Regularly audit secrets using the list action
4. Use SecretRef format in configurations instead of hardcoding values
5. Never commit `.secrets.json` to version control (already in `.gitignore`)

## Integration Example

```typescript
// In your Feishu plugin configuration
const config = {
  webhookUrl: {
    source: "feishu",
    id: "FEISHU_WEBHOOK_URL"
  }
};
```

## Troubleshooting

### Tool Not Available

If the tool is not showing up:
1. Check that the plugin is loaded: `openclaw gateway status`
2. Restart the gateway: `openclaw gateway restart`
3. Check logs: `tail -f /tmp/openclaw/openclaw-*.log | grep feishu_secrets`

### Permission Errors

If you get permission errors:
```bash
chmod 600 ~/.openclaw/extensions/feishu/.secrets.json
```

### File Not Created

The file is created automatically on first use. If it doesn't exist:
```bash
mkdir -p ~/.openclaw/extensions/feishu
echo '{"secrets":{}}' > ~/.openclaw/extensions/feishu/.secrets.json
chmod 600 ~/.openclaw/extensions/feishu/.secrets.json
```
