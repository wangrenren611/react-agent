/**
 * ReAct Agent核心实现
 * 实现完整的ReAct (Reasoning and Acting) 算法，支持工具调用、实时控制、结构化输出等功能
 */

import { ReActAgentBase } from './ReActAgentBase';
import { 
  IMessage, 
  IChatModel, 
  IFormatter, 
  IToolkit, 
  IMemory, 
  ILongTermMemory,
  ToolUseBlock,
  ToolResultBlock,
  StructuredModel,
  AgentConfig,
  ContentBlock
} from '../types';
import { 
  Message, 
  MessageFactory, 
  createTextBlock, 
  createToolUseBlock, 
  createToolResultBlock 
} from '../message';
import { InMemoryMemory } from '../memory';
import { Toolkit, ToolResponse } from '../tool';
import { generateShortUuid, logger, ensureArray } from '../utils';

/**
 * 完成函数的前置打印Hook
 * 检查是否调用了完成函数，如果是，将响应参数包装成文本消息显示
 */
function finishFunctionPrePrintHook(
  agent: ReActAgent,
  kwargs: Record<string, any>
): Record<string, any> | null {
  const { msg } = kwargs;

  if (!msg || typeof msg.content === 'string') {
    return null;
  }

  if (Array.isArray(msg.content)) {
    for (let i = 0; i < msg.content.length; i++) {
      const block = msg.content[i];
      if (
        block.type === 'tool_use' &&
        block.name === agent.finishFunctionName
      ) {
        try {
          // 将响应参数转换为文本块显示
          msg.content[i] = createTextBlock(
            block.input?.response || ''
          );
          return kwargs;
        } catch (error) {
          logger.error('处理完成函数输入时出错:', block.input);
        }
      }
    }
  }

  return null;
}

/**
 * ReAct Agent主要实现类
 * 支持实时控制、API工具调用、Hook系统、结构化输出等功能
 */
export class ReActAgent extends ReActAgentBase {
  // 完成函数名称，用于结束回复并返回响应
  public finishFunctionName: string = 'generate_response';

  // 核心组件
  private sysPrompt: string;
  private maxIters: number;
  private model: IChatModel;
  private formatter: IFormatter;
  private toolkit: IToolkit;
  private memory: IMemory;
  private longTermMemory?: ILongTermMemory;

  // 配置选项
  private longTermMemoryMode: 'agent_control' | 'static_control' | 'both';
  private enableMetaTool: boolean;
  private parallelToolCalls: boolean;
  private staticControl: boolean;
  private agentControl: boolean;

  // 状态变量
  private requiredStructuredModel?: StructuredModel;

  constructor(config: AgentConfig) {
    super(config.name);

    // 验证配置
    if (!['agent_control', 'static_control', 'both'].includes(config.long_term_memory_mode || 'both')) {
      throw new Error('无效的长期内存模式');
    }

    // 初始化基础配置
    this.sysPrompt = config.sys_prompt;
    this.maxIters = config.max_iters || 10;
    this.model = config.model;
    this.formatter = config.formatter;
    
    // 初始化内存
    this.memory = config.memory || new InMemoryMemory();
    this.longTermMemory = config.long_term_memory;
    
    // 长期内存模式配置
    this.longTermMemoryMode = config.long_term_memory_mode || 'both';
    
    // 设置控制模式
    this.staticControl = !!(this.longTermMemory && ['static_control', 'both'].includes(this.longTermMemoryMode));
    this.agentControl = !!(this.longTermMemory && ['agent_control', 'both'].includes(this.longTermMemoryMode));
    
    // 其他配置
    this.enableMetaTool = config.enable_meta_tool || false;
    this.parallelToolCalls = config.parallel_tool_calls || false;

    // 初始化工具包
    this.toolkit = config.toolkit || new Toolkit();
    this.setupToolkit();

    logger.debug(`初始化ReActAgent: ${this.name}`, {
      maxIters: this.maxIters,
      longTermMemoryMode: this.longTermMemoryMode,
      enableMetaTool: this.enableMetaTool,
      parallelToolCalls: this.parallelToolCalls
    });

    // 注册完成函数的打印Hook
    this.registerInstanceHook(
      'pre_print',
      'finish_function_pre_print_hook',
      finishFunctionPrePrintHook
    );
  }

  /**
   * 系统提示词属性（动态）
   */
  get systemPrompt(): string {
    return this.sysPrompt;
  }

  /**
   * 主要回复方法
   * 实现完整的ReAct循环：推理->行动->观察->推理...
   */
  async reply(
    msg?: IMessage | IMessage[] | null, 
    structuredModel?: StructuredModel
  ): Promise<IMessage> {
    // 添加输入消息到内存
    await this.memory.add(msg || null);

    // 长期内存检索（静态控制模式）
    if (this.staticControl) {
      const retrievedInfo = await this.longTermMemory!.retrieve(msg || null);
      if (retrievedInfo) {
        const longTermMemoryMsg = MessageFactory.createUserMessage(
          `<long_term_memory>以下内容来自长期内存，可能有用：\n${retrievedInfo}</long_term_memory>`,
          'long_term_memory'
        );
        await this.memory.add(longTermMemoryMsg);
      }
    }

    // 设置结构化输出模型
    this.requiredStructuredModel = structuredModel;
    if (structuredModel) {
      this.toolkit.setExtendedModel(this.finishFunctionName, structuredModel);
    }

    // 开始推理-行动循环
    let replyMsg: IMessage | null = null;
    
    for (let iteration = 0; iteration < this.maxIters; iteration++) {
      logger.debug(`ReAct循环第 ${iteration + 1} 轮`);

      // 推理阶段
      const reasoningMsg = await this.reasoningWithHooks();

      // 获取所有工具调用
      const toolCalls = reasoningMsg.getContentBlocks<ToolUseBlock>('tool_use');
      
      if (toolCalls.length === 0) {
        logger.debug('没有工具调用，结束循环');
        break;
      }

      // 行动阶段 - 执行工具调用
      const actingPromises = toolCalls.map(toolCall => this.actingWithHooks(toolCall));

      let actingResponses: (IMessage | null)[];
      if (this.parallelToolCalls) {
        // 并行执行工具调用
        actingResponses = await Promise.all(actingPromises);
      } else {
        // 顺序执行工具调用
        actingResponses = [];
        for (const promise of actingPromises) {
          actingResponses.push(await promise);
        }
      }

      // 查找第一个非空的回复消息
      for (const actingMsg of actingResponses) {
        if (actingMsg) {
          replyMsg = actingMsg;
          break;
        }
      }

      if (replyMsg) {
        logger.debug('获得最终回复，结束循环');
        break;
      }
    }

    // 如果达到最大迭代次数仍无回复，生成总结
    if (!replyMsg) {
      replyMsg = await this.summarizing();
    }

    // 长期内存记录（静态控制模式）
    if (this.staticControl) {
      const allMessages = [
        ...(msg ? ensureArray(msg) : []),
        ...(await this.memory.getMemory()),
        replyMsg
      ];
      await this.longTermMemory!.record(allMessages);
    }

    // 添加回复消息到内存
    await this.memory.add(replyMsg);
    
    return replyMsg;
  }

  /**
   * 推理过程实现
   * 使用模型生成推理结果和工具调用
   */
  async reasoning(): Promise<IMessage> {
    // 准备消息
    const messages = [
      MessageFactory.createSystemMessage(this.systemPrompt),
      ...(await this.memory.getMemory())
    ];

    // 格式化消息
    const formattedMessages = await this.formatter.format(messages);
    
    // 调用模型
    const response = await this.model.call(
      formattedMessages,
      this.toolkit.getJsonSchemas()
    );

    let msg: IMessage;

    // 处理模型响应
    if (this.isAsyncGenerator(response)) {
      // 流式响应处理
      msg = new Message(this.name, [], 'assistant');
      let accumulatedContent: ContentBlock[] = [];
      
      for await (const chunk of response) {
        // 累积内容块
        if (Array.isArray(chunk.content)) {
          accumulatedContent = [...accumulatedContent, ...chunk.content];
        } else {
          accumulatedContent.push(chunk.content as ContentBlock);
        }
        
        msg.setContent(accumulatedContent);
        await this.print(msg, false);
      }
      await this.print(msg, true);
    } else {
      // 普通响应处理
      msg = new Message(this.name, response.content, 'assistant');
      await this.print(msg, true);
    }

    // 如果没有工具调用，转换为完成函数调用
    if (!msg.hasContentBlocks('tool_use')) {
      const textContent = msg.getTextContent();
      msg.setContent([
        createToolUseBlock(
          this.finishFunctionName,
          { response: textContent },
          generateShortUuid()
        )
      ]);
    }

    // 添加到内存
    await this.memory.add(msg);
    
    return msg;
  }

  /**
   * 行动过程实现
   * 执行具体的工具调用
   */
  async acting(toolCall: ToolUseBlock): Promise<IMessage | null> {
    // 创建工具结果消息
    const toolResultMsg = MessageFactory.createToolResultMessage([
      createToolResultBlock(toolCall.id, toolCall.name, [])
    ]);

    let responseMsg: IMessage | null = null;

    try {
      // 执行工具调用
      const toolResponseGenerator = await this.toolkit.callToolFunction(toolCall);
      
      // 处理工具响应
      for await (const chunk of toolResponseGenerator) {
        // 更新工具结果 - 将内容块数组转换为文本
        const textContent = Array.isArray(chunk.content) 
          ? chunk.content.map(block => (block as any).text || JSON.stringify(block)).join('\n')
          : String(chunk.content);
        (toolResultMsg.content[0] as ToolResultBlock).output = textContent;

        // 跳过完成函数的打印（除非失败）
        if (
          toolCall.name !== this.finishFunctionName ||
          !chunk.metadata.success
        ) {
          await this.print(toolResultMsg, chunk.is_last);
        }

        // 如果是成功的完成函数调用，返回响应消息
        if (
          toolCall.name === this.finishFunctionName &&
          chunk.metadata.success
        ) {
          responseMsg = chunk.metadata.response_msg;
        }
      }

    } catch (error) {
      logger.error(`工具调用失败: ${toolCall.name}`, error);
      (toolResultMsg.content[0] as ToolResultBlock).output = `工具调用失败: ${error}`;
      await this.print(toolResultMsg, true);
    } finally {
      // 记录工具结果消息到内存
      await this.memory.add(toolResultMsg);
    }

    return responseMsg;
  }

  /**
   * 观察消息
   */
  async observe(msg: IMessage | IMessage[] | null): Promise<void> {
    await this.memory.add(msg);
  }

  /**
   * 总结方法
   * 当达到最大迭代次数时生成总结回复
   */
  private async summarizing(): Promise<IMessage> {
    const hintMsg = MessageFactory.createUserMessage(
      '您未能在最大迭代次数内生成回复。现在请直接回复，总结当前情况。'
    );

    // 准备消息
    const messages = [
      MessageFactory.createSystemMessage(this.systemPrompt),
      ...(await this.memory.getMemory()),
      hintMsg
    ];

    // 格式化并调用模型
    const formattedMessages = await this.formatter.format(messages);
    const response = await this.model.call(formattedMessages);

    let responseMsg: IMessage;

    if (this.isAsyncGenerator(response)) {
      responseMsg = new Message(this.name, [], 'assistant');
      for await (const chunk of response) {
        responseMsg.setContent(chunk.content);
        await this.print(responseMsg, false);
      }
      await this.print(responseMsg, true);
    } else {
      responseMsg = new Message(this.name, response.content, 'assistant');
      await this.print(responseMsg, true);
    }

    return responseMsg;
  }

  /**
   * 生成响应的工具函数
   * 这是Agent用来完成回复的特殊工具函数
   */
  private async *generateResponse(
    response: string,
    ...kwargs: any[]
  ): AsyncGenerator<ToolResponse> {
    const responseMsg = new Message(this.name, response, 'assistant');

    // 处理结构化输出
    if (this.requiredStructuredModel) {
      try {
        // 验证结构化输出
        const structuredData = this.requiredStructuredModel.parse(kwargs[0] || {});
        responseMsg.metadata = structuredData;
      } catch (error) {
        yield new ToolResponse(
          `参数验证错误: ${error}`,
          { success: false, response_msg: null },
          true
        );
        return;
      }
    }

    yield new ToolResponse(
      '成功生成回复。',
      { success: true, response_msg: responseMsg },
      true
    );
  }

  /**
   * 创建重置工具的包装函数
   */
  private async *createResetToolsWrapper(toolNames: string[]): AsyncGenerator<ToolResponse> {
    try {
      this.toolkit.resetEquippedTools(toolNames);
      yield new ToolResponse(
        `成功重置工具列表，当前装备工具: ${toolNames.join(', ')}`,
        { success: true, toolNames },
        true
      );
    } catch (error) {
      yield new ToolResponse(
        `重置工具列表失败: ${error}`,
        { success: false, error: String(error) },
        true
      );
    }
  }

  /**
   * 设置工具包
   */
  private setupToolkit(): void {
    // 注册完成函数
    this.toolkit.registerToolWithMetadata(
      this.generateResponse.bind(this),
      this.finishFunctionName,
      '生成回复。注意：只有response参数对其他人可见，您应该在response参数中包含所有必要信息。',
      {
        type: 'object',
        properties: {
          response: {
            type: 'string',
            description: '您对用户的回复'
          }
        },
        required: ['response']
      }
    );

    // 如果启用了代理控制的长期内存，添加相关工具函数
    if (this.agentControl && this.longTermMemory) {
      this.toolkit.registerToolFunction(
        this.longTermMemory.recordToMemory.bind(this.longTermMemory),
        'record_to_memory'
      );
      this.toolkit.registerToolFunction(
        this.longTermMemory.retrieveFromMemory.bind(this.longTermMemory),
        'retrieve_from_memory'
      );
    }

    // 如果启用了元工具，添加工具管理功能
    if (this.enableMetaTool) {
      this.toolkit.registerToolWithMetadata(
        this.createResetToolsWrapper.bind(this),
        'reset_equipped_tools',
        '重置装备的工具列表',
        {
          type: 'object',
          properties: {
            toolNames: {
              type: 'array',
              items: { type: 'string' },
              description: '要装备的工具名称列表'
            }
          },
          required: ['toolNames']
        }
      );
    }
  }

  /**
   * 处理中断
   */
  async handleInterrupt(_msg?: IMessage | IMessage[] | null): Promise<IMessage> {
    const responseMsg = new Message(
      this.name,
      '我注意到您打断了我。有什么我可以为您做的吗？',
      'assistant'
    );

    await this.print(responseMsg, true);
    await this.memory.add(responseMsg);
    
    return responseMsg;
  }

  /**
   * 检查是否为异步生成器
   */
  private isAsyncGenerator(obj: any): obj is AsyncGenerator<any> {
    return obj && typeof obj[Symbol.asyncIterator] === 'function';
  }

  /**
   * 更新系统提示词
   */
  updateSystemPrompt(newPrompt: string): void {
    this.sysPrompt = newPrompt;
    logger.debug(`更新系统提示词: ${this.name}`);
  }

  /**
   * 获取Agent配置信息
   */
  getConfig(): Partial<AgentConfig> {
    return {
      name: this.name,
      sys_prompt: this.sysPrompt,
      max_iters: this.maxIters,
      long_term_memory_mode: this.longTermMemoryMode,
      enable_meta_tool: this.enableMetaTool,
      parallel_tool_calls: this.parallelToolCalls
    };
  }

  /**
   * 获取内存统计信息
   */
  async getMemoryStats(): Promise<{
    shortTermSize: number;
    longTermStats?: { keywords: number; totalEntries: number };
  }> {
    const shortTermMemory = await this.memory.getMemory();
    const result: any = { shortTermSize: shortTermMemory.length };
    
    if (this.longTermMemory && 'getStats' in this.longTermMemory) {
      result.longTermStats = (this.longTermMemory as any).getStats();
    }
    
    return result;
  }

  /**
   * 清空内存
   */
  async clearMemory(includeLongTerm: boolean = false): Promise<void> {
    await this.memory.clear();
    
    if (includeLongTerm && this.longTermMemory && 'clear' in this.longTermMemory) {
      await (this.longTermMemory as any).clear();
    }
    
    logger.debug(`清空内存: ${this.name} (包含长期内存: ${includeLongTerm})`);
  }
}
