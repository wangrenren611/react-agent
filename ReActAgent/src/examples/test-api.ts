/**
 * API 连接测试脚本
 */

/// <reference types="node" />

import * as dotenv from 'dotenv';
import { OpenAIChatModel } from '../model';
import { MessageFactory } from '../message';

// 加载环境变量
dotenv.config();

async function testApiConnection() {
  console.log('🔌 开始 API 连接测试...\n');

  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.error('❌ 错误: 未找到 API 密钥');
    console.error('请在 .env 文件中设置 DEEPSEEK_API_KEY 或 OPENAI_API_KEY');
    process.exit(1);
  }

  console.log(`🔑 使用 API 密钥: ${apiKey.substring(0, 10)}...`);

  try {
    // 创建模型实例
    const model = new OpenAIChatModel({
      model_name: 'deepseek-chat',
      api_key: apiKey,
      base_url: 'https://api.deepseek.com',
      temperature: 0.7,
      max_tokens: 100,
      stream: false,
      timeout: 10000 // 10秒超时
    });

    console.log('📡 正在测试 API 连接...');

    // 创建简单的测试消息
    const testMessage = MessageFactory.createUserMessage('你好');
    
    // 调用 API
    const startTime = Date.now();
    const response = await model.call([testMessage]);
    const endTime = Date.now();

    console.log(`✅ API 调用成功! 耗时: ${endTime - startTime}ms`);
    console.log('📝 响应内容:', response);

  } catch (error: any) {
    console.error('❌ API 调用失败:');
    
    if (error.message?.includes('timeout') || error.message?.includes('超时')) {
      console.error('🕐 连接超时 - 可能的原因:');
      console.error('  1. 网络连接问题');
      console.error('  2. API 服务器响应慢');
      console.error('  3. 防火墙阻止连接');
      console.error('💡 建议: 检查网络连接或使用代理');
    } else if (error.message?.includes('401') || error.message?.includes('认证')) {
      console.error('🔐 认证失败 - 可能的原因:');
      console.error('  1. API 密钥无效');
      console.error('  2. API 密钥已过期');
      console.error('  3. API 密钥权限不足');
      console.error('💡 建议: 检查 .env 文件中的 API 密钥');
    } else {
      console.error('🔍 详细错误信息:', error.message || error);
    }
    
    console.log('\n🛠️  故障排除建议:');
    console.log('1. 检查网络连接');
    console.log('2. 验证 API 密钥是否正确');
    console.log('3. 确认 .env 文件配置');
    console.log('4. 尝试使用本地测试: npx ts-node src/examples/test-local.ts');
  }
}

// 运行测试
if (require.main === module) {
  testApiConnection();
}

export { testApiConnection };