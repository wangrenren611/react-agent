/**
 * ReActAgent库主入口文件
 * 导出所有核心功能和类
 */

// 核心Agent类
export * from './agent';

// 消息系统
export * from './message';

// 内存系统
export * from './memory';

// 工具系统
export * from './tool';

// 模型系统
export * from './model';

// 格式化器
export * from './formatter';

// 类型定义（排除已在其他模块导出的类型）
export type { 
  MessageRole, 
  AgentHookTypes, 
  ContentBlock, 
  TextBlock, 
  ThinkingBlock, 
  MessageContent, 
  ModelResponse, 
  StreamChunk, 
  ChatModelConfig, 
  IChatModel, 
  ToolParameterSchema, 
  ToolSchema, 
  HookFunction, 
  AgentConfig, 
  StructuredModel 
} from './types';

// 工具函数
export * from './utils';

// 版本信息
export const VERSION = '1.0.0';

/**
 * 库信息
 */
export const LIBRARY_INFO = {
  name: '@agentscope/react-agent',
  version: VERSION,
  description: 'Node.js TypeScript版本的ReActAgent实现',
  author: 'AgentScope',
  repository: 'https://github.com/agentscope/react-agent-nodejs'
};

/**
 * 快速创建ReActAgent的工厂函数
 */
export { createReActAgent } from './examples/factory';





