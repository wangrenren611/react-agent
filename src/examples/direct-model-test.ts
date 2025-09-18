/**
 * 直接模型测试 - 绕过 ReActAgent 的复杂逻辑
 */

/// <reference types="node" />

import * as dotenv from 'dotenv';
import { OpenAIChatModel } from '../model';
import { MessageFactory } from '../message';

// 加载环境变量
dotenv.config();

async function directModelTest() {
  console.log('🔬 直接模型测试\n');

  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.error('❌ 错误: 未找到 API 密钥');
    process.exit(1);
  }

  try {
    // 创建模型实例
    const model = new OpenAIChatModel({
      model_name: 'deepseek-chat',
      api_key: apiKey,
      base_url: 'https://api.deepseek.com',
      temperature: 0.7,
      max_tokens: 500,
      stream: false,
      timeout: 15000
    });

    console.log('✅ 模型创建成功！\n');

    // 测试对话
    const conversations = [
      {
        messages: [
          MessageFactory.createSystemMessage('你是一个有用的助手，请用中文回答问题。'),
          MessageFactory.createUserMessage('你好，请简单介绍一下你自己')
        ],
        description: '简单对话测试'
      },
      {
        messages: [
          MessageFactory.createSystemMessage('你是一个编程助手，请帮助用户解决编程问题。'),
          MessageFactory.createUserMessage('请写一个 Python 函数来计算斐波那契数列的第n项')
        ],
        description: '编程问题测试'
      }
    ];

    for (let i = 0; i < conversations.length; i++) {
      const { messages, description } = conversations[i];
      
      console.log(`📝 ${description}:`);
      console.log(`👤 用户: ${messages[messages.length - 1].getTextContent()}`);
      
      try {
        const startTime = Date.now();
        const response = await model.call(messages);
        const endTime = Date.now();
        
        if ('content' in response) {
          const textContent = response.content
            .filter(block => block.type === 'text')
            .map(block => (block as any).text)
            .join('\n');
          
          console.log(`🤖 助手 (${endTime - startTime}ms):`);
          console.log(textContent);
          console.log('');
        }
        
      } catch (error: any) {
        console.error(`❌ ${description} 失败:`, error.message);
        console.log('');
      }
    }

    console.log('🎉 直接模型测试完成！');

  } catch (error: any) {
    console.error('❌ 测试失败:', error.message);
  }
}

// 运行测试
if (require.main === module) {
  directModelTest();
}

export { directModelTest };