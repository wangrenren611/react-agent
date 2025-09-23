/**
 * Debug script to isolate the content.filter issue
 */

/// <reference types="node" />

import { Message, MessageFactory, createTextBlock } from './src/message';

console.log('🔍 调试 Message 内容处理...\n');

// 测试 1: 基本字符串内容
console.log('1. 测试基本字符串内容:');
const msg1 = new Message('test', 'Hello World', 'assistant');
console.log('- content:', msg1.content);
console.log('- content type:', typeof msg1.content);
console.log('- getTextContent():', msg1.getTextContent());

// 测试 2: MessageFactory 创建的消息
console.log('\n2. 测试 MessageFactory 创建的消息:');
const msg2 = MessageFactory.createAssistantMessage('Hello from factory');
console.log('- content:', msg2.content);
console.log('- content type:', typeof msg2.content);
console.log('- getTextContent():', msg2.getTextContent());

// 测试 3: 复杂内容块
console.log('\n3. 测试复杂内容块:');
const msg3 = MessageFactory.createAssistantMessage([
  createTextBlock('Hello complex')
]);
console.log('- content:', msg3.content);
console.log('- content type:', typeof msg3.content);
console.log('- is array:', Array.isArray(msg3.content));
console.log('- getTextContent():', msg3.getTextContent());

// 测试 4: 模拟 generateResponse 创建的消息
console.log('\n4. 测试模拟 generateResponse 创建的消息:');
const responseText = "你好！我是CodeHelper，一个专业的代码助手。";
const msg4 = new Message('CodeHelper', responseText, 'assistant');
console.log('- content:', msg4.content);
console.log('- content type:', typeof msg4.content);
try {
  console.log('- getTextContent():', msg4.getTextContent());
} catch (error: any) {
  console.error('- getTextContent() 错误:', error.message);
}

console.log('\n✅ 调试完成');