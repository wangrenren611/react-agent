/**
 * OpenAI聊天格式化器实现
 * 将消息格式化为OpenAI API所需的格式
 */

import { IFormatter, IMessage } from '../types';
import { Message } from '../message';
import { logger } from '../utils';

/**
 * OpenAI聊天格式化器
 * 负责将内部消息格式转换为OpenAI API格式
 */
export class OpenAIChatFormatter implements IFormatter {
  private includeNames: boolean;
  private systemMessageHandling: 'merge' | 'separate' | 'first';

  constructor(
    includeNames: boolean = true,
    systemMessageHandling: 'merge' | 'separate' | 'first' = 'separate'
  ) {
    this.includeNames = includeNames;
    this.systemMessageHandling = systemMessageHandling;
    
    logger.debug('初始化OpenAI聊天格式化器', {
      includeNames,
      systemMessageHandling
    });
  }

  /**
   * 格式化消息
   * 将内部消息格式转换为OpenAI API可接受的格式
   */
  async format(msgs: IMessage[]): Promise<IMessage[]> {
    if (!msgs || msgs.length === 0) {
      return [];
    }

    logger.debug(`格式化 ${msgs.length} 条消息`);

    // 检查是否有工具相关内容（工具调用或工具结果）
    const hasToolContent = msgs.some(msg => 
      Array.isArray(msg.content) && msg.content.some(block => 
        block.type === 'tool_use' || block.type === 'tool_result'
      )
    );

    // 如果有工具相关内容，保持原始顺序以避免破坏工具调用/结果的配对关系
    if (hasToolContent) {
      return this.postProcess(this.formatRegularMessages(msgs));
    }

    const formattedMessages: IMessage[] = [];

    // 处理系统消息
    const systemMessages = msgs.filter(msg => msg.role === 'system');
    const nonSystemMessages = msgs.filter(msg => msg.role !== 'system');

    switch (this.systemMessageHandling) {
      case 'merge':
        if (systemMessages.length > 0) {
          const mergedSystemContent = systemMessages
            .map(msg => this.extractTextContent(msg))
            .filter(content => content.trim())
            .join('\n\n');
          
          if (mergedSystemContent) {
            formattedMessages.push(new Message(
              'system',
              mergedSystemContent,
              'system'
            ));
          }
        }
        formattedMessages.push(...this.formatRegularMessages(nonSystemMessages));
        break;

      case 'first':
        if (systemMessages.length > 0) {
          // 只保留第一个系统消息
          const firstSystemMessage = systemMessages[0];
          formattedMessages.push(new Message(
            'system',
            this.extractTextContent(firstSystemMessage),
            'system'
          ));
        }
        formattedMessages.push(...this.formatRegularMessages(nonSystemMessages));
        break;

      case 'separate':
      default:
        // 保持系统消息分离
        formattedMessages.push(...this.formatRegularMessages(systemMessages));
        formattedMessages.push(...this.formatRegularMessages(nonSystemMessages));
        break;
    }

    return this.postProcess(formattedMessages);
  }

  /**
   * 格式化常规消息（非系统消息的特殊处理）
   */
  private formatRegularMessages(msgs: IMessage[]): IMessage[] {
    return msgs.map(msg => this.formatSingleMessage(msg));
  }

  /**
   * 格式化单个消息
   */
  private formatSingleMessage(msg: IMessage): IMessage {
    const formattedMsg = new Message(
      this.includeNames ? msg.name : msg.role,
      msg.content,
      msg.role,
      msg.metadata || {}
    );

    // 如果内容是数组，需要特殊处理
    if (Array.isArray(msg.content)) {
      const textBlocks = msg.content.filter(block => block.type === 'text');
      const toolBlocks = msg.content.filter(block => 
        block.type === 'tool_use' || block.type === 'tool_result'
      );

      // 如果只有文本块，简化为字符串
      if (textBlocks.length > 0 && toolBlocks.length === 0) {
        formattedMsg.content = textBlocks
          .map(block => (block as any).text)
          .join('\n');
      }
      // 否则保持原始格式，让模型处理
    }

    return formattedMsg;
  }

  /**
   * 提取文本内容
   */
  private extractTextContent(msg: IMessage): string {
    if (typeof msg.content === 'string') {
      return msg.content;
    }

    if (Array.isArray(msg.content)) {
      const textBlocks = msg.content.filter(block => block.type === 'text');
      return textBlocks.map(block => (block as any).text).join('\n');
    }

    return '';
  }

  /**
   * 后处理格式化后的消息
   */
  private postProcess(msgs: IMessage[]): IMessage[] {
    // 移除空消息
    const nonEmptyMessages = msgs.filter(msg => {
      const content = this.extractTextContent(msg);
      return content.trim().length > 0 || 
             (Array.isArray(msg.content) && msg.content.some(block => 
               block.type === 'tool_use' || block.type === 'tool_result'
             ));
    });

    // 如果启用了系统消息分离模式，确保系统消息在前
    // 但要注意保持工具调用和工具结果的配对关系
    if (this.systemMessageHandling === 'separate') {
      const systemMessages = nonEmptyMessages.filter(msg => msg.role === 'system');
      const otherMessages = nonEmptyMessages.filter(msg => msg.role !== 'system');
      
      // 检查是否有工具相关的内容块
      const hasToolContent = nonEmptyMessages.some(msg => 
        Array.isArray(msg.content) && msg.content.some(block => 
          block.type === 'tool_use' || block.type === 'tool_result'
        )
      );
      
      // 如果有工具相关内容，保持原始顺序以避免破坏工具调用/结果的配对
      if (hasToolContent) {
        return nonEmptyMessages;
      }
      
      return [...systemMessages, ...otherMessages];
    }

    return nonEmptyMessages;
  }

  /**
   * 设置配置
   */
  setConfig(config: {
    includeNames?: boolean;
    systemMessageHandling?: 'merge' | 'separate' | 'first';
  }): void {
    if (config.includeNames !== undefined) {
      this.includeNames = config.includeNames;
    }
    if (config.systemMessageHandling !== undefined) {
      this.systemMessageHandling = config.systemMessageHandling;
    }

    logger.debug('更新OpenAI聊天格式化器配置', config);
  }

  /**
   * 获取当前配置
   */
  getConfig(): {
    includeNames: boolean;
    systemMessageHandling: 'merge' | 'separate' | 'first';
  } {
    return {
      includeNames: this.includeNames,
      systemMessageHandling: this.systemMessageHandling
    };
  }
}

/**
 * 简单格式化器
 * 最小化的格式化处理，适用于简单场景
 */
export class SimpleFormatter implements IFormatter {
  async format(msgs: IMessage[]): Promise<IMessage[]> {
    return msgs.map(msg => new Message(
      msg.name,
      msg.content,
      msg.role,
      msg.metadata || {}
    ));
  }
}

/**
 * 字符串格式化器
 * 将所有消息转换为字符串格式
 */
export class StringFormatter implements IFormatter {
  private separator: string;
  private includeRoles: boolean;
  private includeNames: boolean;

  constructor(
    separator: string = '\n\n',
    includeRoles: boolean = true,
    includeNames: boolean = true
  ) {
    this.separator = separator;
    this.includeRoles = includeRoles;
    this.includeNames = includeNames;
  }

  async format(msgs: IMessage[]): Promise<string> {
    const formattedMessages = msgs.map(msg => {
      let prefix = '';
      
      if (this.includeRoles && this.includeNames) {
        prefix = `[${msg.role}:${msg.name}] `;
      } else if (this.includeRoles) {
        prefix = `[${msg.role}] `;
      } else if (this.includeNames) {
        prefix = `${msg.name}: `;
      }

      const content = typeof msg.content === 'string' 
        ? msg.content 
        : this.extractTextFromBlocks(msg.content);

      return prefix + content;
    });

    return formattedMessages.join(this.separator);
  }

  private extractTextFromBlocks(blocks: any[]): string {
    return blocks
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');
  }
}

