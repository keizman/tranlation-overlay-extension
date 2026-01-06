/**
 * 翻译位置算法调试脚本
 * 用于独立测试和分析位置计算问题
 * 
 * 运行方式: node debug-translation.mjs
 */

// ============ 输入数据 ============

const originalText = `As Xu Qing looked around amidst the shouting and screaming, the large gate they had just walked through slammed shut, sending a cloud of dust out in all directions. The sound acted like a bugle call, whipping the surrounding scavengers into an even more excited frenzy.`;

// LLM 返回的翻译对
const llmResponse = `
looked around||环顾四周
amidst||在...之中
shouting and screaming||大声尖叫
large gate||大门
walked through||走过
slammed shut||砰地关上
cloud of dust||尘土
all directions||四面八方
acted like||表现得像
bugle call||号角声
whipping||煽动
surrounding||周围的
scavengers||拾荒者
excited frenzy||疯狂
just walked through||刚刚走过
sending a cloud of dust||扬起一片尘土
even more excited||更加兴奋
`;

// ============ 解析 LLM 响应 ============

function parseResponse(response) {
    const lines = response.trim().split('\n');
    const pairs = [];

    for (const line of lines) {
        const parts = line.split('||');
        if (parts.length === 2) {
            pairs.push({
                original: parts[0].trim(),
                translation: parts[1].trim(),
            });
        }
    }

    return pairs;
}

// ============ 单词边界验证 ============

function validateWordBoundary(text, word) {
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedWord}\\b`, 'i');
    return regex.test(text);
}

// ============ 位置计算 ============

function rangesOverlap(s1, e1, s2, e2) {
    return s1 < e2 && s2 < e1;
}

function addPositions(text, pairs) {
    const result = [];
    const usedRanges = [];

    for (const pair of pairs) {
        let searchStart = 0;
        let found = false;

        while (searchStart < text.length) {
            const index = text.indexOf(pair.original, searchStart);
            if (index === -1) break;

            const candidateStart = index;
            const candidateEnd = index + pair.original.length;

            // 检查重叠
            const hasOverlap = usedRanges.some(r =>
                rangesOverlap(candidateStart, candidateEnd, r.start, r.end)
            );

            if (!hasOverlap) {
                const foundText = text.substring(candidateStart, candidateEnd);
                if (foundText === pair.original) {
                    result.push({
                        ...pair,
                        position: { start: candidateStart, end: candidateEnd },
                    });
                    usedRanges.push({ start: candidateStart, end: candidateEnd });
                    found = true;
                    break;
                }
            }

            searchStart = index + 1;
        }

        if (!found) {
            console.warn(`❌ 找不到位置: "${pair.original}"`);
        }
    }

    return result.sort((a, b) => a.position.start - b.position.start);
}

// ============ 模拟应用替换 ============

function applyReplacements(text, replacements) {
    // 按位置倒序处理，避免偏移
    const sorted = [...replacements].sort((a, b) => b.position.start - a.position.start);

    let result = text;
    for (const rep of sorted) {
        const { start, end } = rep.position;
        const before = result.substring(0, start);
        const after = result.substring(end);
        const middle = result.substring(start, end);

        // 验证
        if (middle !== rep.original) {
            console.error(`❌ 位置错误: 期望"${rep.original}" 实际"${middle}" @ ${start}-${end}`);
        }

        // 应用替换 (在原词后面插入翻译)
        result = before + middle + ` (${rep.translation}) ` + after;
    }

    return result;
}

// ============ 主流程 ============

console.log('========== 调试翻译位置算法 ==========\n');

console.log('📄 原始文本:');
console.log(originalText);
console.log(`\n长度: ${originalText.length} 字符\n`);

// Step 1: 解析 LLM 响应
console.log('1️⃣ 解析 LLM 响应...');
const pairs = parseResponse(llmResponse);
console.log(`   解析出 ${pairs.length} 个翻译对\n`);

// Step 2: 单词边界验证
console.log('2️⃣ 单词边界验证...');
const validPairs = pairs.filter(pair => {
    const valid = validateWordBoundary(originalText, pair.original);
    if (!valid) {
        console.log(`   ❌ 未通过: "${pair.original}" -> "${pair.translation}"`);
    }
    return valid;
});
console.log(`   ${validPairs.length}/${pairs.length} 通过验证\n`);

// Step 3: 位置计算
console.log('3️⃣ 位置计算...');
const replacements = addPositions(originalText, validPairs);
console.log('\n   计算结果:');
for (const rep of replacements) {
    const extractedText = originalText.substring(rep.position.start, rep.position.end);
    const match = extractedText === rep.original ? '✅' : '❌';
    console.log(`   ${match} "${rep.original}" @ ${rep.position.start}-${rep.position.end} (提取: "${extractedText}")`);
}

// Step 4: 应用替换
console.log('\n4️⃣ 应用替换...');
const finalText = applyReplacements(originalText, replacements);
console.log('\n最终结果:');
console.log(finalText);

console.log('\n========== 调试完成 ==========');
