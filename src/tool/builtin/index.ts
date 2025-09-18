/**
 * 内置工具函数
 * 提供一系列预定义的工具函数，包括代码执行、文件操作等
 */

import { ToolResponse, createSuccessResponse, createErrorResponse } from '../ToolResponse';
import { createTextBlock } from '../../message';
import { logger } from '../../utils';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * 执行Shell命令
 */
export async function* executeShellCommand(
  command: string,
  workingDir: string = process.cwd(),
  timeout: number = 30000
): AsyncGenerator<ToolResponse> {
  try {
    logger.debug(`执行Shell命令: ${command} (工作目录: ${workingDir})`);
    
    yield new ToolResponse(
      [createTextBlock(`正在执行命令: ${command}`)],
      { success: true },
      false
    );

    const { stdout, stderr } = await execAsync(command, {
      cwd: workingDir,
      timeout,
      encoding: 'utf8'
    });

    let output = '';
    if (stdout) output += `标准输出:\n${stdout}`;
    if (stderr) output += `${output ? '\n' : ''}标准错误:\n${stderr}`;
    
    if (!output) output = '命令执行完成，无输出';

    yield createSuccessResponse(output, {
      command,
      workingDir,
      stdout,
      stderr
    });

  } catch (error: any) {
    logger.error(`Shell命令执行失败: ${command}`, error);
    
    let errorMessage = `命令执行失败: ${error.message}`;
    if (error.stdout) errorMessage += `\n标准输出: ${error.stdout}`;
    if (error.stderr) errorMessage += `\n标准错误: ${error.stderr}`;

    yield createErrorResponse(errorMessage, {
      command,
      workingDir,
      error: error.message
    });
  }
}

/**
 * 执行Python代码
 */
export async function* executePythonCode(
  code: string,
  workingDir: string = process.cwd(),
  timeout: number = 30000
): AsyncGenerator<ToolResponse> {
  try {
    logger.debug(`执行Python代码 (工作目录: ${workingDir})`);
    
    yield new ToolResponse(
      [createTextBlock(`正在执行Python代码:\n\`\`\`python\n${code}\n\`\`\``)],
      { success: true },
      false
    );

    // 创建临时文件
    const tempFile = path.join(workingDir, `temp_${Date.now()}.py`);
    await fs.writeFile(tempFile, code, 'utf8');

    try {
      const { stdout, stderr } = await execAsync(`python "${tempFile}"`, {
        cwd: workingDir,
        timeout,
        encoding: 'utf8'
      });

      let output = '';
      if (stdout) output += `输出:\n${stdout}`;
      if (stderr) output += `${output ? '\n' : ''}错误:\n${stderr}`;
      
      if (!output) output = 'Python代码执行完成，无输出';

      yield createSuccessResponse(output, {
        code,
        workingDir,
        stdout,
        stderr
      });

    } finally {
      // 清理临时文件
      try {
        await fs.unlink(tempFile);
      } catch {
        // 忽略删除失败
      }
    }

  } catch (error: any) {
    logger.error(`Python代码执行失败`, error);
    
    let errorMessage = `Python代码执行失败: ${error.message}`;
    if (error.stdout) errorMessage += `\n输出: ${error.stdout}`;
    if (error.stderr) errorMessage += `\n错误: ${error.stderr}`;

    yield createErrorResponse(errorMessage, {
      code,
      workingDir,
      error: error.message
    });
  }
}

/**
 * 查看文本文件内容
 */
export async function* viewTextFile(
  filePath: string,
  encoding: string = 'utf8',
  maxLines: number = 1000
): AsyncGenerator<ToolResponse> {
  try {
    logger.debug(`查看文件: ${filePath}`);
    
    // 检查文件是否存在
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      yield createErrorResponse(`路径不是文件: ${filePath}`);
      return;
    }

    // 读取文件内容
    const content = await fs.readFile(filePath, encoding as BufferEncoding);
    const lines = content.split('\n');
    
    let displayContent = content;
    let truncated = false;
    
    if (lines.length > maxLines) {
      displayContent = lines.slice(0, maxLines).join('\n');
      truncated = true;
    }

    const result = `文件: ${filePath}\n大小: ${stats.size} 字节\n行数: ${lines.length}\n\n内容:\n${displayContent}${truncated ? '\n\n...(内容已截断)' : ''}`;

    yield createSuccessResponse(result, {
      filePath,
      size: stats.size,
      lines: lines.length,
      encoding,
      truncated
    });

  } catch (error: any) {
    logger.error(`读取文件失败: ${filePath}`, error);
    yield createErrorResponse(`读取文件失败: ${error.message}`, {
      filePath,
      error: error.message
    });
  }
}

/**
 * 写入文本文件
 */
export async function* writeTextFile(
  filePath: string,
  content: string,
  encoding: string = 'utf8',
  createDirs: boolean = true
): AsyncGenerator<ToolResponse> {
  try {
    logger.debug(`写入文件: ${filePath}`);

    // 如果需要，创建目录
    if (createDirs) {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
    }

    // 写入文件
    await fs.writeFile(filePath, content, encoding as BufferEncoding);
    
    const stats = await fs.stat(filePath);
    const lines = content.split('\n').length;

    yield createSuccessResponse(
      `成功写入文件: ${filePath}\n大小: ${stats.size} 字节\n行数: ${lines}`,
      {
        filePath,
        size: stats.size,
        lines,
        encoding
      }
    );

  } catch (error: any) {
    logger.error(`写入文件失败: ${filePath}`, error);
    yield createErrorResponse(`写入文件失败: ${error.message}`, {
      filePath,
      error: error.message
    });
  }
}

/**
 * 向文件插入文本
 */
export async function* insertTextFile(
  filePath: string,
  insertText: string,
  lineNumber: number,
  encoding: string = 'utf8'
): AsyncGenerator<ToolResponse> {
  try {
    logger.debug(`向文件插入文本: ${filePath} (行号: ${lineNumber})`);

    // 读取原文件内容
    const originalContent = await fs.readFile(filePath, encoding as BufferEncoding);
    const lines = originalContent.split('\n');

    // 验证行号
    if (lineNumber < 0 || lineNumber > lines.length) {
      yield createErrorResponse(`无效的行号: ${lineNumber} (文件共 ${lines.length} 行)`);
      return;
    }

    // 插入文本
    const insertLines = insertText.split('\n');
    lines.splice(lineNumber, 0, ...insertLines);

    // 写回文件
    const newContent = lines.join('\n');
    await fs.writeFile(filePath, newContent, encoding as BufferEncoding);
    
    const stats = await fs.stat(filePath);

    yield createSuccessResponse(
      `成功向文件插入文本: ${filePath}\n插入位置: 第 ${lineNumber} 行\n插入行数: ${insertLines.length}\n文件新大小: ${stats.size} 字节`,
      {
        filePath,
        lineNumber,
        insertedLines: insertLines.length,
        newSize: stats.size,
        encoding
      }
    );

  } catch (error: any) {
    logger.error(`向文件插入文本失败: ${filePath}`, error);
    yield createErrorResponse(`向文件插入文本失败: ${error.message}`, {
      filePath,
      lineNumber,
      error: error.message
    });
  }
}

/**
 * 列出目录内容
 */
export async function* listDirectory(
  dirPath: string = process.cwd(),
  showHidden: boolean = false,
  recursive: boolean = false
): AsyncGenerator<ToolResponse> {
  try {
    logger.debug(`列出目录内容: ${dirPath}`);

    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      yield createErrorResponse(`路径不是目录: ${dirPath}`);
      return;
    }

    const items: string[] = [];
    
    if (recursive) {
      // 递归列出
      await listDirectoryRecursive(dirPath, items, showHidden);
    } else {
      // 只列出当前目录
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!showHidden && entry.name.startsWith('.')) continue;
        
        const type = entry.isDirectory() ? 'DIR' : 'FILE';
        items.push(`${type.padEnd(4)} ${entry.name}`);
      }
    }

    const result = `目录: ${dirPath}\n项目数: ${items.length}\n\n${items.join('\n')}`;

    yield createSuccessResponse(result, {
      dirPath,
      itemCount: items.length,
      showHidden,
      recursive
    });

  } catch (error: any) {
    logger.error(`列出目录内容失败: ${dirPath}`, error);
    yield createErrorResponse(`列出目录内容失败: ${error.message}`, {
      dirPath,
      error: error.message
    });
  }
}

/**
 * 递归列出目录内容的辅助函数
 */
async function listDirectoryRecursive(
  dirPath: string, 
  items: string[], 
  showHidden: boolean,
  prefix: string = ''
): Promise<void> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!showHidden && entry.name.startsWith('.')) continue;
    
    const fullPath = path.join(dirPath, entry.name);
    const displayName = prefix + entry.name;
    
    if (entry.isDirectory()) {
      items.push(`DIR  ${displayName}/`);
      await listDirectoryRecursive(fullPath, items, showHidden, displayName + '/');
    } else {
      items.push(`FILE ${displayName}`);
    }
  }
}

/**
 * 获取系统信息
 */
export async function* getSystemInfo(): AsyncGenerator<ToolResponse> {
  try {
    logger.debug('获取系统信息');

    const info = {
      platform: process.platform,
      architecture: process.arch,
      nodeVersion: process.version,
      workingDirectory: process.cwd(),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    };

    const result = `系统信息:
平台: ${info.platform}
架构: ${info.architecture}
Node.js版本: ${info.nodeVersion}
工作目录: ${info.workingDirectory}
运行时间: ${Math.floor(info.uptime)} 秒
内存使用:
  - RSS: ${Math.round(info.memoryUsage.rss / 1024 / 1024)} MB
  - 堆总量: ${Math.round(info.memoryUsage.heapTotal / 1024 / 1024)} MB
  - 堆使用: ${Math.round(info.memoryUsage.heapUsed / 1024 / 1024)} MB
CPU使用:
  - 用户时间: ${info.cpuUsage.user} 微秒
  - 系统时间: ${info.cpuUsage.system} 微秒`;

    yield createSuccessResponse(result, info);

  } catch (error: any) {
    logger.error('获取系统信息失败', error);
    yield createErrorResponse(`获取系统信息失败: ${error.message}`);
  }
}

// 为所有函数添加描述和参数信息，便于工具包注册
(executeShellCommand as any).description = '执行Shell命令并返回结果';
(executePythonCode as any).description = '执行Python代码并返回结果';
(viewTextFile as any).description = '查看文本文件的内容';
(writeTextFile as any).description = '写入内容到文本文件';
(insertTextFile as any).description = '向文本文件的指定行插入内容';
(listDirectory as any).description = '列出目录中的文件和子目录';
(getSystemInfo as any).description = '获取当前系统的基本信息';

