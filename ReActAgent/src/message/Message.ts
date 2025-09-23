/**
 * 消息相关类实现
 * 实现了消息系统的核心功能，包括消息、内容块等
 */

import { 
  IMessage, 
  MessageContent, 
  MessageRole, 
  ContentBlock, 
  TextBlock, 
  ThinkingBlock, 
  ToolUseBlock, 
  ToolResultBlock 
} from '../types';
import { generateUuid } from '../utils';

/**
 * 消息类实现
 * 表示系统中的一条消息，包含发送者、内容、角色等信息
 */
export class Message implements IMessage {
  public readonly id: string;
  public name: string;
  public content: MessageContent;
  public role: MessageRole;
  public metadata: Record<string, any>;

  constructor(
    name: string,
    content: MessageContent,
    role: MessageRole,
    metadata: Record<string, any> = {},
    id?: string
  ) {
    this.id = id || generateUuid();
    this.name = name;
    this.content = content;
    this.role = role;
    this.metadata = metadata;
  }

  /**
   * 获取文本内容
   */
  getTextContent(): string {
    if (typeof this.content === 'string') {
      return this.content;
    }
    // 确保content是数组才能使用filter方法
    if (!Array.isArray(this.content)) {
      console.warn('Message content is not an array:', this.content);
      return '';
    }

    const textBlocks = this.content.filter(block => block.type === 'text') as TextBlock[];
    return textBlocks.map(block => block.text).join('\n');
  }

  /**
   * 获取指定类型的内容块
   */
  getContentBlocks<T extends ContentBlock>(type?: string): T[] {
    if (typeof this.content === 'string') {
      if (!type || type === 'text') {
        return [{ type: 'text', text: this.content } as unknown as T];
      }
      return [];
    }

    if (!Array.isArray(this.content)) {
      return [];
    }

    if (!type) {
      return this.content as T[];
    }
     console.log('🔍 调试信息 - getContentBlocks 过滤类型:', this.content);
    return this.content.filter(block => block.type === type) as T[];
  }

  /**
   * 检查是否包含指定类型的内容块
   */
  hasContentBlocks(type: string): boolean {
    return this.getContentBlocks(type).length > 0;
  }

  /**
   * 添加内容块
   */
  addContentBlock(block: ContentBlock): void {
    if (typeof this.content === 'string') {
      // 如果当前内容是字符串，转换为内容块数组
      this.content = [
        createTextBlock(this.content),
        block
      ];
    } else {
      this.content.push(block);
    }
  }

  /**
   * 设置内容
   */
  setContent(content: MessageContent): void {
    this.content = content;
  }

  /**
   * 克隆消息
   */
  clone(): Message {
    return new Message(
      this.name,
      typeof this.content === 'string' 
        ? this.content 
        : JSON.parse(JSON.stringify(this.content)),
      this.role,
      JSON.parse(JSON.stringify(this.metadata)),
      this.id
    );
  }

  /**
   * 转换为JSON
   */
  toJSON(): any {
    return {
      id: this.id,
      name: this.name,
      content: this.content,
      role: this.role,
      metadata: this.metadata
    };
  }

  /**
   * 从JSON创建消息
   */
  static fromJSON(json: any): Message {
    return new Message(
      json.name,
      json.content,
      json.role,
      json.metadata || {},
      json.id
    );
  }
}

/**
 * 创建文本块
 */
export function createTextBlock(text: string): TextBlock {
  return {
    type: 'text',
    text
  };
}

/**
 * 创建思考块
 */
export function createThinkingBlock(thinking: string): ThinkingBlock {
  return {
    type: 'thinking',
    thinking
  };
}

/**
 * 创建工具使用块
 */
export function createToolUseBlock(
  name: string, 
  input: Record<string, any>, 
  id?: string
): ToolUseBlock {
  return {
    type: 'tool_use',
    id: id || generateUuid(),
    name,
    input
  };
}

/**
 * 创建工具结果块
 */
export function createToolResultBlock(
  id: string,
  name: string,
  output: any
): ToolResultBlock {
  return {
    type: 'tool_result',
    id,
    name,
    output
  };
}

/**
 * 消息工厂函数
 */
export class MessageFactory {
  /**
   * 创建系统消息
   */
  static createSystemMessage(content: string, name: string = 'system'): Message {
    return new Message(name, content, 'system');
  }

  /**
   * 创建用户消息
   */
  static createUserMessage(content: string, name: string = 'user'): Message {
    return new Message(name, content, 'user');
  }

  /**
   * 创建助手消息
   */
  static createAssistantMessage(
    content: MessageContent, 
    name: string = 'assistant'
  ): Message {
    return new Message(name, content, 'assistant');
  }

  /**
   * 创建工具调用消息
   */
  static createToolCallMessage(
    toolCalls: ToolUseBlock[],
    name: string = 'assistant'
  ): Message {
    return new Message(name, toolCalls, 'assistant');
  }

  /**
   * 创建工具结果消息
   */
  static createToolResultMessage(
    toolResults: ToolResultBlock[],
    name: string = 'system'
  ): Message {
    return new Message(name, toolResults, 'system');
  }
}
