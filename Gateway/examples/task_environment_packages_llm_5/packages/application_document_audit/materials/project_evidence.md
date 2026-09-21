# 项目证据记录

## 电商订单微服务系统
- 角色：后端负责人
- 动作：
  - 使用Spring Boot将原有单体订单模块拆分为独立微服务，通过Kafka实现订单事件异步流转
  - 使用React和TypeScript开发订单运营后台，支持实时订单监控与异常处理
  - 设计MySQL分库分表方案并引入Redis缓存热点数据，降低数据库读压力
- 结果：
  - 订单接口平均响应时间从800ms降至约300ms
  - 系统日均订单处理量从50万提升至约150万
- 技能：Java、Spring Boot、MySQL、Redis、Kafka、Docker、React、TypeScript

## 实时日志分析平台
- 角色：核心开发
- 动作：
  - 基于Kafka构建日志采集管道，使用Elasticsearch实现日志全文检索与聚合分析
  - 编写Python脚本完成日志格式清洗与异常告警规则配置
- 结果：
  - 平台支持日均约1亿条日志的实时写入与检索
  - 异常日志告警平均响应时间控制在5分钟以内
- 技能：Kafka、Elasticsearch、Python、Docker
