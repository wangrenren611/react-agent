# ReActAgent 架构设计文档

## 系统架构概览

ReActAgent 采用模块化设计，主要包含以下几个核心模块：

```mermaid
graph TB
    subgraph "用户交互层"
        UI[用户界面]
        UserAgent[用户Agent]
    end
    
    subgraph "Agent核心层"
        ReActAgent[ReAct Agent]
        AgentBase[Agent基础类]
        ReActBase[ReAct基础类]
    end
    
    subgraph "功能模块层"
        Memory[内存管理]
        Tools[工具系统]
        Model[模型接口]
        Formatter[格式化器]
    end
    
    subgraph "基础设施层"
        Types[类型定义]
        Utils[工具函数]
        Hooks[Hook系统]
    end
    
    UI --> UserAgent
    UserAgent --> ReActAgent
    ReActAgent --> ReActBase
    ReActBase --> AgentBase
    
    ReActAgent --> Memory
    ReActAgent --> Tools
    ReActAgent --> Model
    ReActAgent --> Formatter
    
    Memory --> Types
    Tools --> Types
    Model --> Types
    Formatter --> Types
    
    AgentBase --> Hooks
    AgentBase --> Utils
```

## 核心组件详解

### 1. Agent 类层次结构

```mermaid
classDiagram
    class AgentBase {
        +id: string
        +name: string
        +reply(msg): Promise~IMessage~
        +observe(msg): Promise~void~
        +print(msg): Promise~void~
        +registerInstanceHook()
        +handleInterrupt()
    }
    
    class ReActAgentBase {
        +reasoning(): Promise~IMessage~
        +acting(toolCall): Promise~IMessage~
        +reasoningWithHooks()
        +actingWithHooks()
        +registerReasoningHook()
        +registerActingHook()
    }
    
    class ReActAgent {
        -sysPrompt: string
        -maxIters: number
        -model: IChatModel
        -toolkit: IToolkit
        -memory: IMemory
        +reply(msg, structuredModel)
        +reasoning()
        +acting(toolCall)
        +generateResponse()
    }
    
    class UserAgent {
        -rl: readline.Interface
        -inputPrompt: string
        -exitKeywords: string[]
        +reply(msg)
        +getUserInput()
        +isExitCommand()
    }
    
    AgentBase <|-- ReActAgentBase
    ReActAgentBase <|-- ReActAgent
    AgentBase <|-- UserAgent
```

### 2. Hook 系统架构

```mermaid
graph TD
    A[Hook 触发点] --> B{Hook 类型}
    B -->|pre_reply| C[前置回复Hook]
    B -->|post_reply| D[后置回复Hook]
    B -->|pre_reasoning| E[前置推理Hook]
    B -->|post_reasoning| F[后置推理Hook]
    B -->|pre_acting| G[前置行动Hook]
    B -->|post_acting| H[后置行动Hook]
    B -->|pre_print| I[前置打印Hook]
    B -->|post_print| J[后置打印Hook]
    
    C --> K[类级Hook]
    C --> L[实例级Hook]
    K --> M[执行Hook函数]
    L --> M
    M --> N[返回修改后的参数/结果]
```

### 3. 工具系统架构

```mermaid
graph TB
    subgraph "工具包 (Toolkit)"
        TM[工具管理器]
        TS[工具Schema生成]
        TC[工具调用执行]
        TR[工具结果处理]
    end
    
    subgraph "内置工具"
        Shell[Shell命令执行]
        Python[Python代码执行]
        File[文件操作]
        System[系统信息]
    end
    
    subgraph "自定义工具"
        Custom1[自定义工具1]
        Custom2[自定义工具2]
        CustomN[自定义工具N]
    end
    
    TM --> TS
    TM --> TC
    TC --> TR
    
    TM --> Shell
    TM --> Python
    TM --> File
    TM --> System
    
    TM --> Custom1
    TM --> Custom2
    TM --> CustomN
    
    TR --> Response[工具响应]
```

## 核心流程详解

### 1. ReAct 主循环流程

```mermaid
sequenceDiagram
    participant User as 用户
    participant UA as UserAgent
    participant RA as ReActAgent
    participant Model as LLM模型
    participant Tools as 工具系统
    participant Memory as 内存系统
    
    User->>UA: 输入消息
    UA->>RA: 发送用户消息
    
    RA->>Memory: 添加消息到内存
    RA->>Memory: 检索长期内存
    
    loop ReAct循环 (最多maxIters次)
        RA->>RA: 应用前置推理Hook
        RA->>Model: 调用模型推理
        Model->>RA: 返回推理结果
        RA->>RA: 应用后置推理Hook
        RA->>Memory: 保存推理消息
        
        alt 有工具调用
            loop 每个工具调用
                RA->>RA: 应用前置行动Hook
                RA->>Tools: 执行工具调用
                Tools->>RA: 返回工具结果
                RA->>RA: 应用后置行动Hook
                RA->>Memory: 保存工具结果
                
                alt 是完成函数
                    RA->>RA: 生成最终回复
                    Note over RA: 退出循环
                end
            end
        else 无工具调用
            Note over RA: 退出循环
        end
    end
    
    alt 达到最大迭代次数
        RA->>Model: 生成总结回复
    end
    
    RA->>Memory: 记录长期内存
    RA->>UA: 返回最终回复
    UA->>User: 显示回复
```

### 2. 工具调用流程

```mermaid
flowchart TD
    A[开始工具调用] --> B[解析工具调用参数]
    B --> C{工具是否存在?}
    C -->|否| D[返回错误响应]
    C -->|是| E[验证输入参数]
    E --> F{参数有效?}
    F -->|否| G[返回参数错误]
    F -->|是| H[执行工具函数]
    H --> I{是异步生成器?}
    I -->|是| J[流式处理结果]
    I -->|否| K[包装为生成器]
    J --> L[逐个yield结果]
    K --> L
    L --> M{是最后一个结果?}
    M -->|否| N[继续处理下一个]
    M -->|是| O[完成工具调用]
    N --> L
    O --> P[返回最终结果]
    D --> P
    G --> P
```

### 3. 内存管理流程

```mermaid
graph TD
    A[消息输入] --> B{消息类型}
    B -->|单个消息| C[包装为数组]
    B -->|消息数组| D[直接处理]
    C --> D
    D --> E[遍历消息]
    E --> F[转换为Message实例]
    F --> G[添加到短期内存]
    G --> H{启用长期内存?}
    H -->|是| I[提取关键词]
    H -->|否| J[完成]
    I --> K[存储到长期内存]
    K --> L[限制存储大小]
    L --> J
    
    subgraph "长期内存检索"
        M[检索请求] --> N[提取查询关键词]
        N --> O[搜索相关条目]
        O --> P[返回相关信息]
    end
```

## 设计模式应用

### 1. 策略模式 (Strategy Pattern)

```typescript
// 不同的格式化策略
interface IFormatter {
  format(msgs: IMessage[]): Promise<IMessage[] | string>;
}

class OpenAIChatFormatter implements IFormatter { ... }
class SimpleFormatter implements IFormatter { ... }
class StringFormatter implements IFormatter { ... }
```

### 2. 观察者模式 (Observer Pattern)

```typescript
// Hook系统实现观察者模式
class AgentBase {
  private subscribers: Map<string, IAgent[]> = new Map();
  
  async broadcastToSubscribers(msg: IMessage): Promise<void> {
    for (const [hubName, subscribers] of this.subscribers.entries()) {
      for (const subscriber of subscribers) {
        await subscriber.observe(msg);
      }
    }
  }
}
```

### 3. 工厂模式 (Factory Pattern)

```typescript
// Agent工厂函数
export function createCodeAssistantAgent(
  name: string,
  openaiApiKey: string,
  options?: Partial<QuickCreateOptions>
): ReActAgent {
  // 创建和配置各种组件
  const model = new OpenAIChatModel({ ... });
  const formatter = new OpenAIChatFormatter();
  const toolkit = new Toolkit();
  
  return new ReActAgent({ ... });
}
```

### 4. 装饰器模式 (Decorator Pattern)

```typescript
// Hook系统作为装饰器
protected async reasoningWithHooks(...args: any[]): Promise<IMessage> {
  // 前置Hook装饰
  const modifiedArgs = await this.applyPreReasoningHooks({ args });
  
  // 核心逻辑
  let result = await this.reasoning(...(modifiedArgs?.args || args));
  
  // 后置Hook装饰
  const finalResult = await this.applyPostReasoningHooks({ args }, result);
  return finalResult || result;
}
```

## 性能优化设计

### 1. 并行工具调用

```typescript
// 支持并行和串行两种模式
if (this.parallelToolCalls) {
  // 并行执行所有工具调用
  actingResponses = await Promise.all(actingPromises);
} else {
  // 串行执行工具调用
  actingResponses = [];
  for (const promise of actingPromises) {
    actingResponses.push(await promise);
  }
}
```

### 2. 流式处理

```typescript
// 支持流式输出以提升用户体验
if (this.model.stream) {
  for await (const chunk of response) {
    msg.setContent(chunk.content);
    await this.print(msg, false); // 实时打印
  }
  await this.print(msg, true); // 最终打印
}
```

### 3. 内存优化

```typescript
// 长期内存限制大小防止内存泄漏
if (entries.length > this.maxEntries) {
  entries.shift(); // 移除最旧的条目
}
```

## 错误处理机制

### 1. 分层错误处理

```mermaid
graph TD
    A[错误发生] --> B{错误级别}
    B -->|系统级| C[记录错误日志]
    B -->|业务级| D[用户友好提示]
    B -->|工具级| E[工具错误响应]
    
    C --> F[尝试恢复]
    D --> G[继续执行]
    E --> H[返回错误结果]
    
    F --> I{恢复成功?}
    I -->|是| G
    I -->|否| J[优雅降级]
    
    G --> K[继续处理]
    H --> K
    J --> K
```

### 2. 错误恢复策略

```typescript
// 工具调用错误处理
try {
  const result = await this.toolkit.callToolFunction(toolCall);
  // 处理正常结果
} catch (error) {
  logger.error(`工具调用失败: ${toolCall.name}`, error);
  // 创建错误响应，但不中断整个流程
  const errorResponse = createErrorResponse(`工具调用失败: ${error}`);
  yield errorResponse;
}
```

## 扩展性设计

### 1. 插件化架构

系统支持通过以下方式进行扩展：

- **自定义工具**: 实现 `ToolFunction` 接口
- **自定义模型**: 实现 `IChatModel` 接口  
- **自定义格式化器**: 实现 `IFormatter` 接口
- **自定义内存**: 实现 `IMemory` 接口
- **自定义Hook**: 注册到Hook系统

### 2. 配置驱动

```typescript
// 通过配置对象控制行为
const config: AgentConfig = {
  name: 'MyAgent',
  sys_prompt: '...',
  model: customModel,
  formatter: customFormatter,
  toolkit: customToolkit,
  memory: customMemory,
  max_iters: 10,
  parallel_tool_calls: true,
  enable_meta_tool: true
};
```

这种架构设计确保了系统的：
- **可维护性**: 模块化设计，职责分离
- **可扩展性**: 接口驱动，插件化架构
- **可测试性**: 依赖注入，Mock友好
- **性能**: 并行处理，流式输出
- **健壮性**: 分层错误处理，优雅降级
