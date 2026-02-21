/**
 * Firefox XPI 打包脚本
 *
 * 功能:
 * 1. 将 .output/firefox-mv2 目录打包为 .xpi 文件
 * 2. 计算 SHA256 哈希
 * 3. 生成/更新 update.json 文件
 *
 * 使用: node scripts/build-xpi.js
 */

import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { createHash } from 'crypto';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 配置
const CONFIG = {
  // 输入目录
  sourceDir: resolve(__dirname, '../.output/firefox-mv2'),
  // 输出目录
  outputDir: resolve(__dirname, '../dist'),
  // XPI 文件基准 URL
  baseUrl: 'https://storage.planktonfly.com/updates/archive',
};

/**
 * 读取 manifest.json 获取版本和扩展 ID
 */
function readManifest() {
  const manifestPath = resolve(CONFIG.sourceDir, 'manifest.json');

  if (!existsSync(manifestPath)) {
    throw new Error(
      `manifest.json 不存在: ${manifestPath}\n请先运行 npm run build:firefox`,
    );
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

  const version = manifest.version;
  const extensionId = manifest.browser_specific_settings?.gecko?.id;

  if (!extensionId) {
    throw new Error('manifest.json 中缺少 browser_specific_settings.gecko.id');
  }

  console.log(`扩展: ${manifest.name}`);
  console.log(`版本: ${version}`);
  console.log(`ID: ${extensionId}`);

  return { version, extensionId, name: manifest.name };
}

/**
 * 创建 XPI 文件 (ZIP 格式)
 */
async function createXPI(version) {
  // 确保输出目录存在
  if (!existsSync(CONFIG.outputDir)) {
    mkdirSync(CONFIG.outputDir, { recursive: true });
  }

  const xpiFilename = `side-translation-${version}.xpi`;
  const xpiPath = resolve(CONFIG.outputDir, xpiFilename);

  console.log(`\n正在打包 XPI...`);
  console.log(`   源目录: ${CONFIG.sourceDir}`);
  console.log(`   输出: ${xpiPath}`);

  return new Promise((resolve, reject) => {
    const output = createWriteStream(xpiPath);
    const archive = archiver('zip', {
      zlib: { level: 9 }, // 最大压缩级别
    });

    output.on('close', () => {
      console.log(`XPI 打包完成: ${archive.pointer()} bytes`);
      resolve(xpiPath);
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // 添加整个目录
    archive.directory(CONFIG.sourceDir, false);

    archive.finalize();
  });
}

/**
 * 计算文件 SHA256 哈希
 */
function calculateSHA256(filePath) {
  const fileBuffer = readFileSync(filePath);
  const hashSum = createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

/**
 * 生成/更新 update.json
 */
function generateUpdateJson(extensionId, version, xpiFilename, sha256) {
  const updateJsonPath = resolve(CONFIG.outputDir, 'update.json');

  let updateData = {
    addons: {},
  };

  // 如果已存在 update.json，读取并保留历史记录
  if (existsSync(updateJsonPath)) {
    try {
      updateData = JSON.parse(readFileSync(updateJsonPath, 'utf-8'));
      console.log(`\n读取现有 update.json`);
    } catch (_e) {
      console.log(`\n创建新的 update.json`);
    }
  }

  // 确保扩展条目存在
  if (!updateData.addons[extensionId]) {
    updateData.addons[extensionId] = { updates: [] };
  }

  const updates = updateData.addons[extensionId].updates;

  // 检查是否已有此版本
  const existingIndex = updates.findIndex((u) => u.version === version);

  const updateEntry = {
    version: version,
    update_link: `${CONFIG.baseUrl}/${xpiFilename}`,
    update_hash: `sha256:${sha256}`,
  };

  if (existingIndex >= 0) {
    // 更新现有版本
    updates[existingIndex] = updateEntry;
    console.log(`更新版本 ${version}`);
  } else {
    // 添加新版本
    updates.push(updateEntry);
    console.log(`添加版本 ${version}`);
  }

  // 按版本号排序 (降序，最新版本在前)
  updates.sort((a, b) => {
    const va = a.version.split('.').map(Number);
    const vb = b.version.split('.').map(Number);
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
      const diff = (vb[i] || 0) - (va[i] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });

  // 写入 update.json
  writeFileSync(updateJsonPath, JSON.stringify(updateData, null, 2), 'utf-8');
  console.log(`update.json 已更新: ${updateJsonPath}`);

  return updateJsonPath;
}

/**
 * 主函数
 */
async function main() {
  console.log('Firefox XPI 打包脚本\n');
  console.log('='.repeat(50));

  try {
    // 1. 读取 manifest
    const { version, extensionId } = readManifest();

    // 2. 创建 XPI
    const xpiPath = await createXPI(version);
    const xpiFilename = `side-translation-${version}.xpi`;

    // 3. 计算 SHA256
    console.log(`\n计算 SHA256...`);
    const sha256 = calculateSHA256(xpiPath);
    console.log(`   SHA256: ${sha256}`);

    // 4. 生成 update.json
    generateUpdateJson(extensionId, version, xpiFilename, sha256);

    // 5. 输出总结
    console.log('\n' + '='.repeat(50));
    console.log('打包完成!\n');
    console.log('输出文件:');
    console.log(`   - ${CONFIG.outputDir}/${xpiFilename}`);
    console.log(`   - ${CONFIG.outputDir}/update.json`);
    console.log('\n部署说明:');
    console.log(`   1. 上传 ${xpiFilename} 到: ${CONFIG.baseUrl}/`);
    console.log(
      `   2. 上传 update.json 到: https://storage.planktonfly.com/updates/`,
    );
  } catch (error) {
    console.error('\n错误:', error.message);
    process.exit(1);
  }
}

main();
