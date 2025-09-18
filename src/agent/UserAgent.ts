/**
 * 用户Agent实现
 * 用于处理用户输入和交互
 */

import { AgentBase } from './AgentBase';
import { IMessage, StructuredModel } from '../types';
import { MessageFactory } from '../message';
import { logger } from '../utils';
import * as readline from 'readline';

/**
 * 用户Agent类
 * 处理用户输入和交互
 */
export class UserAgent extends AgentBase {
  private rl: readline.Interface;
  private isActive: boolean = true;

  constructor(name: string = '用户') {
    super(name);
    
    // 创建readline接口
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    logger.debug(`初始化用户Agent: ${this.name}`);
  }

  /**
   * 获取用户输入作为回复
   */
  async reply(
    msg?: IMessage | IMessage[] | null, 
    _structuredModel?: StructuredModel
  ): Promise<IMessage> {
    if (!this.isActive) {
      throw new Error('UserAgent已关闭');
    }

    // 如果有输入消息，先打印
    if (msg) {
      await this.observe(msg);
    }

    // 获取用户输入
    const userInput = await this.getUserInput();
    
    const userMessage = MessageFactory.createUserMessage(userInput, this.name);
    
    return userMessage;
  }

  /**
   * 观察消息（打印到控制台）
   */
  async observe(msg: IMessage | IMessage[] | null): Promise<void> {
    if (!msg) return;

    const messages = Array.isArray(msg) ? msg : [msg];
    
    for (const message of messages) {
      await this.print(message);
    }
  }

  /**
   * 获取用户输入
   */
  private async getUserInput(): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(`${this.name}: `, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  /**
   * 静默回复（不需要用户输入）
   */
  async silentReply(content: string): Promise<IMessage> {
    const userMessage = MessageFactory.createUserMessage(content, this.name);
    return userMessage;
  }

  /**
   * 关闭用户Agent
   */
  close(): void {
    this.isActive = false;
    this.rl.close();
    logger.debug(`关闭用户Agent: ${this.name}`);
  }

  /**
   * 检查是否处于活动状态
   */
  isActiveAgent(): boolean {
    return this.isActive;
  }
}