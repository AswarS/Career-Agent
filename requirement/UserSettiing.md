### 前端页面（前端）

- [ ]  设置页 UI
- [ ]  基础信息编辑

模块：

- 用户名
- API 配置
- 账号信息
### 用户名设置（后端）

- [ ]  修改用户名接口
- [ ]  唯一性校验
- [ ]  修改成功提示

### 7.3 用户 API 设置

当前方案：

> 用户自己填 API key
> 

Todo：

- [ ]  API key 输入框
- [ ]  加密存储
- [ ]  可编辑
- [ ]  测试连接按钮
    - 统一使用Anthropic格式

### 7.4 数据库表（数据库）

新增：

`user_settings`

建议字段：

| 字段 | 类型 |
| --- | --- |
| id | bigint |
| user_id | bigint |
| provider | varchar |
| api_key | text |
| model | varchar |
| created_at | datetime |