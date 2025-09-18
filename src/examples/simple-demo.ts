/**
 * 简化的 ReActAgent 演示
 * 非流式，单次对话
 */

/// <reference types="node" />

import * as dotenv from 'dotenv';
import { createCodeAssistantAgent } from './factory';
import { MessageFactory } from '../message';

// 加载环境变量
dotenv.config();

async function simpleDemo() {
  console.log('🤖 ReActAgent 简化演示\n');

  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.error('❌ 错误: 未找到 API 密钥');
    console.error('请在 .env 文件中设置 DEEPSEEK_API_KEY 或 OPENAI_API_KEY');
    process.exit(1);
  }

  try {
    console.log('🔧 创建代码助手...');
    
    // 创建代码助手Agent（非流式）
    const codeAgent = createCodeAssistantAgent(
      'CodeHelper',
      apiKey,
      {
        stream: false, // 关闭流式处理
        maxIters: 5,   // 减少最大迭代次数
        temperature: 0.7,
        maxTokens: 1000
      }
    );

    console.log('✅ 代码助手创建成功！\n');

    // 测试几个简单的问题
    const testQuestions = [
      '你好，请简单介绍一下你自己',
      '请写一个简单的 Python 函数来计算斐波那契数列',
      '谢谢你的帮助'
    ];

    for (let i = 0; i < testQuestions.length; i++) {
      const question = testQuestions[i];
      console.log(`👤 用户: ${question}`);
      
      try {
        // 创建用户消息
        const userMsg = MessageFactory.createUserMessage(question);
        
        // 获取回复
        console.log('🤔 思考中...');
        const startTime = Date.now();
        const response = await codeAgent.reply(userMsg);
        const endTime = Date.now();
        
        console.log('🔍 调试信息 - response 对象:', {
          content: response.content,
          contentType: typeof response.content,
          isArray: Array.isArray(response.content)
        });
        
        console.log(`🤖 助手 (${endTime - startTime}ms): ${response.getTextContent()}\n`);
        
      } catch (error: any) {
        console.error(`❌ 处理问题 "${question}" 时出错:`, error.message);
        console.log('继续下一个问题...\n');
      }
    }

    console.log('🎉 演示完成！');

  } catch (error: any) {
    console.error('❌ 演示失败:', error.message);
    
    if (error.message?.includes('timeout') || error.message?.includes('超时')) {
      console.log('\n💡 建议:');
      console.log('1. 检查网络连接');
      console.log('2. 尝试增加超时时间');
      console.log('3. 使用本地测试: npx ts-node src/examples/test-local.ts');
    }
  }
}

// 运行演示
if (require.main === module) {
  simpleDemo();
}

export { simpleDemo };