/**
 * ReActAgent使用示例
 * 演示如何创建和使用ReActAgent
 */

import { 
  createCodeAssistantAgent, 
  createGeneralAssistantAgent, 
  createResearchAssistantAgent 
} from './factory';
import { UserAgent } from '../agent';
import { logger } from '../utils';
import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });
// 从环境变量获取OpenAI API密钥
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('错误: 请设置OPENAI_API_KEY环境变量');
  console.error('使用方法: export OPENAI_API_KEY=your_api_key_here');
  process.exit(1);
}

// 确保 API 密钥不为 undefined
const apiKey: string = OPENAI_API_KEY;

/**
 * 基础使用示例
 */
async function basicExample(): Promise<void> {
  console.log('\n=== 基础使用示例 ===');
  
  // 创建代码助手Agent
  const codeAgent = createCodeAssistantAgent(
    'CodeHelper',
    apiKey,
    {
      stream: false,
      maxIters: 10
    }
  );

  // 创建用户Agent
  const user = new UserAgent('用户');

  console.log('代码助手已启动！输入 "exit" 退出。');
  console.log('你可以尝试问一些编程相关的问题，或者让我帮你写代码。');

  // 开始对话循环
  let msg = null;
  while (true) {
    try {
      msg = await user.reply(msg);
      
      if (msg.getTextContent().toLowerCase() === 'exit') {
        console.log('再见！');
        break;
      }

      msg = await codeAgent.reply(msg);
      
    } catch (error) {
      logger.error('对话过程中发生错误:', error);
      console.log('抱歉，发生了错误。请重试。');
      console.log('错误详情:', {
        message: (error as any)?.message,
        stack: (error as any)?.stack,
        type: (error as any)?.constructor?.name,
        raw: error
      });
    }
  }

  user.close();
}

/**
 * 高级功能示例
 */
async function advancedExample(): Promise<void> {
  console.log('\n=== 高级功能示例 ===');

  // 创建研究助手Agent（启用所有高级功能）
  const researchAgent = createResearchAssistantAgent(
    'ResearchBot',
    apiKey,
    {
      stream: false,
      parallelToolCalls: true,
      enableMetaTool: true,
      enableLongTermMemory: true,
      longTermMemoryMode: 'both'
    }
  );

  // 演示批量处理
  const testQuestions = [
    '请帮我创建一个Python脚本来分析CSV文件',
    '能否解释一下机器学习中的交叉验证？',
    '帮我写一个简单的数据可视化例子',
    '如何优化这个脚本的性能？'
  ];

  console.log('研究助手正在处理一系列问题...');

  for (let i = 0; i < testQuestions.length; i++) {
    const question = testQuestions[i];
    console.log(`\n--- 问题 ${i + 1}: ${question} ---`);
    
    try {
      const userMsg = await new UserAgent().silentReply(question);
      await researchAgent.reply(userMsg);
      
      console.log('\n[处理完成]');
      
    } catch (error) {
      logger.error(`处理问题 ${i + 1} 时发生错误:`, error);
    }
  }

  // 显示内存统计
  const memoryStats = await researchAgent.getMemoryStats();
  console.log('\n=== 内存统计 ===');
  console.log(`短期内存消息数: ${memoryStats.shortTermSize}`);
  if (memoryStats.longTermStats) {
    console.log(`长期内存关键词数: ${memoryStats.longTermStats.keywords}`);
    console.log(`长期内存条目数: ${memoryStats.longTermStats.totalEntries}`);
  }
}

/**
 * 结构化输出示例
 */
async function structuredOutputExample(): Promise<void> {
  console.log('\n=== 结构化输出示例 ===');

  const { z } = await import('zod');

  // 定义结构化输出Schema
  const TaskAnalysisSchema = z.object({
    task_type: z.string().describe('任务类型'),
    difficulty: z.enum(['简单', '中等', '困难']).describe('任务难度'),
    estimated_time: z.number().describe('预估完成时间（分钟）'),
    required_tools: z.array(z.string()).describe('需要的工具列表'),
    steps: z.array(z.string()).describe('执行步骤'),
    risks: z.array(z.string()).describe('潜在风险')
  });

  const agent = createGeneralAssistantAgent(
    'TaskAnalyzer',
    apiKey
  );

  const taskDescription = '创建一个Web应用来管理个人待办事项';
  const userMsg = await new UserAgent().silentReply(
    `请分析这个任务: ${taskDescription}`
  );

  try {
    const response = await agent.reply(userMsg, TaskAnalysisSchema);
    
    console.log('任务分析结果:');
    console.log('文本回复:', response.getTextContent());
    
    if (response.metadata) {
      console.log('\n结构化数据:');
      console.log(JSON.stringify(response.metadata, null, 2));
    }
    
  } catch (error) {
    logger.error('结构化输出示例失败:', error);
  }
}

/**
 * 工具并行调用示例
 */
async function parallelToolCallsExample(): Promise<void> {
  console.log('\n=== 工具并行调用示例 ===');

  const agent = createCodeAssistantAgent(
    'ParallelBot',
    apiKey,
    {
      parallelToolCalls: true,
      maxIters: 5
    }
  );

  const userMsg = await new UserAgent().silentReply(
    '请同时执行以下任务：1) 获取系统信息，2) 列出当前目录内容，3) 创建一个测试文件'
  );

  try {
    console.log('开始并行执行多个工具调用...');
    const startTime = Date.now();
    
    await agent.reply(userMsg);
    
    const endTime = Date.now();
    console.log(`\n执行完成，耗时: ${endTime - startTime}ms`);
    
  } catch (error) {
    logger.error('并行工具调用示例失败:', error);
  }
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  console.log('🤖 ReActAgent Node.js 示例程序');
  console.log('=====================================');

  const args = process.argv.slice(2);
  const example = args[0] || 'basic';

  try {
    switch (example) {
      case 'basic':
        await basicExample();
        break;
      case 'advanced':
        await advancedExample();
        break;
      case 'structured':
        await structuredOutputExample();
        break;
      case 'parallel':
        await parallelToolCallsExample();
        break;
      case 'all':
        await advancedExample();
        await structuredOutputExample();
        await parallelToolCallsExample();
        break;
      default:
        console.log('可用示例:');
        console.log('  basic     - 基础对话示例');
        console.log('  advanced  - 高级功能示例');
        console.log('  structured - 结构化输出示例');
        console.log('  parallel  - 并行工具调用示例');
        console.log('  all       - 运行所有示例（除basic外）');
        console.log('\n使用方法: npm run dev [示例名称]');
        break;
    }
  } catch (error) {
    logger.error('示例执行失败:', error);
    process.exit(1);
  }
}

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, _promise) => {
  logger.error('未处理的Promise拒绝:', reason);
  process.exit(1);
});

// 处理中断信号
process.on('SIGINT', () => {
  console.log('\n收到中断信号，正在退出...');
  process.exit(0);
});

// 运行主函数
if (require.main === module) {
  main().catch((error) => {
    logger.error('主函数执行失败:', error);
    process.exit(1);
  });
}





