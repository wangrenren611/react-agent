/**
 * 修复ReActAgent流式响应问题的临时解决方案
 * 禁用流式响应，使用普通响应模式
 */

const { createCodeAssistantAgent } = require('./dist/examples/factory');
const { UserAgent } = require('./dist/agent');

async function testFixedAgent() {
  console.log('测试修复后的ReActAgent...');
  
  const apiKey = 'sk-1f23acc3f51a429e90dc75eeb83831cc';
  
  // 创建代码助手Agent，禁用流式响应
  const codeAgent = createCodeAssistantAgent(
    'CodeHelper',
    apiKey,
    {
      stream: false,  // 关键修复：禁用流式响应
      maxIters: 10
    }
  );

  // 创建用户Agent
  const user = new UserAgent('用户');

  console.log('代码助手已启动！输入 "exit" 退出。');
  console.log('你可以尝试问一些编程相关的问题，或者让我帮你写代码。');

  // 测试一个简单的问题
  try {
    const testMsg = await user.silentReply('你是谁');
    console.log('发送测试消息:', testMsg.getTextContent());
    
    const response = await codeAgent.reply(testMsg);
    console.log('收到回复:', response.getTextContent());
    
  } catch (error) {
    console.error('测试失败:', error);
  }

  user.close();
}

testFixedAgent();
