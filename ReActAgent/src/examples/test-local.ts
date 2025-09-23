/**
 * 本地测试示例 - 不需要 API 调用
 */

/// <reference types="node" />

import { MessageFactory } from '../message';
import { InMemoryMemory } from '../memory';
import { Toolkit } from '../tool';
import { OpenAIChatFormatter } from '../formatter';

async function testLocalFunctionality() {
  console.log('🧪 开始本地功能测试...\n');

  try {
    // 测试消息系统
    console.log('1. 测试消息系统...');
    const userMsg = MessageFactory.createUserMessage('你好，我需要帮助');
    const systemMsg = MessageFactory.createSystemMessage('你是一个有用的助手');
    console.log(`✅ 创建消息成功: ${userMsg.getTextContent()}`);

    // 测试内存系统
    console.log('\n2. 测试内存系统...');
    const memory = new InMemoryMemory();
    await memory.add(userMsg);
    await memory.add(systemMsg);
    const messages = await memory.getMemory();
    console.log(`✅ 内存系统正常: 存储了 ${messages.length} 条消息`);

    // 测试工具系统
    console.log('\n3. 测试工具系统...');
    const toolkit = new Toolkit();
    
    // 注册一个简单的测试工具
    const echoTool = async function* (message: string) {
      yield {
        content: [{ type: 'text', text: `回声: ${message}` }],
        metadata: { success: true, timestamp: new Date().toISOString() },
        is_last: true
      };
    };

    toolkit.registerToolWithMetadata(
      echoTool,
      'echo',
      '回声工具 - 重复输入的消息',
      {
        type: 'object',
        properties: {
          message: { type: 'string', description: '要重复的消息' }
        },
        required: ['message']
      }
    );

    const schemas = toolkit.getJsonSchemas();
    console.log(`✅ 工具系统正常: 注册了 ${schemas.length} 个工具`);

    // 测试工具调用
    console.log('\n4. 测试工具调用...');
    const toolCall = {
      type: 'tool_use' as const,
      id: 'test-call-1',
      name: 'echo',
      input: { message: '测试消息' }
    };

    const toolResult = await toolkit.callToolFunction(toolCall);
    for await (const result of toolResult) {
      const firstBlock = result.content[0];
      const text = firstBlock && 'text' in firstBlock ? firstBlock.text : '无内容';
      console.log(`✅ 工具调用成功: ${text}`);
      break; // 只取第一个结果
    }

    // 测试格式化器
    console.log('\n5. 测试格式化器...');
    const formatter = new OpenAIChatFormatter();
    const testMessages = [systemMsg, userMsg];
    const formatted = await formatter.format(testMessages);
    console.log(`✅ 格式化器正常: 格式化了 ${formatted.length} 条消息`);

    console.log('\n🎉 所有本地功能测试通过！');
    console.log('\n📋 测试总结:');
    console.log('- ✅ 消息系统工作正常');
    console.log('- ✅ 内存系统工作正常');
    console.log('- ✅ 工具系统工作正常');
    console.log('- ✅ 工具调用功能正常');
    console.log('- ✅ 格式化器工作正常');
    console.log('\n💡 提示: 如需测试 API 调用，请确保网络连接正常且 API 密钥有效');

  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  testLocalFunctionality();
}

export { testLocalFunctionality };