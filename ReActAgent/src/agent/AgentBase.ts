/**
 * Agent基础类实现
 * 提供Agent的基础功能和Hook系统
 */

import { 
  IAgent, 
  IMessage, 
  AgentHookTypes, 
  HookFunction,
  StructuredModel
} from '../types';
import { Message } from '../message';
import { generateUuid, logger, deepClone } from '../utils';

/**
 * Hook存储接口
 */
interface HookStorage {
  [key: string]: HookFunction;
}

/**
 * Agent基础类
 * 实现了基本的Agent功能和完整的Hook系统
 */
export abstract class AgentBase implements IAgent {
  public readonly id: string;
  public name: string;

  // 支持的Hook类型
  protected static readonly supportedHookTypes: AgentHookTypes[] = [
    'pre_reply',
    'post_reply',
    'pre_print',
    'post_print',
    'pre_observe',
    'post_observe'
  ];

  // 类级别的Hook存储
  private static classHooks: Map<string, Map<AgentHookTypes, HookStorage>> = new Map();

  // 实例级别的Hook存储
  private instanceHooks: Map<AgentHookTypes, HookStorage> = new Map();

  // 当前回复任务
  private replyTask: Promise<IMessage> | null = null;

  // 流式打印前缀缓存
  private streamPrefix: Map<string, string> = new Map();

  // 订阅者管理
  private subscribers: Map<string, IAgent[]> = new Map();

  // 控制台输出开关
  private _disableConsoleOutput: boolean = false;

  constructor(name: string) {
    this.id = generateUuid();
    this.name = name;

    // 初始化实例级Hook存储
    for (const hookType of AgentBase.supportedHookTypes) {
      this.instanceHooks.set(hookType, {});
    }

    logger.debug(`初始化Agent: ${this.name} (ID: ${this.id})`);
  }

  /**
   * 生成回复 - 抽象方法，由子类实现
   */
  abstract reply(
    msg?: IMessage | IMessage[] | null, 
    structuredModel?: StructuredModel
  ): Promise<IMessage>;

  /**
   * 观察消息 - 抽象方法，由子类实现
   */
  abstract observe(msg: IMessage | IMessage[] | null): Promise<void>;

  /**
   * 打印消息
   */
  async print(msg: IMessage, last: boolean = true): Promise<void> {
    if (this._disableConsoleOutput) {
      return;
    }

    // 应用pre_print hooks
    const printArgs = { msg, last };
    const modifiedArgs = await this.applyPreHooks('pre_print', printArgs);
    
    if (modifiedArgs) {
      await this.doPrint(modifiedArgs.msg, modifiedArgs.last);
    }

    // 应用post_print hooks
    await this.applyPostHooks('post_print', printArgs, null);
  }

  /**
   * 实际的打印逻辑
   */
  private async doPrint(msg: IMessage, last: boolean): Promise<void> {
    const thinkingAndTextToPrint: string[] = [];
    
    // 处理消息内容
    const contentBlocks = msg instanceof Message 
      ? msg.getContentBlocks() 
      : (Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: String(msg.content) }]);

    for (const block of contentBlocks) {
      const prefix = this.streamPrefix.get(msg.id || '') || '';
      
      if (block.type === 'text' || block.type === 'thinking') {
        const blockType = block.type;
        const formatPrefix = blockType === 'text' ? '' : '(thinking)';
        const content = (block as any)[blockType] || '';
        
        thinkingAndTextToPrint.push(`${msg.name}${formatPrefix}: ${content}`);
        
        const toPrint = thinkingAndTextToPrint.join('\n');
        if (toPrint.length > prefix.length) {
          process.stdout.write(toPrint.slice(prefix.length));
          this.streamPrefix.set(msg.id || '', toPrint);
        }
      } else if (last) {
        // 对于非文本/思考块，在最后打印
        if (prefix) {
          if (!prefix.endsWith('\n')) {
            console.log('\n' + JSON.stringify(block, null, 2));
          } else {
            console.log(JSON.stringify(block, null, 2));
          }
        } else {
          console.log(`${msg.name}: ${JSON.stringify(block, null, 2)}`);
        }
      }
    }

    // 清理流式前缀
    if (last && msg.id && this.streamPrefix.has(msg.id)) {
      const lastPrefix = this.streamPrefix.get(msg.id);
      this.streamPrefix.delete(msg.id);
      if (lastPrefix && !lastPrefix.endsWith('\n')) {
        console.log();
      }
    }
  }

  /**
   * 处理中断
   */
  async handleInterrupt(_msg?: IMessage | IMessage[] | null): Promise<IMessage> {
    const responseMsg = new Message(
      this.name,
      '我注意到您打断了我。有什么我可以为您做的吗？',
      'assistant',
      {}
    );

    await this.print(responseMsg, true);
    return responseMsg;
  }

  /**
   * 中断当前回复过程
   */
  async interrupt(_msg?: IMessage | IMessage[] | null): Promise<void> {
    if (this.replyTask) {
      // 注意：在实际实现中，这里需要更复杂的中断机制
      logger.debug(`中断Agent回复: ${this.name}`);
      this.replyTask = null;
    }
  }

  /**
   * 调用Agent（包装reply方法）
   */
  async __call__(
    msg?: IMessage | IMessage[] | null, 
    structuredModel?: StructuredModel
  ): Promise<IMessage> {
    let replyMsg: IMessage | null = null;

    try {
      // 应用pre_reply hooks
      const replyArgs = { msg, structuredModel };
      const modifiedArgs = await this.applyPreHooks('pre_reply', replyArgs);
      
      if (modifiedArgs) {
        replyMsg = await this.reply(modifiedArgs.msg, modifiedArgs.structuredModel);
      } else {
        replyMsg = await this.reply(msg, structuredModel);
      }

      // 应用post_reply hooks
      const finalMsg = await this.applyPostHooks('post_reply', replyArgs, replyMsg);
      if (finalMsg) {
        replyMsg = finalMsg;
      }

    } catch (error) {
      logger.error(`Agent回复失败: ${this.name}`, error);
      replyMsg = await this.handleInterrupt(msg);
    } finally {
      // 广播消息给订阅者
      if (replyMsg) {
        await this.broadcastToSubscribers(replyMsg);
      }
      this.replyTask = null;
    }

    return replyMsg!;
  }

  /**
   * 注册实例级Hook
   */
  registerInstanceHook(
    hookType: AgentHookTypes,
    hookName: string,
    hook: HookFunction
  ): void {
    if (!AgentBase.supportedHookTypes.includes(hookType)) {
      throw new Error(`不支持的Hook类型: ${hookType}`);
    }

    const hooks = this.instanceHooks.get(hookType)!;
    hooks[hookName] = hook;
    
    logger.debug(`注册实例级Hook: ${this.name}.${hookType}.${hookName}`);
  }

  /**
   * 移除实例级Hook
   */
  removeInstanceHook(hookType: AgentHookTypes, hookName: string): void {
    const hooks = this.instanceHooks.get(hookType);
    if (hooks && hooks[hookName]) {
      delete hooks[hookName];
      logger.debug(`移除实例级Hook: ${this.name}.${hookType}.${hookName}`);
    } else {
      throw new Error(`Hook '${hookName}' 在 '${hookType}' 中未找到`);
    }
  }

  /**
   * 清空实例级Hook
   */
  clearInstanceHooks(hookType?: AgentHookTypes): void {
    if (hookType) {
      const hooks = this.instanceHooks.get(hookType);
      if (hooks) {
        Object.keys(hooks).forEach(key => delete hooks[key]);
        logger.debug(`清空实例级Hook: ${this.name}.${hookType}`);
      }
    } else {
      for (const [_type, hooks] of this.instanceHooks.entries()) {
        Object.keys(hooks).forEach(key => delete hooks[key]);
      }
      logger.debug(`清空所有实例级Hook: ${this.name}`);
    }
  }

  /**
   * 注册类级Hook
   */
  static registerClassHook(
    className: string,
    hookType: AgentHookTypes,
    hookName: string,
    hook: HookFunction
  ): void {
    if (!this.supportedHookTypes.includes(hookType)) {
      throw new Error(`不支持的Hook类型: ${hookType}`);
    }

    if (!this.classHooks.has(className)) {
      this.classHooks.set(className, new Map());
    }

    const classHookMap = this.classHooks.get(className)!;
    if (!classHookMap.has(hookType)) {
      classHookMap.set(hookType, {});
    }

    const hooks = classHookMap.get(hookType)!;
    hooks[hookName] = hook;
    
    logger.debug(`注册类级Hook: ${className}.${hookType}.${hookName}`);
  }

  /**
   * 移除类级Hook
   */
  static removeClassHook(
    className: string,
    hookType: AgentHookTypes,
    hookName: string
  ): void {
    const classHookMap = this.classHooks.get(className);
    if (classHookMap) {
      const hooks = classHookMap.get(hookType);
      if (hooks && hooks[hookName]) {
        delete hooks[hookName];
        logger.debug(`移除类级Hook: ${className}.${hookType}.${hookName}`);
      } else {
        throw new Error(`Hook '${hookName}' 在 '${className}.${hookType}' 中未找到`);
      }
    }
  }

  /**
   * 清空类级Hook
   */
  static clearClassHooks(className?: string, hookType?: AgentHookTypes): void {
    if (className) {
      const classHookMap = this.classHooks.get(className);
      if (classHookMap) {
        if (hookType) {
          const hooks = classHookMap.get(hookType);
          if (hooks) {
            Object.keys(hooks).forEach(key => delete hooks[key]);
            logger.debug(`清空类级Hook: ${className}.${hookType}`);
          }
        } else {
          for (const [_type, hooks] of classHookMap.entries()) {
            Object.keys(hooks).forEach(key => delete hooks[key]);
          }
          logger.debug(`清空所有类级Hook: ${className}`);
        }
      }
    } else {
      this.classHooks.clear();
      logger.debug('清空所有类级Hook');
    }
  }

  /**
   * 重置订阅者
   */
  resetSubscribers(msgHubName: string, subscribers: IAgent[]): void {
    this.subscribers.set(msgHubName, subscribers.filter(agent => agent !== this));
    logger.debug(`重置订阅者: ${msgHubName}, 数量: ${subscribers.length}`);
  }

  /**
   * 移除订阅者
   */
  removeSubscribers(msgHubName: string): void {
    if (this.subscribers.has(msgHubName)) {
      this.subscribers.delete(msgHubName);
      logger.debug(`移除订阅者: ${msgHubName}`);
    } else {
      logger.warn(`消息中心 '${msgHubName}' 未找到`);
    }
  }

  /**
   * 禁用控制台输出
   */
  disableConsoleOutput(): void {
    this._disableConsoleOutput = true;
    logger.debug(`禁用控制台输出: ${this.name}`);
  }

  /**
   * 启用控制台输出
   */
  enableConsoleOutput(): void {
    this._disableConsoleOutput = false;
    logger.debug(`启用控制台输出: ${this.name}`);
  }

  /**
   * 应用前置Hook
   */
  private async applyPreHooks(
    hookType: AgentHookTypes,
    args: Record<string, any>
  ): Promise<Record<string, any> | null> {
    let currentArgs = deepClone(args);

    // 应用类级Hook
    const className = this.constructor.name;
    const classHookMap = AgentBase.classHooks.get(className);
    if (classHookMap) {
      const classHooks = classHookMap.get(hookType);
      if (classHooks) {
        for (const [hookName, hook] of Object.entries(classHooks)) {
          try {
            const result = await hook(this, currentArgs);
            if (result) {
              currentArgs = result;
            }
          } catch (error) {
            logger.error(`类级Hook执行失败: ${className}.${hookType}.${hookName}`, error);
          }
        }
      }
    }

    // 应用实例级Hook
    const instanceHooks = this.instanceHooks.get(hookType);
    if (instanceHooks) {
      for (const [hookName, hook] of Object.entries(instanceHooks)) {
        try {
          const result = await hook(this, currentArgs);
          if (result) {
            currentArgs = result;
          }
        } catch (error) {
          logger.error(`实例级Hook执行失败: ${this.name}.${hookType}.${hookName}`, error);
        }
      }
    }

    return currentArgs;
  }

  /**
   * 应用后置Hook
   */
  private async applyPostHooks<T>(
    hookType: AgentHookTypes,
    args: Record<string, any>,
    output: T
  ): Promise<T | null> {
    let currentOutput = output;

    // 应用类级Hook
    const className = this.constructor.name;
    const classHookMap = AgentBase.classHooks.get(className);
    if (classHookMap) {
      const classHooks = classHookMap.get(hookType);
      if (classHooks) {
        for (const [hookName, hook] of Object.entries(classHooks)) {
          try {
            const result = await hook(this, args, currentOutput);
            if (result !== null && result !== undefined) {
              currentOutput = result;
            }
          } catch (error) {
            logger.error(`类级Hook执行失败: ${className}.${hookType}.${hookName}`, error);
          }
        }
      }
    }

    // 应用实例级Hook
    const instanceHooks = this.instanceHooks.get(hookType);
    if (instanceHooks) {
      for (const [hookName, hook] of Object.entries(instanceHooks)) {
        try {
          const result = await hook(this, args, currentOutput);
          if (result !== null && result !== undefined) {
            currentOutput = result;
          }
        } catch (error) {
          logger.error(`实例级Hook执行失败: ${this.name}.${hookType}.${hookName}`, error);
        }
      }
    }

    return currentOutput;
  }

  /**
   * 广播消息给订阅者
   */
  private async broadcastToSubscribers(msg: IMessage | IMessage[] | null): Promise<void> {
    if (!msg) return;

    for (const [hubName, subscribers] of this.subscribers.entries()) {
      for (const subscriber of subscribers) {
        try {
          await subscriber.observe(msg);
        } catch (error) {
          logger.error(`广播消息失败: ${hubName} -> ${subscriber.name}`, error);
        }
      }
    }
  }
}
