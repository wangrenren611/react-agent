/**
 * 调试流式响应的测试脚本
 * 用于诊断ReActAgent流式响应问题
 */

const OpenAI = require('openai');

async function testStreamResponse() {
  console.log('开始测试流式响应...');
  
  const client = new OpenAI({
    apiKey: 'sk-1f23acc3f51a429e90dc75eeb83831cc',
    baseURL: 'https://api.deepseek.com/v1'
  });

  try {
    const stream = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'user', content: '你是谁' }
      ],
      stream: true,
      max_tokens: 100
    });

    console.log('流式响应开始:');
    let chunkCount = 0;
    
    for await (const chunk of stream) {
      chunkCount++;
      console.log(`Chunk ${chunkCount}:`, JSON.stringify(chunk, null, 2));
      
      if (chunkCount > 10) {
        console.log('限制输出，停止测试');
        break;
      }
    }
    
    console.log(`总共收到 ${chunkCount} 个chunks`);
    
  } catch (error) {
    console.error('流式响应测试失败:', error);
  }
}

testStreamResponse();


