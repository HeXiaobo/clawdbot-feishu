# Feishu Calendar 显式 `useUserToken` 参数最小改造记录

- 日期：2026-02-26 (UTC)
- 仓库：`/root/.openclaw/extensions/feishu`
- 需求：Calendar 四个工具支持显式 `useUserToken?: boolean`，并透传到 `withFeishuToolClient`，保持兼容。

## 1) 改动点

### A. schema + 参数类型新增 `useUserToken?: boolean`
文件：`src/calendar-tools/schemas.ts`

- 为以下 4 个参数类型新增可选字段：
  - `CalendarListEventsParams`
  - `CalendarCreateEventParams`
  - `CalendarUpdateEventParams`
  - `CalendarDeleteEventParams`
- 为以下 4 个 TypeBox schema 新增可选字段：
  - `CalendarListEventsSchema`
  - `CalendarCreateEventSchema`
  - `CalendarUpdateEventSchema`
  - `CalendarDeleteEventSchema`

字段定义：
- `useUserToken: Type.Optional(Type.Boolean(...))`

### B. register/handler 透传 `params.useUserToken`
文件：`src/calendar-tools/register.ts`

- 新增类型约束：
  - `type UseUserTokenParams = { useUserToken?: boolean }`
  - `registerCalendarTool<P extends UseUserTokenParams>(...)`
- 在 `withFeishuToolClient(...)` 调用中新增：
  - `useUserToken: (params as P).useUserToken`

## 2) 向后兼容性说明

- `useUserToken` 为**可选字段**，默认不传。
- 不传时 `withFeishuToolClient` 保持原逻辑（tenant token 路径）不变。
- 已有调用方无需改动。

## 3) 最小验证

### 3.1 静态验证

执行命令：
```bash
npx tsc --noEmit
```
结果：通过（exit code 0）。

> 说明：仓库未提供 `npm run build` 脚本，执行时提示 Missing script；因此使用 TypeScript 无输出编译检查作为最小可执行验证。

### 3.2 工具调用样例（含 `useUserToken=true`）

#### 样例1：list events
```json
{
  "calendar_id": "primary",
  "start_time": "2026-02-25T00:00:00+08:00",
  "end_time": "2026-02-26T23:59:59+08:00",
  "timezone": "Asia/Shanghai",
  "useUserToken": true
}
```
预期：
- 优先尝试 user token 发起查询；
- 若 user token 不可用/失败，自动回退 tenant token；
- 返回事件列表结构，与旧行为兼容。

#### 样例2：create event
```json
{
  "calendar_id": "<calendar_id>",
  "summary": "useUserToken smoke test",
  "start_time": "2026-03-01T10:00:00+08:00",
  "end_time": "2026-03-01T10:30:00+08:00",
  "timezone": "Asia/Shanghai",
  "useUserToken": true
}
```
预期：
- 优先用 user token 创建事件；
- user token 失败时回退 tenant token；
- 成功时返回创建后的 event 信息。

## 4) 回滚说明

### 改动文件列表
1. `src/calendar-tools/schemas.ts`
2. `src/calendar-tools/register.ts`
3. `docs/技术调研/2026-02-26-calendar-useUserToken-最小改造记录.md`

### 回滚方法
- Git 回滚到本次提交前：
```bash
git revert <commit_hash>
```
或（未推送时）
```bash
git reset --hard HEAD~1
```
- 若仅手工回滚最小改造：
  - 删除上述 4 个 calendar schema 里的 `useUserToken` 字段；
  - 删除 `register.ts` 中 `UseUserTokenParams` 类型与 `useUserToken` 透传行。

## 5) 阻塞/风险

- 无编译阻塞。
- 验证层面仅做了静态检查 + 调用样例/预期说明；若需真实联调，需在可用 Feishu 账户与权限环境下执行 list/create 真调用。