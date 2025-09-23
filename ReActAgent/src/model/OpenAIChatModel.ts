/**
 * OpenAI聊天模型实现
 * 支持OpenAI API的聊天模型调用
 */

import OpenAI from 'openai';
import { 
  IChatModel, 
  ChatModelConfig, 
  ModelResponse, 
  StreamChunk, 
  IMessage, 
  ToolSchema,
  ContentBlock,
  ToolUseBlock
} from '../types';
import { logger } from '../utils';
import { createTextBlock, createToolUseBlock } from '../message';

/**
 * OpenAI聊天模型配置
 */
export interface OpenAIChatModelConfig extends ChatModelConfig {
  model_name: string;
  api_key: string;
  base_url?: string;
  organization?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
  timeout?: number;
}

/**
 * OpenAI聊天模型实现
 */
export class OpenAIChatModel implements IChatModel {
  public config: OpenAIChatModelConfig;
  public stream: boolean;
  private client: OpenAI;

  constructor(config: OpenAIChatModelConfig) {
    this.config = {
      temperature: 0.7,
      max_tokens: 4096,
      stream: false,
      timeout: 30000, // 默认30秒超时
      ...config
    };
    
    this.stream = this.config.stream || false;

    // 初始化OpenAI客户端
    this.client = new OpenAI({
      apiKey: this.config.api_key,
      baseURL: this.config.base_url,
      organization: this.config.organization,
      timeout: this.config.timeout
    });

    logger.debug(`初始化OpenAI聊天模型: ${this.config.model_name}`);
  }

  /**
   * 调用模型生成响应
   */
  async call(
    messages: string | IMessage[], 
    tools?: ToolSchema[]
  ): Promise<ModelResponse | AsyncGenerator<StreamChunk>> {
    try {
      // 转换消息格式
      const openaiMessages = this.convertMessages(messages);
      
      // 构建请求参数
      const requestParams: OpenAI.Chat.ChatCompletionCreateParams = {
        model: this.config.model_name,
        messages: openaiMessages,
        temperature: this.config.temperature,
        max_tokens: this.config.max_tokens,
        top_p: this.config.top_p,
        frequency_penalty: this.config.frequency_penalty,
        presence_penalty: this.config.presence_penalty,
        stream: this.stream
      };

      // 如果有工具，添加工具定义
      if (tools && tools.length > 0) {
        requestParams.tools = tools.map(tool => ({
          type: 'function' as const,
          function: {
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters as any
          }
        }));
        requestParams.tool_choice = 'auto';
      }

      logger.debug(`调用OpenAI API: ${this.config.model_name}`, {
        messageCount: Array.isArray(messages) ? messages.length : 1,
        toolCount: tools?.length || 0,
        stream: this.stream
      });

      if (this.stream) {
        return this.handleStreamResponse(requestParams);
      } else {
        return this.handleNormalResponse(requestParams);
      }

    } catch (error: any) {
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        logger.error(`OpenAI API调用超时 (${this.config.timeout}ms):`, {
          model: this.config.model_name,
          baseUrl: this.config.base_url,
          error: error.message
        });
        throw new Error(`API调用超时，请检查网络连接或增加超时时间`);
      } else if (error.status === 401) {
        logger.error('OpenAI API认证失败:', {
          model: this.config.model_name,
          baseUrl: this.config.base_url
        });
        throw new Error('API密钥无效，请检查OPENAI_API_KEY或DEEPSEEK_API_KEY');
      } else {
        logger.error('OpenAI API调用失败:', {
          model: this.config.model_name,
          baseUrl: this.config.base_url,
          error: error.message || error
        });
        throw error;
      }
    }
  }

  /**
   * 处理普通响应
   */
  private async handleNormalResponse(
    params: OpenAI.Chat.ChatCompletionCreateParams
  ): Promise<ModelResponse> {
    const response = await this.client.chat.completions.create(params) as OpenAI.Chat.ChatCompletion;
    const choice = response.choices[0];
    
    if (!choice) {
      throw new Error('OpenAI API返回空响应');
    }

    const content: ContentBlock[] = [];

    // 处理文本内容
    if (choice.message.content) {
      content.push(createTextBlock(choice.message.content));
    }

    // 处理工具调用
    if (choice.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.type === 'function') {
          const args = JSON.parse(toolCall.function.arguments || '{}');
          content.push(createToolUseBlock(
            toolCall.function.name,
            args,
            toolCall.id
          ));
        }
      }
    }

    return {
      content,
      usage: response.usage ? {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens
      } : undefined
    };
  }

  /**
   * 处理流式响应
   */
  private async *handleStreamResponse(
    params: OpenAI.Chat.ChatCompletionCreateParams
  ): AsyncGenerator<StreamChunk> {
    const stream = await this.client.chat.completions.create({
      ...params,
      stream: true
    });

    let textContent = '';
    let toolCalls: ToolUseBlock[] = [];

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      const delta = choice.delta;
      let content: ContentBlock[] = [];
      let isLast = false;

      // 处理文本内容
      if (delta.content) {
        textContent += delta.content;
        content.push(createTextBlock(textContent));
      }

      // 处理工具调用
      if (delta.tool_calls) {
        for (const toolCallDelta of delta.tool_calls) {
          const index = toolCallDelta.index || 0;
          
          if (!toolCalls[index]) {
            toolCalls[index] = createToolUseBlock('', {}, toolCallDelta.id || '');
          }

          const toolCall = toolCalls[index];
          
          if (toolCallDelta.function?.name) {
            toolCall.name = toolCallDelta.function.name;
          }
          
          if (toolCallDelta.function?.arguments) {
            if (!toolCall.input.__arguments) {
              toolCall.input.__arguments = '';
            }
            toolCall.input.__arguments += toolCallDelta.function.arguments;
          }
        }
        
        // 尝试解析完整的工具调用
        for (const toolCall of toolCalls) {
          if (toolCall.input.__arguments) {
            try {
              const args = JSON.parse(toolCall.input.__arguments);
              toolCall.input = args;
              delete toolCall.input.__arguments;
            } catch {
              // 参数还不完整，继续等待
            }
          }
        }

        content.push(...toolCalls);
      }

      // 检查是否结束
      if (choice.finish_reason) {
        isLast = true;
      }

      yield {
        content,
        is_last: isLast
      };

      if (isLast) break;
    }
  }

  /**
   * 转换消息格式为OpenAI格式
   */
  private convertMessages(messages: string | IMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    if (typeof messages === 'string') {
      return [{ role: 'user', content: messages }];
    }

    const result: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    const pendingToolCalls = new Map<string, any>(); // Track tool calls waiting for responses

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        // 简单文本消息
        result.push({
          role: msg.role as any,
          content: msg.content,
          name: msg.name !== msg.role ? msg.name : undefined
        });
      } else if (Array.isArray(msg.content)) {
        // 复杂内容块消息
        const textBlocks = msg.content.filter(block => block.type === 'text');
        const toolUseBlocks = msg.content.filter(block => block.type === 'tool_use') as ToolUseBlock[];
        const toolResultBlocks = msg.content.filter(block => block.type === 'tool_result');

        // 处理文本内容
        if (textBlocks.length > 0) {
          const textContent = textBlocks.map(block => (block as any).text).join('\n');
          result.push({
            role: msg.role as any,
            content: textContent,
            name: msg.name !== msg.role ? msg.name : undefined
          });
        }

        // 处理工具调用（仅当角色为 assistant 时）
        if (toolUseBlocks.length > 0 && msg.role === 'assistant') {
          const toolCalls = toolUseBlocks.map(block => ({
            id: block.id,
            type: 'function' as const,
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input)
            }
          }));

          // 记录待处理的工具调用
          toolCalls.forEach(call => {
            pendingToolCalls.set(call.id, call);
          });

          result.push({
            role: 'assistant',
            content: null,
            tool_calls: toolCalls
          });
        }

        // 处理工具结果（仅当有对应的工具调用时）
        if (toolResultBlocks.length > 0) {
          for (const block of toolResultBlocks) {
            const toolCallId = (block as any).id;
            
            // 只有当存在对应的工具调用时才添加工具结果
            if (pendingToolCalls.has(toolCallId)) {
              result.push({
                role: 'tool',
                content: typeof (block as any).output === 'string' 
                  ? (block as any).output 
                  : JSON.stringify((block as any).output),
                tool_call_id: toolCallId
              });
              
              // 移除已处理的工具调用
              pendingToolCalls.delete(toolCallId);
            }
          }
        }
      }
    }

    // 如果还有未配对的工具调用，只移除未配对的工具调用以避免API错误
    if (pendingToolCalls.size > 0) {
      // 从后往前查找包含未配对工具调用的助手消息
      for (let i = result.length - 1; i >= 0; i--) {
        const msg = result[i];
        if (msg.role === 'assistant' && 'tool_calls' in msg && msg.tool_calls) {
          const unpairedCallIds = new Set<string>();
          
          // 找出所有未配对的工具调用
          msg.tool_calls.forEach(call => {
            if (pendingToolCalls.has(call.id)) {
              unpairedCallIds.add(call.id);
            }
          });
          
          if (unpairedCallIds.size > 0) {
            logger.warn(`移除 ${unpairedCallIds.size} 个未配对的工具调用以避免API错误`);
            
            // 只移除未配对的工具调用，保留配对的工具调用
            msg.tool_calls = msg.tool_calls.filter(call => !unpairedCallIds.has(call.id));
            
            // 如果没有工具调用了，移除tool_calls属性
            if (msg.tool_calls.length === 0) {
              delete msg.tool_calls;
            }
            
            // 检查助手消息是否既没有content也没有tool_calls，如果是则完全移除这条消息
            if ((!msg.content || msg.content === '') && !msg.tool_calls) {
              logger.warn('移除无效的助手消息：既没有content也没有tool_calls');
              result.splice(i, 1);
            }
            
            break;
          }
        }
      }
    }

    return result;
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<OpenAIChatModelConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.stream = this.config.stream || false;
    
    // 重新初始化客户端（如果API相关配置发生变化）
    if (newConfig.api_key || newConfig.base_url || newConfig.organization) {
      this.client = new OpenAI({
        apiKey: this.config.api_key,
        baseURL: this.config.base_url,
        organization: this.config.organization,
        timeout: this.config.timeout
      });
    }

    logger.debug('更新OpenAI聊天模型配置');
  }

  /**
   * 获取模型信息
   */
  getModelInfo(): { name: string; provider: string; config: OpenAIChatModelConfig } {
    return {
      name: this.config.model_name,
      provider: 'OpenAI',
      config: { ...this.config }
    };
  }
}

