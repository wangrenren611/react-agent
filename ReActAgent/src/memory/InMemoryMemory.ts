/**
 * 内存实现
 * 实现了内存管理的核心功能，包括短期内存和长期内存
 */

import { IMemory, ILongTermMemory, IMessage, ToolResponse } from '../types';
import { Message, createTextBlock } from '../message';
import { ensureArray, logger } from '../utils';

/**
 * 内存中存储的内存实现
 * 将消息存储在内存数组中，进程结束后数据会丢失
 */
export class InMemoryMemory implements IMemory {
  private messages: Message[] = [];

  /**
   * 添加消息到内存
   */
  async add(msg: IMessage | IMessage[] | null): Promise<void> {
    if (!msg) return;

    const messages = ensureArray(msg);
    for (const message of messages) {
      if (message) {
        // 确保消息是Message实例
        const msgInstance = message instanceof Message 
          ? message 
          : Message.fromJSON(message);
        
        this.messages.push(msgInstance);
        logger.debug(`添加消息到内存: ${msgInstance.name} - ${msgInstance.getTextContent().substring(0, 100)}...`);
      }
    }
  }

  /**
   * 获取内存中的所有消息
   */
  async getMemory(): Promise<IMessage[]> {
    return [...this.messages];
  }

  /**
   * 清空内存
   */
  async clear(): Promise<void> {
    const count = this.messages.length;
    this.messages = [];
    logger.debug(`清空内存，删除了 ${count} 条消息`);
  }

  /**
   * 获取最近的N条消息
   */
  async getRecentMessages(count: number): Promise<IMessage[]> {
    return this.messages.slice(-count);
  }

  /**
   * 获取内存大小
   */
  getSize(): number {
    return this.messages.length;
  }

  /**
   * 删除指定索引的消息
   */
  async removeMessage(index: number): Promise<boolean> {
    if (index >= 0 && index < this.messages.length) {
      const removed = this.messages.splice(index, 1);
      logger.debug(`删除索引 ${index} 的消息: ${removed[0]?.name}`);
      return true;
    }
    return false;
  }
}

/**
 * 简单的长期内存实现
 * 使用内存存储，支持基本的检索和记录功能
 */
export class SimpleLongTermMemory implements ILongTermMemory {
  private storage: Map<string, string[]> = new Map();
  private maxEntries: number;

  constructor(maxEntries: number = 1000) {
    this.maxEntries = maxEntries;
  }

  /**
   * 从长期内存检索相关信息
   */
  async retrieve(msg: IMessage | IMessage[] | null): Promise<string> {
    if (!msg) return '';

    const messages = ensureArray(msg);
    const query = messages
      .map(m => m instanceof Message ? m.getTextContent() : (m as IMessage).content)
      .join(' ')
      .toLowerCase();

    const keywords = this.extractKeywords(query);
    const relevantEntries: string[] = [];

    // 搜索相关条目
    for (const [key, entries] of this.storage.entries()) {
      if (keywords.some(keyword => key.includes(keyword))) {
        relevantEntries.push(...entries);
      }
    }

    // 限制返回结果数量
    const result = relevantEntries.slice(0, 10).join('\n');
    
    if (result) {
      logger.debug(`从长期内存检索到 ${relevantEntries.length} 条相关信息`);
    }

    return result;
  }

  /**
   * 记录信息到长期内存
   */
  async record(msgs: IMessage[]): Promise<void> {
    for (const msg of msgs) {
      const content = msg instanceof Message ? msg.getTextContent() : String(msg.content);
      if (content.trim()) {
        const keywords = this.extractKeywords(content.toLowerCase());
        
        for (const keyword of keywords) {
          if (!this.storage.has(keyword)) {
            this.storage.set(keyword, []);
          }
          
          const entries = this.storage.get(keyword)!;
          entries.push(content);
          
          // 限制每个关键词的条目数量
          if (entries.length > this.maxEntries) {
            entries.shift();
          }
        }
      }
    }

    logger.debug(`记录 ${msgs.length} 条消息到长期内存`);
  }

  /**
   * 记录到内存的工具函数
   */
  async *recordToMemory(content: string): AsyncGenerator<ToolResponse> {
    try {
      const msg = new Message('user', content, 'user');
      await this.record([msg]);

      yield {
        content: [createTextBlock(`成功记录内容到长期内存: ${content.substring(0, 100)}...`)],
        metadata: { success: true },
        is_last: true
      };
    } catch (error) {
      yield {
        content: [createTextBlock(`记录到长期内存失败: ${error}`)],
        metadata: { success: false, error: String(error) },
        is_last: true
      };
    }
  }

  /**
   * 从内存检索的工具函数
   */
  async *retrieveFromMemory(query: string): AsyncGenerator<ToolResponse> {
    try {
      const msg = new Message('user', query, 'user');
      const result = await this.retrieve(msg);

      yield {
        content: [createTextBlock(result || '未找到相关信息')],
        metadata: { success: true, found: !!result },
        is_last: true
      };
    } catch (error) {
      yield {
        content: [createTextBlock(`从长期内存检索失败: ${error}`)],
        metadata: { success: false, error: String(error) },
        is_last: true
      };
    }
  }

  /**
   * 提取关键词
   */
  private extractKeywords(text: string): string[] {
    // 简单的关键词提取，实际应用中可以使用更复杂的NLP方法
    const words = text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ') // 保留中英文字符
      .split(/\s+/)
      .filter(word => word.length > 2); // 过滤短词

    // 去重并限制数量
    return [...new Set(words)].slice(0, 10);
  }

  /**
   * 清空长期内存
   */
  async clear(): Promise<void> {
    const entriesCount = Array.from(this.storage.values())
      .reduce((total, entries) => total + entries.length, 0);
    
    this.storage.clear();
    logger.debug(`清空长期内存，删除了 ${entriesCount} 条记录`);
  }

  /**
   * 获取存储统计信息
   */
  getStats(): { keywords: number; totalEntries: number } {
    const totalEntries = Array.from(this.storage.values())
      .reduce((total, entries) => total + entries.length, 0);
    
    return {
      keywords: this.storage.size,
      totalEntries
    };
  }
}
