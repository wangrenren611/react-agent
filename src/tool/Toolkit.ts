/**
 * 工具包实现
 * 实现了工具管理和调用的核心功能
 */

import { 
  IToolkit, 
  ToolFunction, 
  ToolSchema, 
  ToolUseBlock,
  ToolParameterSchema,
  StructuredModel
} from '../types';
import { ToolResponse, createErrorResponse } from './ToolResponse';
import { logger } from '../utils';

/**
 * 工具函数元数据
 */
interface ToolFunctionMetadata {
  name: string;
  func: ToolFunction;
  description: string;
  parameters: ToolParameterSchema;
  extendedModel?: StructuredModel;
}

/**
 * 工具包类实现
 * 管理和调用工具函数
 */
export class Toolkit implements IToolkit {
  private tools: Map<string, ToolFunctionMetadata> = new Map();
  private equippedTools: Set<string> = new Set();

  constructor() {
    logger.debug('初始化工具包');
  }

  /**
   * 注册工具函数
   */
  registerToolFunction(func: ToolFunction, name?: string): void {
    // 从函数中提取元数据
    const functionName = name || func.name || 'unknown_tool';
    
    // 尝试从函数的注释或属性中获取描述和参数信息
    const metadata = this.extractFunctionMetadata(func, functionName);
    
    this.tools.set(functionName, metadata);
    this.equippedTools.add(functionName);
    
    logger.debug(`注册工具函数: ${functionName}`);
  }

  /**
   * 注册带完整元数据的工具函数
   */
  registerToolWithMetadata(
    func: ToolFunction,
    name: string,
    description: string,
    parameters: ToolParameterSchema
  ): void {
    const metadata: ToolFunctionMetadata = {
      name,
      func,
      description,
      parameters
    };

    this.tools.set(name, metadata);
    this.equippedTools.add(name);
    
    logger.debug(`注册工具函数（带元数据）: ${name}`);
  }

  /**
   * 获取工具JSON Schema
   */
  getJsonSchemas(): ToolSchema[] {
    const schemas: ToolSchema[] = [];

    for (const toolName of this.equippedTools) {
      const tool = this.tools.get(toolName);
      if (tool) {
        schemas.push({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
          }
        });
      }
    }

    return schemas;
  }

  /**
   * 调用工具函数
   */
  async callToolFunction(toolCall: ToolUseBlock): Promise<AsyncGenerator<ToolResponse>> {
    const { name, input } = toolCall;

    if (!this.equippedTools.has(name)) {
      return this.createErrorGenerator(`工具 '${name}' 未装备或不存在`);
    }

    const tool = this.tools.get(name);
    if (!tool) {
      return this.createErrorGenerator(`工具 '${name}' 未找到`);
    }

    try {
      logger.debug(`调用工具函数: ${name}`, input);
      
      // 验证输入参数
      const validatedInput = this.validateInput(input, tool.parameters);
      
      // 调用工具函数 - 将对象参数转换为位置参数
      const result = await this.callToolFunctionWithArgs(tool.func, validatedInput, tool.parameters);
      
      // 确保返回的是AsyncGenerator
      if (this.isAsyncGenerator(result)) {
        return result;
      } else {
        // 如果不是AsyncGenerator，包装成一个
        return this.wrapInAsyncGenerator(result as unknown as ToolResponse);
      }

    } catch (error) {
      logger.error(`工具函数 '${name}' 执行失败:`, error);
      return this.createErrorGenerator(`工具函数执行失败: ${error}`);
    }
  }

  /**
   * 重置装备的工具
   */
  resetEquippedTools(toolNames: string[]): void {
    // 验证所有工具名称都存在
    const invalidTools = toolNames.filter(name => !this.tools.has(name));
    if (invalidTools.length > 0) {
      throw new Error(`以下工具不存在: ${invalidTools.join(', ')}`);
    }

    this.equippedTools.clear();
    toolNames.forEach(name => this.equippedTools.add(name));
    
    logger.debug(`重置装备的工具: ${toolNames.join(', ')}`);
  }

  /**
   * 设置扩展模型（用于结构化输出）
   */
  setExtendedModel(toolName: string, model: StructuredModel): void {
    const tool = this.tools.get(toolName);
    if (tool) {
      tool.extendedModel = model;
      logger.debug(`为工具 '${toolName}' 设置扩展模型`);
    }
  }

  /**
   * 获取已装备的工具列表
   */
  getEquippedTools(): string[] {
    return Array.from(this.equippedTools);
  }

  /**
   * 获取所有工具列表
   */
  getAllTools(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 检查工具是否存在
   */
  hasToolFunction(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 移除工具函数
   */
  removeToolFunction(name: string): boolean {
    if (this.tools.has(name)) {
      this.tools.delete(name);
      this.equippedTools.delete(name);
      logger.debug(`移除工具函数: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * 清空所有工具
   */
  clear(): void {
    const toolCount = this.tools.size;
    this.tools.clear();
    this.equippedTools.clear();
    logger.debug(`清空所有工具，移除了 ${toolCount} 个工具`);
  }

  /**
   * 从函数中提取元数据
   */
  private extractFunctionMetadata(func: ToolFunction, name: string): ToolFunctionMetadata {
    // 尝试从函数的注释或属性中提取信息
    const description = (func as any).description || 
                       (func as any).__doc__ || 
                       `工具函数: ${name}`;

    // 基本的参数Schema
    const parameters: ToolParameterSchema = {
      type: 'object',
      properties: {},
      required: []
    };

    // 尝试从函数签名中提取参数信息（简化版本）
    const funcStr = func.toString();
    const paramMatch = funcStr.match(/\(([^)]*)\)/);
    if (paramMatch && paramMatch[1].trim()) {
      const params = paramMatch[1].split(',').map(p => p.trim().split(/\s+/)[0]);
      for (const param of params) {
        if (param && param !== '...args') {
          parameters.properties![param] = {
            type: 'string',
            description: `参数 ${param}`
          };
        }
      }
    }

    return {
      name,
      func,
      description,
      parameters
    };
  }

  /**
   * 验证输入参数
   */
  private validateInput(input: any, schema: ToolParameterSchema): any {
    // 简化的验证逻辑，实际应用中应该使用更完善的JSON Schema验证
    if (schema.required) {
      for (const required of schema.required) {
        if (!(required in input)) {
          throw new Error(`缺少必需参数: ${required}`);
        }
      }
    }
    
    return input;
  }

  /**
   * 检查是否为AsyncGenerator
   */
  private isAsyncGenerator(obj: any): obj is AsyncGenerator<ToolResponse> {
    return obj && 
           typeof obj === 'object' && 
           typeof obj[Symbol.asyncIterator] === 'function';
  }

  /**
   * 将单个ToolResponse包装成AsyncGenerator
   */
  private async *wrapInAsyncGenerator(response: ToolResponse): AsyncGenerator<ToolResponse> {
    yield response;
  }

  /**
   * 创建错误生成器
   */
  private async *createErrorGenerator(errorMessage: string): AsyncGenerator<ToolResponse> {
    yield createErrorResponse(errorMessage);
  }

  /**
   * 根据参数schema将对象参数转换为位置参数调用工具函数
   */
  private async callToolFunctionWithArgs(
    func: ToolFunction, 
    input: any, 
    parameters: ToolParameterSchema
  ): Promise<any> {
    // 获取参数顺序（根据schema的properties顺序）
    const paramNames = Object.keys(parameters.properties || {});
    
    // 构建位置参数数组
    const args: any[] = [];
    for (const paramName of paramNames) {
      if (paramName in input) {
        args.push(input[paramName]);
      } else if (parameters.required?.includes(paramName)) {
        // 如果缺少必需参数，抛出错误
        throw new Error(`缺少必需参数: ${paramName}`);
      } else {
        // 可选参数，如果没有提供则使用undefined（让函数使用默认值）
        args.push(undefined);
      }
    }

    // 调用函数并返回结果
    return await func(...args);
  }
}

