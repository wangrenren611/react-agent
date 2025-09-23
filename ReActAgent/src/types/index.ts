/**
 * 类型定义文件
 * 定义了ReActAgent系统中使用的所有核心类型和接口
 */

import { z } from 'zod';

// ========== 基础类型 ==========

/**
 * 消息角色类型
 */
export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * Hook类型定义
 */
export type AgentHookTypes = 
  | 'pre_reply' 
  | 'post_reply' 
  | 'pre_print' 
  | 'post_print' 
  | 'pre_observe' 
  | 'post_observe'
  | 'pre_reasoning'
  | 'post_reasoning'
  | 'pre_acting'
  | 'post_acting';

// ========== 消息相关类型 ==========

/**
 * 内容块基础接口
 */
export interface ContentBlock {
  type: string;
}

/**
 * 文本块
 */
export interface TextBlock extends ContentBlock {
  type: 'text';
  text: string;
}

/**
 * 思考块
 */
export interface ThinkingBlock extends ContentBlock {
  type: 'thinking';
  thinking: string;
}

/**
 * 工具使用块
 */
export interface ToolUseBlock extends ContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}

/**
 * 工具结果块
 */
export interface ToolResultBlock extends ContentBlock {
  type: 'tool_result';
  id: string;
  name: string;
  output: any;
}

/**
 * 消息内容类型
 */
export type MessageContent = string | ContentBlock[];

/**
 * 消息接口
 */
export interface IMessage {
  id?: string;
  name: string;
  content: MessageContent;
  role: MessageRole;
  metadata?: Record<string, any>;
  
  /**
   * 获取文本内容
   */
  getTextContent(): string;
  
  /**
   * 获取指定类型的内容块
   */
  getContentBlocks<T extends ContentBlock>(type?: string): T[];
  
  /**
   * 检查是否包含指定类型的内容块
   */
  hasContentBlocks(type: string): boolean;
  
  /**
   * 添加内容块
   */
  addContentBlock(block: ContentBlock): void;
  
  /**
   * 设置内容
   */
  setContent(content: MessageContent): void;
  
  /**
   * 克隆消息
   */
  clone(): IMessage;
}

// ========== 模型相关类型 ==========

/**
 * 模型响应接口
 */
export interface ModelResponse {
  content: ContentBlock[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * 流式响应块
 */
export interface StreamChunk {
  content: ContentBlock[];
  is_last: boolean;
}

/**
 * 聊天模型配置
 */
export interface ChatModelConfig {
  model_name: string;
  api_key?: string;
  base_url?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

/**
 * 聊天模型接口
 */
export interface IChatModel {
  config: ChatModelConfig;
  stream: boolean;
  
  /**
   * 调用模型生成响应
   */
  call(
    messages: string | IMessage[], 
    tools?: ToolSchema[]
  ): Promise<ModelResponse | AsyncGenerator<StreamChunk>>;
}

// ========== 工具相关类型 ==========

/**
 * 工具参数Schema
 */
export interface ToolParameterSchema {
  type: string;
  description?: string;
  enum?: string[];
  items?: ToolParameterSchema;
  properties?: Record<string, ToolParameterSchema>;
  required?: string[];
}

/**
 * 工具Schema定义
 */
export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: ToolParameterSchema;
  };
}

/**
 * 工具响应
 */
export interface ToolResponse {
  content: ContentBlock[];
  metadata: Record<string, any>;
  is_last: boolean;
}

/**
 * 工具函数类型
 */
export type ToolFunction = (...args: any[]) => AsyncGenerator<ToolResponse>;

/**
 * 工具包接口
 */
export interface IToolkit {
  /**
   * 注册工具函数
   */
  registerToolFunction(func: ToolFunction, name?: string): void;
  
  /**
   * 注册带完整元数据的工具函数
   */
  registerToolWithMetadata(
    func: ToolFunction,
    name: string,
    description: string,
    parameters: ToolParameterSchema
  ): void;
  
  /**
   * 获取工具JSON Schema
   */
  getJsonSchemas(): ToolSchema[];
  
  /**
   * 调用工具函数
   */
  callToolFunction(toolCall: ToolUseBlock): Promise<AsyncGenerator<ToolResponse>>;
  
  /**
   * 重置装备的工具
   */
  resetEquippedTools(toolNames: string[]): void;
  
  /**
   * 设置扩展模型
   */
  setExtendedModel(toolName: string, model: StructuredModel): void;
}

// ========== 内存相关类型 ==========

/**
 * 内存接口
 */
export interface IMemory {
  /**
   * 添加消息到内存
   */
  add(msg: IMessage | IMessage[] | null): Promise<void>;
  
  /**
   * 获取内存中的消息
   */
  getMemory(): Promise<IMessage[]>;
  
  /**
   * 清空内存
   */
  clear(): Promise<void>;
}

/**
 * 长期内存接口
 */
export interface ILongTermMemory {
  /**
   * 从长期内存检索信息
   */
  retrieve(msg: IMessage | IMessage[] | null): Promise<string>;
  
  /**
   * 记录信息到长期内存
   */
  record(msgs: IMessage[]): Promise<void>;
  
  /**
   * 记录内容到内存
   */
  recordToMemory(content: string): AsyncGenerator<ToolResponse>;
  
  /**
   * 从内存检索信息
   */
  retrieveFromMemory(query: string): AsyncGenerator<ToolResponse>;
}

// ========== 格式化器相关类型 ==========

/**
 * 格式化器接口
 */
export interface IFormatter {
  /**
   * 格式化消息
   */
  format(msgs: IMessage[]): Promise<string | IMessage[]>;
}

// ========== Agent相关类型 ==========

/**
 * Hook函数类型
 */
export type HookFunction<T = any> = (
  agent: any,
  kwargs: Record<string, any>,
  output?: T
) => Record<string, any> | T | null;

/**
 * Agent配置
 */
export interface AgentConfig {
  name: string;
  sys_prompt: string;
  model: IChatModel;
  formatter: IFormatter;
  toolkit?: IToolkit;
  memory?: IMemory;
  long_term_memory?: ILongTermMemory;
  long_term_memory_mode?: 'agent_control' | 'static_control' | 'both';
  enable_meta_tool?: boolean;
  parallel_tool_calls?: boolean;
  max_iters?: number;
}

/**
 * Agent基础接口
 */
export interface IAgent {
  id: string;
  name: string;
  
  /**
   * 生成回复
   */
  reply(msg?: IMessage | IMessage[] | null, structuredModel?: any): Promise<IMessage>;
  
  /**
   * 观察消息
   */
  observe(msg: IMessage | IMessage[] | null): Promise<void>;
  
  /**
   * 打印消息
   */
  print(msg: IMessage, last?: boolean): Promise<void>;
  
  /**
   * 处理中断
   */
  handleInterrupt(msg?: IMessage | IMessage[] | null): Promise<IMessage>;
  
  /**
   * 中断当前回复过程
   */
  interrupt(msg?: IMessage | IMessage[] | null): Promise<void>;
}

// ========== 结构化输出相关 ==========

/**
 * Zod Schema类型
 */
export type StructuredModel = z.ZodType<any>;

// ========== 导出所有类型 ==========
// 注意：不要在此处添加循环导入

