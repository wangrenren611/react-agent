/**
 * ReAct Agent基础类实现
 * 扩展Agent基础类，添加推理(Reasoning)和行动(Acting)的抽象接口和Hook支持
 */

import { AgentBase } from './AgentBase';
import { IMessage, AgentHookTypes, HookFunction } from '../types';
import { logger, deepClone } from '../utils';

/**
 * ReAct Agent基础类
 * 在AgentBase基础上添加了推理和行动的抽象方法，以及相应的Hook支持
 */
export abstract class ReActAgentBase extends AgentBase {
  // 扩展支持的Hook类型，添加推理和行动相关的Hook
  protected static readonly supportedHookTypes: AgentHookTypes[] = [
    'pre_reply',
    'post_reply',
    'pre_print',
    'post_print',
    'pre_observe',
    'post_observe',
    'pre_reasoning',
    'post_reasoning',
    'pre_acting',
    'post_acting'
  ];

  // 实例级推理和行动Hook存储
  private instanceReasoningHooks: Map<string, HookFunction> = new Map();
  private instanceActingHooks: Map<string, HookFunction> = new Map();

  // 类级推理和行动Hook存储
  private static classReasoningHooks: Map<string, Map<string, HookFunction>> = new Map();
  private static classActingHooks: Map<string, Map<string, HookFunction>> = new Map();

  constructor(name: string) {
    super(name);
    logger.debug(`初始化ReActAgent基础类: ${this.name}`);
  }

  /**
   * 推理过程 - 抽象方法，由子类实现
   * 在ReAct循环中负责分析当前状态并决定下一步行动
   */
  abstract reasoning(...args: any[]): Promise<IMessage>;

  /**
   * 行动过程 - 抽象方法，由子类实现  
   * 在ReAct循环中负责执行具体的行动（如调用工具）
   */
  abstract acting(...args: any[]): Promise<IMessage | null>;

  /**
   * 带Hook支持的推理方法
   * 包装抽象的reasoning方法，添加前置和后置Hook支持
   */
  protected async reasoningWithHooks(...args: any[]): Promise<IMessage> {
    // 应用前置推理Hook
    const reasoningArgs = { args };
    const modifiedArgs = await this.applyPreReasoningHooks(reasoningArgs);
    
    let result: IMessage;
    if (modifiedArgs) {
      result = await this.reasoning(...modifiedArgs.args);
    } else {
      result = await this.reasoning(...args);
    }

    // 应用后置推理Hook
    const finalResult = await this.applyPostReasoningHooks(reasoningArgs, result);
    return finalResult || result;
  }

  /**
   * 带Hook支持的行动方法
   * 包装抽象的acting方法，添加前置和后置Hook支持
   */
  protected async actingWithHooks(...args: any[]): Promise<IMessage | null> {
    // 应用前置行动Hook
    const actingArgs = { args };
    const modifiedArgs = await this.applyPreActingHooks(actingArgs);
    
    let result: IMessage | null;
    if (modifiedArgs) {
      result = await this.acting(...modifiedArgs.args);
    } else {
      result = await this.acting(...args);
    }

    // 应用后置行动Hook
    const finalResult = await this.applyPostActingHooks(actingArgs, result);
    return finalResult !== undefined ? finalResult : result;
  }

  /**
   * 注册实例级推理Hook
   */
  registerInstanceReasoningHook(hookName: string, hook: HookFunction): void {
    this.instanceReasoningHooks.set(hookName, hook);
    logger.debug(`注册实例级推理Hook: ${this.name}.${hookName}`);
  }

  /**
   * 注册实例级行动Hook
   */
  registerInstanceActingHook(hookName: string, hook: HookFunction): void {
    this.instanceActingHooks.set(hookName, hook);
    logger.debug(`注册实例级行动Hook: ${this.name}.${hookName}`);
  }

  /**
   * 移除实例级推理Hook
   */
  removeInstanceReasoningHook(hookName: string): void {
    if (this.instanceReasoningHooks.has(hookName)) {
      this.instanceReasoningHooks.delete(hookName);
      logger.debug(`移除实例级推理Hook: ${this.name}.${hookName}`);
    } else {
      throw new Error(`推理Hook '${hookName}' 未找到`);
    }
  }

  /**
   * 移除实例级行动Hook
   */
  removeInstanceActingHook(hookName: string): void {
    if (this.instanceActingHooks.has(hookName)) {
      this.instanceActingHooks.delete(hookName);
      logger.debug(`移除实例级行动Hook: ${this.name}.${hookName}`);
    } else {
      throw new Error(`行动Hook '${hookName}' 未找到`);
    }
  }

  /**
   * 清空实例级推理Hook
   */
  clearInstanceReasoningHooks(): void {
    this.instanceReasoningHooks.clear();
    logger.debug(`清空实例级推理Hook: ${this.name}`);
  }

  /**
   * 清空实例级行动Hook
   */
  clearInstanceActingHooks(): void {
    this.instanceActingHooks.clear();
    logger.debug(`清空实例级行动Hook: ${this.name}`);
  }

  /**
   * 注册类级推理Hook
   */
  static registerClassReasoningHook(
    className: string,
    hookName: string,
    hook: HookFunction
  ): void {
    if (!this.classReasoningHooks.has(className)) {
      this.classReasoningHooks.set(className, new Map());
    }
    
    const classHooks = this.classReasoningHooks.get(className)!;
    classHooks.set(hookName, hook);
    
    logger.debug(`注册类级推理Hook: ${className}.${hookName}`);
  }

  /**
   * 注册类级行动Hook
   */
  static registerClassActingHook(
    className: string,
    hookName: string,
    hook: HookFunction
  ): void {
    if (!this.classActingHooks.has(className)) {
      this.classActingHooks.set(className, new Map());
    }
    
    const classHooks = this.classActingHooks.get(className)!;
    classHooks.set(hookName, hook);
    
    logger.debug(`注册类级行动Hook: ${className}.${hookName}`);
  }

  /**
   * 移除类级推理Hook
   */
  static removeClassReasoningHook(className: string, hookName: string): void {
    const classHooks = this.classReasoningHooks.get(className);
    if (classHooks && classHooks.has(hookName)) {
      classHooks.delete(hookName);
      logger.debug(`移除类级推理Hook: ${className}.${hookName}`);
    } else {
      throw new Error(`推理Hook '${hookName}' 在类 '${className}' 中未找到`);
    }
  }

  /**
   * 移除类级行动Hook
   */
  static removeClassActingHook(className: string, hookName: string): void {
    const classHooks = this.classActingHooks.get(className);
    if (classHooks && classHooks.has(hookName)) {
      classHooks.delete(hookName);
      logger.debug(`移除类级行动Hook: ${className}.${hookName}`);
    } else {
      throw new Error(`行动Hook '${hookName}' 在类 '${className}' 中未找到`);
    }
  }

  /**
   * 清空类级推理Hook
   */
  static clearClassReasoningHooks(className?: string): void {
    if (className) {
      const classHooks = this.classReasoningHooks.get(className);
      if (classHooks) {
        classHooks.clear();
        logger.debug(`清空类级推理Hook: ${className}`);
      }
    } else {
      this.classReasoningHooks.clear();
      logger.debug('清空所有类级推理Hook');
    }
  }

  /**
   * 清空类级行动Hook
   */
  static clearClassActingHooks(className?: string): void {
    if (className) {
      const classHooks = this.classActingHooks.get(className);
      if (classHooks) {
        classHooks.clear();
        logger.debug(`清空类级行动Hook: ${className}`);
      }
    } else {
      this.classActingHooks.clear();
      logger.debug('清空所有类级行动Hook');
    }
  }

  /**
   * 应用前置推理Hook
   */
  private async applyPreReasoningHooks(
    args: Record<string, any>
  ): Promise<Record<string, any> | null> {
    let currentArgs = deepClone(args);

    // 应用类级前置推理Hook
    const className = this.constructor.name;
    const classHooks = ReActAgentBase.classReasoningHooks.get(className);
    if (classHooks) {
      for (const [hookName, hook] of classHooks.entries()) {
        try {
          const result = await hook(this, currentArgs);
          if (result) {
            currentArgs = result;
          }
        } catch (error) {
          logger.error(`类级前置推理Hook执行失败: ${className}.${hookName}`, error);
        }
      }
    }

    // 应用实例级前置推理Hook
    for (const [hookName, hook] of this.instanceReasoningHooks.entries()) {
      try {
        const result = await hook(this, currentArgs);
        if (result) {
          currentArgs = result;
        }
      } catch (error) {
        logger.error(`实例级前置推理Hook执行失败: ${this.name}.${hookName}`, error);
      }
    }

    return currentArgs;
  }

  /**
   * 应用后置推理Hook
   */
  private async applyPostReasoningHooks(
    args: Record<string, any>,
    output: IMessage
  ): Promise<IMessage | null> {
    let currentOutput = output;

    // 应用类级后置推理Hook
    const className = this.constructor.name;
    const classHooks = ReActAgentBase.classReasoningHooks.get(className);
    if (classHooks) {
      for (const [hookName, hook] of classHooks.entries()) {
        try {
          const result = await hook(this, args, currentOutput);
          if (result) {
            currentOutput = result;
          }
        } catch (error) {
          logger.error(`类级后置推理Hook执行失败: ${className}.${hookName}`, error);
        }
      }
    }

    // 应用实例级后置推理Hook
    for (const [hookName, hook] of this.instanceReasoningHooks.entries()) {
      try {
        const result = await hook(this, args, currentOutput);
        if (result) {
          currentOutput = result;
        }
      } catch (error) {
        logger.error(`实例级后置推理Hook执行失败: ${this.name}.${hookName}`, error);
      }
    }

    return currentOutput;
  }

  /**
   * 应用前置行动Hook
   */
  private async applyPreActingHooks(
    args: Record<string, any>
  ): Promise<Record<string, any> | null> {
    let currentArgs = deepClone(args);

    // 应用类级前置行动Hook
    const className = this.constructor.name;
    const classHooks = ReActAgentBase.classActingHooks.get(className);
    if (classHooks) {
      for (const [hookName, hook] of classHooks.entries()) {
        try {
          const result = await hook(this, currentArgs);
          if (result) {
            currentArgs = result;
          }
        } catch (error) {
          logger.error(`类级前置行动Hook执行失败: ${className}.${hookName}`, error);
        }
      }
    }

    // 应用实例级前置行动Hook
    for (const [hookName, hook] of this.instanceActingHooks.entries()) {
      try {
        const result = await hook(this, currentArgs);
        if (result) {
          currentArgs = result;
        }
      } catch (error) {
        logger.error(`实例级前置行动Hook执行失败: ${this.name}.${hookName}`, error);
      }
    }

    return currentArgs;
  }

  /**
   * 应用后置行动Hook
   */
  private async applyPostActingHooks(
    args: Record<string, any>,
    output: IMessage | null
  ): Promise<IMessage | null | undefined> {
    let currentOutput = output;

    // 应用类级后置行动Hook
    const className = this.constructor.name;
    const classHooks = ReActAgentBase.classActingHooks.get(className);
    if (classHooks) {
      for (const [hookName, hook] of classHooks.entries()) {
        try {
          const result = await hook(this, args, currentOutput);
          if (result !== undefined) {
            currentOutput = result;
          }
        } catch (error) {
          logger.error(`类级后置行动Hook执行失败: ${className}.${hookName}`, error);
        }
      }
    }

    // 应用实例级后置行动Hook
    for (const [hookName, hook] of this.instanceActingHooks.entries()) {
      try {
        const result = await hook(this, args, currentOutput);
        if (result !== undefined) {
          currentOutput = result;
        }
      } catch (error) {
        logger.error(`实例级后置行动Hook执行失败: ${this.name}.${hookName}`, error);
      }
    }

    return currentOutput;
  }
}

