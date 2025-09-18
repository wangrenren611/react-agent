/**
 * 工具函数集合
 * 提供系统中使用的各种辅助函数
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * 生成短UUID
 */
export function generateShortUuid(): string {
  return uuidv4().split('-')[0];
}

/**
 * 生成完整UUID
 */
export function generateUuid(): string {
  return uuidv4();
}

/**
 * 深拷贝对象
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }
  
  if (obj instanceof Array) {
    return obj.map(item => deepClone(item)) as T;
  }
  
  if (typeof obj === 'object') {
    const cloned = {} as T;
    Object.keys(obj).forEach(key => {
      (cloned as any)[key] = deepClone((obj as any)[key]);
    });
    return cloned;
  }
  
  return obj;
}

/**
 * 延迟函数
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 安全的JSON解析
 */
export function safeJsonParse(str: string, defaultValue: any = null): any {
  try {
    return JSON.parse(str);
  } catch {
    return defaultValue;
  }
}

/**
 * 安全的JSON字符串化
 */
export function safeJsonStringify(obj: any, defaultValue: string = ''): string {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return defaultValue;
  }
}

/**
 * 检查对象是否为空
 */
export function isEmpty(obj: any): boolean {
  if (obj == null) return true;
  if (Array.isArray(obj)) return obj.length === 0;
  if (typeof obj === 'object') return Object.keys(obj).length === 0;
  if (typeof obj === 'string') return obj.trim().length === 0;
  return false;
}

/**
 * 确保值是数组
 */
export function ensureArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * 异步迭代器转数组
 */
export async function asyncIteratorToArray<T>(iterator: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const item of iterator) {
    result.push(item);
  }
  return result;
}

/**
 * 错误处理装饰器
 */
export function errorHandler<T extends (...args: any[]) => any>(
  target: T,
  errorCallback?: (error: Error, ...args: Parameters<T>) => ReturnType<T>
): T {
  return ((...args: Parameters<T>) => {
    try {
      const result = target(...args);
      if (result instanceof Promise) {
        return result.catch(error => {
          if (errorCallback) {
            return errorCallback(error, ...args);
          }
          throw error;
        });
      }
      return result;
    } catch (error) {
      if (errorCallback) {
        return errorCallback(error as Error, ...args);
      }
      throw error;
    }
  }) as T;
}

/**
 * 创建可取消的Promise
 */
export interface CancellablePromise<T> extends Promise<T> {
  cancel(): void;
}

export function createCancellablePromise<T>(
  executor: (
    resolve: (value: T | PromiseLike<T>) => void,
    reject: (reason?: any) => void,
    isCancelled: () => boolean
  ) => void
): CancellablePromise<T> {
  let isCancelled = false;
  
  const promise = new Promise<T>((resolve, reject) => {
    executor(resolve, reject, () => isCancelled);
  }) as CancellablePromise<T>;
  
  promise.cancel = () => {
    isCancelled = true;
  };
  
  return promise;
}

/**
 * 日志记录器
 */
export class Logger {
  private prefix: string;
  
  constructor(prefix: string = 'ReActAgent') {
    this.prefix = prefix;
  }
  
  private formatMessage(level: string, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ' ' + args.map(arg => 
      typeof arg === 'object' ? safeJsonStringify(arg) : String(arg)
    ).join(' ') : '';
    return `[${timestamp}] [${this.prefix}] [${level}] ${message}${formattedArgs}`;
  }
  
  debug(message: string, ...args: any[]): void {
    console.debug(this.formatMessage('DEBUG', message, ...args));
  }
  
  info(message: string, ...args: any[]): void {
    console.info(this.formatMessage('INFO', message, ...args));
  }
  
  warn(message: string, ...args: any[]): void {
    console.warn(this.formatMessage('WARN', message, ...args));
  }
  
  error(message: string, ...args: any[]): void {
    console.error(this.formatMessage('ERROR', message, ...args));
  }
}

/**
 * 默认日志记录器实例
 */
export const logger = new Logger('ReActAgent');

