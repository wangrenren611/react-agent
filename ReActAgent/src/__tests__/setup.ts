/**
 * Jest测试设置文件
 */

// 设置测试超时时间
jest.setTimeout(30000);

// 模拟环境变量
process.env.OPENAI_API_KEY = 'test-api-key';

// 全局测试工具
global.console = {
  ...console,
  // 在测试中静默一些日志
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: console.warn,
  error: console.error,
};





