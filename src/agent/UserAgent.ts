/**
 * 用户Agent实现
 * 用于处理用户输入和交互的特殊Agent
 */

import { AgentBase } from './AgentBase';
import { IMessage, StructuredModel } from '../types';
import { Message, MessageFactory } from '../message';
import { logger } from '../utils';
import * as readline from 'readline';

/**
 * 用户Agent类
 * 负责获取用户输入并转换为消息格式
 */
export class UserAgent extends AgentBase {
  private rl: readline.Interface;
  private inputPrompt: string;
  private exitKeywords: string[];

  constructor(
    name: string = 'User',
    inputPrompt: string = '请输入: ',
    exitKeywords: string[] = ['exit', 'quit', '退出', '结束']
  ) {
    super(name);
    
    this.inputPrompt = inputPrompt;
    this.exitKeywords = exitKeywords.map(keyword => keyword.toLowerCase());

    // 初始化readline接口
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.inputPrompt
    });

    logger.debug(`初始化用户Agent: ${this.name}`);
  }

  /**
   * 生成回复（获取用户输入）
   */
  async reply(
    msg?: IMessage | IMessage[] | null, 
    structuredModel?: StructuredModel
  ): Promise<IMessage> {
    // 如果有输入消息，先打印
    if (msg) {
      const messages = Array.isArray(msg) ? msg : [msg];
      for (const message of messages) {
        if (message) {
          await this.print(message, true);
        }
      }
    }

    // 获取用户输入
    const userInput = await this.getUserInput();
    
    // 检查是否为退出指令
    if (this.isExitCommand(userInput)) {
      logger.debug('用户输入退出指令');
      return MessageFactory.createUserMessage('exit', this.name);
    }

    // 创建用户消息
    const userMessage = MessageFactory.createUserMessage(userInput, this.name);
    
    logger.debug(`用户输入: ${userInput.substring(0, 100)}...`);
    
    return userMessage;
  }

  /**
   * 观察消息（用户Agent通常不需要观察）
   */
  async observe(msg: IMessage | IMessage[] | null): Promise<void> {
    // 用户Agent通常不需要观察其他消息
    // 但可以在这里添加日志记录等功能
    if (msg) {
      const messages = Array.isArray(msg) ? msg : [msg];
      logger.debug(`用户Agent观察到 ${messages.length} 条消息`);
    }
  }

  /**
   * 获取用户输入
   */
  private async getUserInput(): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(this.inputPrompt, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  /**
   * 检查是否为退出指令
   */
  private isExitCommand(input: string): boolean {
    const lowerInput = input.toLowerCase().trim();
    return this.exitKeywords.includes(lowerInput);
  }

  /**
   * 设置输入提示符
   */
  setInputPrompt(prompt: string): void {
    this.inputPrompt = prompt;
    this.rl.setPrompt(prompt);
    logger.debug(`更新输入提示符: ${prompt}`);
  }

  /**
   * 添加退出关键词
   */
  addExitKeyword(keyword: string): void {
    this.exitKeywords.push(keyword.toLowerCase());
    logger.debug(`添加退出关键词: ${keyword}`);
  }

  /**
   * 移除退出关键词
   */
  removeExitKeyword(keyword: string): void {
    const index = this.exitKeywords.indexOf(keyword.toLowerCase());
    if (index > -1) {
      this.exitKeywords.splice(index, 1);
      logger.debug(`移除退出关键词: ${keyword}`);
    }
  }

  /**
   * 获取退出关键词列表
   */
  getExitKeywords(): string[] {
    return [...this.exitKeywords];
  }

  /**
   * 关闭readline接口
   */
  close(): void {
    this.rl.close();
    logger.debug(`关闭用户Agent: ${this.name}`);
  }

  /**
   * 批量输入模式
   * 用于测试或自动化场景
   */
  async batchReply(inputs: string[]): Promise<IMessage[]> {
    const results: IMessage[] = [];
    
    for (const input of inputs) {
      if (this.isExitCommand(input)) {
        results.push(MessageFactory.createUserMessage('exit', this.name));
        break;
      }
      
      const userMessage = MessageFactory.createUserMessage(input, this.name);
      results.push(userMessage);
      
      logger.debug(`批量输入: ${input.substring(0, 100)}...`);
    }
    
    return results;
  }

  /**
   * 静默模式回复（不显示提示符）
   */
  async silentReply(input: string): Promise<IMessage> {
    if (this.isExitCommand(input)) {
      return MessageFactory.createUserMessage('exit', this.name);
    }
    
    return MessageFactory.createUserMessage(input, this.name);
  }
}

/**
 * 自动用户Agent
 * 用于测试和演示，自动提供预设的输入
 */
export class AutoUserAgent extends AgentBase {
  private inputs: string[];
  private currentIndex: number = 0;
  private loop: boolean;

  constructor(
    inputs: string[],
    name: string = 'AutoUser',
    loop: boolean = false
  ) {
    super(name);
    this.inputs = inputs;
    this.loop = loop;
    
    logger.debug(`初始化自动用户Agent: ${this.name}, 输入数量: ${inputs.length}`);
  }

  /**
   * 生成回复（返回预设输入）
   */
  async reply(
    msg?: IMessage | IMessage[] | null, 
    structuredModel?: StructuredModel
  ): Promise<IMessage> {
    // 如果有输入消息，先打印
    if (msg) {
      const messages = Array.isArray(msg) ? msg : [msg];
      for (const message of messages) {
        if (message) {
          await this.print(message, true);
        }
      }
    }

    // 获取当前输入
    if (this.currentIndex >= this.inputs.length) {
      if (this.loop) {
        this.currentIndex = 0;
      } else {
        return MessageFactory.createUserMessage('exit', this.name);
      }
    }

    const input = this.inputs[this.currentIndex];
    this.currentIndex++;

    // 添加延迟，模拟用户思考时间
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log(`${this.name}: ${input}`);
    
    const userMessage = MessageFactory.createUserMessage(input, this.name);
    logger.debug(`自动输入: ${input}`);
    
    return userMessage;
  }

  /**
   * 观察消息
   */
  async observe(msg: IMessage | IMessage[] | null): Promise<void> {
    if (msg) {
      const messages = Array.isArray(msg) ? msg : [msg];
      logger.debug(`自动用户Agent观察到 ${messages.length} 条消息`);
    }
  }

  /**
   * 重置输入索引
   */
  reset(): void {
    this.currentIndex = 0;
    logger.debug(`重置自动用户Agent: ${this.name}`);
  }

  /**
   * 添加输入
   */
  addInput(input: string): void {
    this.inputs.push(input);
    logger.debug(`添加自动输入: ${input}`);
  }

  /**
   * 设置循环模式
   */
  setLoop(loop: boolean): void {
    this.loop = loop;
    logger.debug(`设置循环模式: ${loop}`);
  }

  /**
   * 获取剩余输入数量
   */
  getRemainingInputs(): number {
    return Math.max(0, this.inputs.length - this.currentIndex);
  }
}
