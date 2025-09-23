/**
 * ReActAgent工厂函数
 * 提供便捷的方式创建和配置ReActAgent实例
 */

import { ReActAgent } from '../agent';
import { OpenAIChatModel } from '../model';
import { OpenAIChatFormatter } from '../formatter';
import { InMemoryMemory, SimpleLongTermMemory } from '../memory';
import { Toolkit } from '../tool';
import { 
  executeShellCommand, 
  executePythonCode, 
  viewTextFile, 
  writeTextFile,
  listDirectory,
  getSystemInfo
} from '../tool/builtin';
import { AgentConfig } from '../types';
import { logger } from '../utils';

/**
 * 快速创建配置选项
 */
export interface QuickCreateOptions {
  // 基础配置
  name: string;
  systemPrompt: string;
  
  // OpenAI配置
  openaiApiKey: string;
  modelName?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  
  // Agent配置
  maxIters?: number;
  parallelToolCalls?: boolean;
  enableMetaTool?: boolean;
  
  // 内存配置
  enableLongTermMemory?: boolean;
  longTermMemoryMode?: 'agent_control' | 'static_control' | 'both';
  
  // 工具配置
  enableBuiltinTools?: boolean;
  customTools?: Array<{
    func: any;
    name?: string;
    description?: string;
    parameters?: any;
  }>;
}

/**
 * 快速创建ReActAgent实例
 */
export function createReActAgent(options: QuickCreateOptions): ReActAgent {
  logger.info(`创建ReActAgent实例: ${options.name}`);

  // 创建模型
  const model = new OpenAIChatModel({
    model_name: options.modelName || 'deepseek-chat',
    api_key: options.openaiApiKey,
    base_url: options.baseUrl || 'https://api.deepseek.com',
    temperature: options.temperature || 0.7,
    max_tokens: options.maxTokens || 4096,
    stream: options.stream || false,
    timeout: 30000 // 30秒超时
  });

  // 创建格式化器
  const formatter = new OpenAIChatFormatter();

  // 创建内存
  const memory = new InMemoryMemory();
  const longTermMemory = options.enableLongTermMemory 
    ? new SimpleLongTermMemory() 
    : undefined;

  // 创建工具包
  const toolkit = new Toolkit();

  // 添加内置工具
  if (options.enableBuiltinTools !== false) {
    toolkit.registerToolWithMetadata(
      executeShellCommand,
      'execute_shell_command',
      '执行Shell命令并返回结果',
      {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的Shell命令' },
          workingDir: { type: 'string', description: '工作目录，默认为当前目录' },
          timeout: { type: 'number', description: '超时时间（毫秒），默认30000' }
        },
        required: ['command']
      }
    );

    toolkit.registerToolWithMetadata(
      executePythonCode,
      'execute_python_code',
      '执行Python代码并返回结果',
      {
        type: 'object',
        properties: {
          code: { type: 'string', description: '要执行的Python代码' },
          workingDir: { type: 'string', description: '工作目录，默认为当前目录' },
          timeout: { type: 'number', description: '超时时间（毫秒），默认30000' }
        },
        required: ['code']
      }
    );

    toolkit.registerToolWithMetadata(
      viewTextFile,
      'view_text_file',
      '查看文本文件的内容',
      {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: '文件路径' },
          encoding: { type: 'string', description: '文件编码，默认utf8' },
          maxLines: { type: 'number', description: '最大读取行数，默认1000' }
        },
        required: ['filePath']
      }
    );

    toolkit.registerToolWithMetadata(
      writeTextFile,
      'write_text_file',
      '写入内容到文本文件',
      {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '要写入的内容' },
          encoding: { type: 'string', description: '文件编码，默认utf8' },
          createDirs: { type: 'boolean', description: '是否创建目录，默认true' }
        },
        required: ['filePath', 'content']
      }
    );

    toolkit.registerToolWithMetadata(
      listDirectory,
      'list_directory',
      '列出目录中的文件和子目录',
      {
        type: 'object',
        properties: {
          dirPath: { type: 'string', description: '目录路径，默认为当前目录' },
          showHidden: { type: 'boolean', description: '是否显示隐藏文件，默认false' },
          recursive: { type: 'boolean', description: '是否递归列出，默认false' }
        }
      }
    );

    toolkit.registerToolWithMetadata(
      getSystemInfo,
      'get_system_info',
      '获取当前系统的基本信息',
      {
        type: 'object',
        properties: {}
      }
    );
  }

  // 添加自定义工具
  if (options.customTools) {
    for (const tool of options.customTools) {
      if (tool.description && tool.parameters) {
        toolkit.registerToolWithMetadata(
          tool.func,
          tool.name || tool.func.name,
          tool.description,
          tool.parameters
        );
      } else {
        toolkit.registerToolFunction(tool.func, tool.name);
      }
    }
  }

  // 创建Agent配置
  const config: AgentConfig = {
    name: options.name,
    sys_prompt: options.systemPrompt,
    model,
    formatter,
    toolkit,
    memory,
    long_term_memory: longTermMemory,
    long_term_memory_mode: options.longTermMemoryMode || 'both',
    enable_meta_tool: options.enableMetaTool || false,
    parallel_tool_calls: options.parallelToolCalls || false,
    max_iters: options.maxIters || 10
  };

  // 创建Agent实例
  const agent = new ReActAgent(config);

  logger.info(`ReActAgent实例创建完成: ${options.name}`);
  return agent;
}

/**
 * 创建用于代码助手的ReActAgent
 */
export function createCodeAssistantAgent(
  name: string,
  openaiApiKey: string,
  options?: Partial<QuickCreateOptions>
): ReActAgent {
  const systemPrompt = `你是一个专业的代码助手，名为${name}。你具备以下能力：

1. 代码分析和理解
2. 代码编写和修改
3. 代码调试和问题解决
4. 技术文档编写
5. 系统操作和文件管理

你可以使用以下工具：
- execute_shell_command: 执行Shell命令
- execute_python_code: 执行Python代码
- view_text_file: 查看文件内容
- write_text_file: 写入文件内容
- list_directory: 列出目录内容
- get_system_info: 获取系统信息

请始终：
- 提供清晰、准确的解释
- 在执行操作前说明你的计划
- 确保代码的安全性和正确性
- 主动提供有用的建议和最佳实践

用中文回复用户。`;

  return createReActAgent({
    name,
    systemPrompt,
    openaiApiKey,
    modelName: 'deepseek-chat',
    temperature: 0.3,
    enableBuiltinTools: true,
    enableLongTermMemory: true,
    maxIters: 15,
    ...options
  });
}

/**
 * 创建用于通用助手的ReActAgent
 */
export function createGeneralAssistantAgent(
  name: string,
  openaiApiKey: string,
  options?: Partial<QuickCreateOptions>
): ReActAgent {
  const systemPrompt = `你是一个智能助手，名为${name}。你可以帮助用户解决各种问题，包括：

1. 回答问题和提供信息
2. 协助完成任务
3. 提供建议和指导
4. 进行分析和推理
5. 创作和编辑内容

你的特点：
- 友好、耐心、专业
- 思维清晰、逻辑严谨
- 善于沟通、表达清楚
- 积极主动、乐于助人

请用中文与用户交流，提供准确、有用的帮助。`;

  return createReActAgent({
    name,
    systemPrompt,
    openaiApiKey,
    modelName: 'deepseek-chat',
    temperature: 0.7,
    enableBuiltinTools: false,
    enableLongTermMemory: false,
    maxIters: 8,
    ...options
  });
}

/**
 * 创建用于研究助手的ReActAgent
 */
export function createResearchAssistantAgent(
  name: string,
  openaiApiKey: string,
  options?: Partial<QuickCreateOptions>
): ReActAgent {
  const systemPrompt = `你是一个专业的研究助手，名为${name}。你擅长：

1. 信息收集和整理
2. 数据分析和处理
3. 文献调研和总结
4. 实验设计和执行
5. 报告撰写和演示

你的工作方式：
- 系统性思考，步骤清晰
- 注重数据的准确性和可靠性
- 善于发现问题和提出假设
- 能够综合多方面信息得出结论

你可以使用各种工具来辅助研究工作。请用中文与用户交流。`;

  return createReActAgent({
    name,
    systemPrompt,
    openaiApiKey,
    modelName: 'deepseek-chat',
    temperature: 0.5,
    enableBuiltinTools: true,
    enableLongTermMemory: true,
    longTermMemoryMode: 'both',
    maxIters: 20,
    parallelToolCalls: true,
    enableMetaTool: true,
    ...options
  });
}





