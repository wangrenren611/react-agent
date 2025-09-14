/**
 * 工具响应实现
 * 定义了工具调用的响应格式和相关功能
 */

import { ToolResponse as IToolResponse, ContentBlock } from '../types';
import { createTextBlock } from '../message';

/**
 * 工具响应类实现
 * 表示工具函数执行的结果
 */
export class ToolResponse implements IToolResponse {
  public content: ContentBlock[];
  public metadata: Record<string, any>;
  public is_last: boolean;

  constructor(
    content: ContentBlock[] | string,
    metadata: Record<string, any> = {},
    isLast: boolean = true
  ) {
    // 如果content是字符串，转换为TextBlock
    this.content = typeof content === 'string' 
      ? [createTextBlock(content)]
      : content;
    
    this.metadata = metadata;
    this.is_last = isLast;
  }

  /**
   * 获取文本内容
   */
  getTextContent(): string {
    return this.content
      .filter(block => block.type === 'text')
      .map(block => (block as any).text)
      .join('\n');
  }

  /**
   * 检查是否成功
   */
  isSuccess(): boolean {
    return this.metadata.success !== false;
  }

  /**
   * 获取错误信息
   */
  getError(): string | null {
    return this.metadata.error || null;
  }

  /**
   * 克隆响应
   */
  clone(): ToolResponse {
    return new ToolResponse(
      JSON.parse(JSON.stringify(this.content)),
      JSON.parse(JSON.stringify(this.metadata)),
      this.is_last
    );
  }

  /**
   * 转换为JSON
   */
  toJSON(): any {
    return {
      content: this.content,
      metadata: this.metadata,
      is_last: this.is_last
    };
  }

  /**
   * 从JSON创建响应
   */
  static fromJSON(json: any): ToolResponse {
    return new ToolResponse(
      json.content,
      json.metadata || {},
      json.is_last ?? true
    );
  }
}

/**
 * 工具响应构建器
 * 提供便捷的方法来创建不同类型的工具响应
 */
export class ToolResponseBuilder {
  private content: ContentBlock[] = [];
  private metadata: Record<string, any> = {};
  private isLast: boolean = true;

  /**
   * 添加文本内容
   */
  addText(text: string): this {
    this.content.push(createTextBlock(text));
    return this;
  }

  /**
   * 添加内容块
   */
  addContentBlock(block: ContentBlock): this {
    this.content.push(block);
    return this;
  }

  /**
   * 设置元数据
   */
  setMetadata(key: string, value: any): this {
    this.metadata[key] = value;
    return this;
  }

  /**
   * 批量设置元数据
   */
  setMetadataBatch(metadata: Record<string, any>): this {
    Object.assign(this.metadata, metadata);
    return this;
  }

  /**
   * 设置是否为最后一个响应
   */
  setIsLast(isLast: boolean): this {
    this.isLast = isLast;
    return this;
  }

  /**
   * 标记为成功
   */
  success(): this {
    this.metadata.success = true;
    return this;
  }

  /**
   * 标记为失败
   */
  failure(error?: string): this {
    this.metadata.success = false;
    if (error) {
      this.metadata.error = error;
    }
    return this;
  }

  /**
   * 构建响应
   */
  build(): ToolResponse {
    return new ToolResponse(this.content, this.metadata, this.isLast);
  }

  /**
   * 重置构建器
   */
  reset(): this {
    this.content = [];
    this.metadata = {};
    this.isLast = true;
    return this;
  }
}

/**
 * 创建成功响应的快捷方法
 */
export function createSuccessResponse(
  content: string | ContentBlock[],
  metadata: Record<string, any> = {}
): ToolResponse {
  return new ToolResponse(
    content,
    { ...metadata, success: true },
    true
  );
}

/**
 * 创建错误响应的快捷方法
 */
export function createErrorResponse(
  error: string,
  metadata: Record<string, any> = {}
): ToolResponse {
  return new ToolResponse(
    `错误: ${error}`,
    { ...metadata, success: false, error },
    true
  );
}

/**
 * 创建流式响应生成器
 */
export async function* createStreamResponse(
  chunks: string[],
  metadata: Record<string, any> = {}
): AsyncGenerator<ToolResponse> {
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    yield new ToolResponse(
      chunks[i],
      { ...metadata, success: true },
      isLast
    );
  }
}
