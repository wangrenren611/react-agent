# API 参考文档

## 核心类

### ReActAgent

主要的 ReAct Agent 实现类。

```typescript
class ReActAgent extends ReActAgentBase {
  constructor(config: AgentConfig);
}
```

#### 构造函数参数

```typescript
interface AgentConfig {
  name: string;                    // Agent名称
  sys_prompt: string;              // 系统提示词
  model: IChatModel;               // 聊天模型
  formatter: IFormatter;           // 消息格式化器
  toolkit?: IToolkit;              // 工具包
  memory?: IMemory;                // 短期内存
  long_term_memory?: ILongTermMemory; // 长期内存
  long_term_memory_mode?: 'agent_control' | 'static_control' | 'both'; // 长期内存模式
  enable_meta_tool?: boolean;      // 启用元工具
  parallel_tool_calls?: boolean;   // 并行工具调用
  max_iters?: number;              // 最大迭代次数
}
```

#### 主要方法

##### reply()
```typescript
async reply(
  msg?: IMessage | IMessage[] | null, 
  structuredModel?: StructuredModel
): Promise<IMessage>
```
生成对输入消息的回复。

**参数:**
- `msg`: 输入消息，可以是单个消息、消息数组或null
- `structuredModel`: 可选的结构化输出模型（Zod Schema）

**返回值:** Promise<IMessage> - Agent的回复消息

**示例:**
```typescript
const agent = new ReActAgent(config);
const userMsg = MessageFactory.createUserMessage('你好');
const reply = await agent.reply(userMsg);
console.log(reply.getTextContent());
```

##### observe()
```typescript
async observe(msg: IMessage | IMessage[] | null): Promise<void>
```
观察消息而不生成回复。

##### updateSystemPrompt()
```typescript
updateSystemPrompt(newPrompt: string): void
```
更新系统提示词。

##### getMemoryStats()
```typescript
async getMemoryStats(): Promise<{
  shortTermSize: number;
  longTermStats?: { keywords: number; totalEntries: number };
}>
```
获取内存使用统计信息。

##### clearMemory()
```typescript
async clearMemory(includeLongTerm: boolean = false): Promise<void>
```
清空内存。

### AgentBase

所有Agent的基础类。

```typescript
abstract class AgentBase implements IAgent {
  readonly id: string;
  name: string;
  
  constructor(name: string);
}
```

#### 主要方法

##### registerInstanceHook()
```typescript
registerInstanceHook(
  hookType: AgentHookTypes,
  hookName: string,
  hook: HookFunction
): void
```
注册实例级Hook。

**参数:**
- `hookType`: Hook类型
- `hookName`: Hook名称
- `hook`: Hook函数

**示例:**
```typescript
agent.registerInstanceHook('pre_reply', 'myHook', (agent, kwargs) => {
  console.log('准备回复');
  return kwargs;
});
```

##### print()
```typescript
async print(msg: IMessage, last: boolean = true): Promise<void>
```
打印消息到控制台。

### UserAgent

用户交互Agent。

```typescript
class UserAgent extends AgentBase {
  constructor(
    name: string = 'User',
    inputPrompt: string = '请输入: ',
    exitKeywords: string[] = ['exit', 'quit', '退出', '结束']
  );
}
```

#### 主要方法

##### reply()
```typescript
async reply(
  msg?: IMessage | IMessage[] | null, 
  structuredModel?: StructuredModel
): Promise<IMessage>
```
获取用户输入并返回消息。

##### silentReply()
```typescript
async silentReply(input: string): Promise<IMessage>
```
静默模式回复（不显示提示符）。

##### close()
```typescript
close(): void
```
关闭readline接口。

## 消息系统

### Message

消息类实现。

```typescript
class Message implements IMessage {
  readonly id: string;
  name: string;
  content: MessageContent;
  role: MessageRole;
  metadata: Record<string, any>;
  
  constructor(
    name: string,
    content: MessageContent,
    role: MessageRole,
    metadata?: Record<string, any>,
    id?: string
  );
}
```

#### 主要方法

##### getTextContent()
```typescript
getTextContent(): string
```
获取消息的文本内容。

##### getContentBlocks()
```typescript
getContentBlocks<T extends ContentBlock>(type?: string): T[]
```
获取指定类型的内容块。

##### hasContentBlocks()
```typescript
hasContentBlocks(type: string): boolean
```
检查是否包含指定类型的内容块。

### MessageFactory

消息工厂类。

```typescript
class MessageFactory {
  static createSystemMessage(content: string, name?: string): Message;
  static createUserMessage(content: string, name?: string): Message;
  static createAssistantMessage(content: MessageContent, name?: string): Message;
}
```

## 工具系统

### Toolkit

工具包类。

```typescript
class Toolkit implements IToolkit {
  constructor();
}
```

#### 主要方法

##### registerToolFunction()
```typescript
registerToolFunction(func: ToolFunction, name?: string): void
```
注册工具函数。

##### registerToolWithMetadata()
```typescript
registerToolWithMetadata(
  func: ToolFunction,
  name: string,
  description: string,
  parameters: ToolParameterSchema
): void
```
注册带完整元数据的工具函数。

##### getJsonSchemas()
```typescript
getJsonSchemas(): ToolSchema[]
```
获取所有工具的JSON Schema。

##### callToolFunction()
```typescript
async callToolFunction(toolCall: ToolUseBlock): Promise<AsyncGenerator<ToolResponse>>
```
调用工具函数。

### ToolResponse

工具响应类。

```typescript
class ToolResponse {
  content: ContentBlock[];
  metadata: Record<string, any>;
  is_last: boolean;
  
  constructor(
    content: ContentBlock[] | string,
    metadata?: Record<string, any>,
    isLast?: boolean
  );
}
```

### 内置工具

#### executeShellCommand
```typescript
async function* executeShellCommand(
  command: string,
  workingDir?: string,
  timeout?: number
): AsyncGenerator<ToolResponse>
```
执行Shell命令。

#### executePythonCode
```typescript
async function* executePythonCode(
  code: string,
  workingDir?: string,
  timeout?: number
): AsyncGenerator<ToolResponse>
```
执行Python代码。

#### viewTextFile
```typescript
async function* viewTextFile(
  filePath: string,
  encoding?: string,
  maxLines?: number
): AsyncGenerator<ToolResponse>
```
查看文本文件内容。

#### writeTextFile
```typescript
async function* writeTextFile(
  filePath: string,
  content: string,
  encoding?: string,
  createDirs?: boolean
): AsyncGenerator<ToolResponse>
```
写入文本文件。

## 模型系统

### OpenAIChatModel

OpenAI聊天模型实现。

```typescript
class OpenAIChatModel implements IChatModel {
  constructor(config: OpenAIChatModelConfig);
}
```

#### 配置参数

```typescript
interface OpenAIChatModelConfig {
  model_name: string;        // 模型名称
  api_key: string;          // API密钥
  base_url?: string;        // 基础URL
  temperature?: number;     // 温度参数
  max_tokens?: number;      // 最大token数
  stream?: boolean;         // 是否流式输出
  timeout?: number;         // 超时时间
}
```

#### 主要方法

##### call()
```typescript
async call(
  messages: string | IMessage[], 
  tools?: ToolSchema[]
): Promise<ModelResponse | AsyncGenerator<StreamChunk>>
```
调用模型生成响应。

## 内存系统

### InMemoryMemory

内存中的短期内存实现。

```typescript
class InMemoryMemory implements IMemory {
  constructor();
}
```

#### 主要方法

##### add()
```typescript
async add(msg: IMessage | IMessage[] | null): Promise<void>
```
添加消息到内存。

##### getMemory()
```typescript
async getMemory(): Promise<IMessage[]>
```
获取内存中的所有消息。

##### clear()
```typescript
async clear(): Promise<void>
```
清空内存。

### SimpleLongTermMemory

简单的长期内存实现。

```typescript
class SimpleLongTermMemory implements ILongTermMemory {
  constructor(maxEntries?: number);
}
```

#### 主要方法

##### retrieve()
```typescript
async retrieve(msg: IMessage | IMessage[] | null): Promise<string>
```
从长期内存检索相关信息。

##### record()
```typescript
async record(msgs: IMessage[]): Promise<void>
```
记录信息到长期内存。

## 格式化器

### OpenAIChatFormatter

OpenAI聊天格式化器。

```typescript
class OpenAIChatFormatter implements IFormatter {
  constructor(
    includeNames?: boolean,
    systemMessageHandling?: 'merge' | 'separate' | 'first'
  );
}
```

#### 主要方法

##### format()
```typescript
async format(msgs: IMessage[]): Promise<IMessage[]>
```
格式化消息。

## 工厂函数

### createReActAgent()
```typescript
function createReActAgent(options: QuickCreateOptions): ReActAgent
```
快速创建ReActAgent实例。

### createCodeAssistantAgent()
```typescript
function createCodeAssistantAgent(
  name: string,
  openaiApiKey: string,
  options?: Partial<QuickCreateOptions>
): ReActAgent
```
创建代码助手Agent。

### createGeneralAssistantAgent()
```typescript
function createGeneralAssistantAgent(
  name: string,
  openaiApiKey: string,
  options?: Partial<QuickCreateOptions>
): ReActAgent
```
创建通用助手Agent。

## 类型定义

### 核心类型

```typescript
type MessageRole = 'system' | 'user' | 'assistant';
type MessageContent = string | ContentBlock[];
type AgentHookTypes = 'pre_reply' | 'post_reply' | 'pre_print' | 'post_print' | 
                     'pre_observe' | 'post_observe' | 'pre_reasoning' | 
                     'post_reasoning' | 'pre_acting' | 'post_acting';
```

### 接口类型

```typescript
interface IMessage {
  id?: string;
  name: string;
  content: MessageContent;
  role: MessageRole;
  metadata?: Record<string, any>;
}

interface IAgent {
  id: string;
  name: string;
  reply(msg?: IMessage | IMessage[] | null, structuredModel?: any): Promise<IMessage>;
  observe(msg: IMessage | IMessage[] | null): Promise<void>;
  print(msg: IMessage, last?: boolean): Promise<void>;
}
```

## 错误处理

### 常见错误类型

1. **配置错误**: 缺少必需的配置参数
2. **网络错误**: API调用失败
3. **工具错误**: 工具执行失败
4. **参数错误**: 传入参数无效
5. **内存错误**: 内存操作失败

### 错误处理最佳实践

```typescript
try {
  const response = await agent.reply(userMessage);
  console.log(response.getTextContent());
} catch (error) {
  if (error.name === 'NetworkError') {
    console.error('网络连接失败，请检查网络设置');
  } else if (error.name === 'ValidationError') {
    console.error('参数验证失败:', error.message);
  } else {
    console.error('未知错误:', error);
  }
}
```

## 使用示例

### 基础使用
```typescript
import { createCodeAssistantAgent, UserAgent } from '@agentscope/react-agent';

const agent = createCodeAssistantAgent('CodeHelper', process.env.OPENAI_API_KEY!);
const user = new UserAgent();

async function chat() {
  let msg = null;
  while (true) {
    msg = await user.reply(msg);
    if (msg.getTextContent() === 'exit') break;
    msg = await agent.reply(msg);
  }
}
```

### 结构化输出
```typescript
import { z } from 'zod';

const TaskSchema = z.object({
  title: z.string(),
  priority: z.enum(['low', 'medium', 'high']),
  deadline: z.string().optional()
});

const response = await agent.reply(userMessage, TaskSchema);
if (response.metadata) {
  const task = response.metadata; // 类型安全的结构化数据
  console.log(`任务: ${task.title}, 优先级: ${task.priority}`);
}
```

### 自定义工具
```typescript
async function* myCustomTool(param1: string, param2: number): AsyncGenerator<ToolResponse> {
  yield new ToolResponse(`处理参数: ${param1}, ${param2}`, { success: true });
}

toolkit.registerToolWithMetadata(
  myCustomTool,
  'my_tool',
  '我的自定义工具',
  {
    type: 'object',
    properties: {
      param1: { type: 'string', description: '字符串参数' },
      param2: { type: 'number', description: '数字参数' }
    },
    required: ['param1', 'param2']
  }
);
```





