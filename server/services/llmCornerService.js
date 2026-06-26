const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const CORNER_LABELS = ['左上', '右上', '右下', '左下'];
const LLM_TIMEOUT_MS = 55000; // Keep under 60s gateway timeout
const MAX_IMAGE_DIM = 1024; // Resize image to this max dimension for LLM (same pattern as CV auto-detect)
const MAX_RETRY_ATTEMPTS = 3; // Retry on empty content / parse failure / validation failure

const SYSTEM_PROMPT = `你是一个羽毛球场地角点识别专家。你的任务是从羽毛球场的俯拍图片中精确识别出球场四个角点的像素坐标。

## 输出要求
你必须返回一个严格的 JSON 格式，包含四个角点的坐标：
\`\`\`json
{
  "corners": [
    {"label": "左上", "x": 数字, "y": 数字},
    {"label": "右上", "x": 数字, "y": 数字},
    {"label": "右下", "x": 数字, "y": 数字},
    {"label": "左下", "x": 数字, "y": 数字}
  ]
}
\`\`\`

## 重要规则
1. 坐标系原点在图像**左上角**，x轴向右递增，y轴向下递增
2. 四个点必须按以下固定顺序：左上 → 右上 → 右下 → 左下
3. 每个点的 x 和 y 必须是整数（像素坐标）
4. 四个角点必须位于球场的四个不同位置，任意两个点的坐标不能相同或接近
5. 左上和右上应在图像上方，右下和左下应在图像下方（y值更大）
6. 只返回 JSON，不要有任何额外解释文字
7. 如果无法确定某个点的位置，尽量给出最可能的估计值`;

const USER_PROMPT_TEMPLATE = (imageWidth, imageHeight, cvHint) => {
  let hintSection = '';
  if (cvHint && cvHint.length === 4) {
    const [tl, tr, br, bl] = cvHint;
    hintSection = `

## CV 预检测结果（重要参考）
一个计算机视觉算法已经给出了四个角点的粗略位置（可能存在偏差），请以此为基础进行精修：
- 左上 ≈ (${tl[0]}, ${tl[1]})
- 右上 ≈ (${tr[0]}, ${tr[1]})
- 右下 ≈ (${br[0]}, ${br[1]})
- 左下 ≈ (${bl[0]}, ${bl[1]})

请仔细观察图像中球场边线的实际位置，在上述粗略坐标附近找到精确的角点。这些坐标仅供参考定位，你的任务是给出更精确的坐标，而不是直接复制。`;
  }
  return `## 任务
第一张图是需要标注的羽毛球场俯拍图（尺寸：${imageWidth}×${imageHeight}像素），第二张图是标注示例参考图。请识别出球场的四个角点坐标。

## 输出格式（严格遵守）
你必须只返回一个 JSON 对象，格式如下：
\`\`\`json
{
  "corners": [
    {"label": "左上", "x": 100, "y": 80},
    {"label": "右上", "x": 580, "y": 85},
    {"label": "右下", "x": 590, "y": 420},
    {"label": "左下", "x": 90, "y": 415}
  ]
}
\`\`\`
注意：
- 上面示例中的数字只是样例，你必须根据实际图像给出正确的坐标
- x 和 y 必须是图像范围内的整数像素坐标（x: 0 ~ ${imageWidth}, y: 0 ~ ${imageHeight}）
- 四个点按左上→右上→右下→左下 顺序排列
- 四个点的位置必须各不相同，不能有重复或过于接近的坐标
- **只返回 JSON，不要加任何解释、前言或后缀文字**${hintSection}`;
};

/**
 * Resize an image (as buffer) to fit within MAX_IMAGE_DIM, keeping aspect ratio.
 * Returns { buffer, width, height, origWidth, origHeight }.
 * - width/height: dimensions of the resized image (what the LLM sees)
 * - origWidth/origHeight: original file dimensions (for scaling coords back)
 * Uses fresh sharp instances to avoid pipeline-reuse issues.
 */
async function resizeImage(imagePath) {
  // Read metadata with a fresh instance
  const metadata = await sharp(imagePath).metadata();
  const origW = metadata.width;
  const origH = metadata.height;

  const maxDim = Math.max(origW, origH);
  if (maxDim <= MAX_IMAGE_DIM) {
    // No resize needed — read raw buffer with a fresh instance
    const buffer = await sharp(imagePath).toBuffer();
    return { buffer, width: origW, height: origH, origWidth: origW, origHeight: origH };
  }

  const scale = MAX_IMAGE_DIM / maxDim;
  const newW = Math.round(origW * scale);
  const newH = Math.round(origH * scale);

  // Resize with a fresh instance
  const buffer = await sharp(imagePath).resize(newW, newH, { fit: 'inside' }).toBuffer();
  return { buffer, width: newW, height: newH, origWidth: origW, origHeight: origH };
}

/**
 * Encode a local image file to base64 data URL string.
 * If resizeResult is provided (from resizeImage), use the resized buffer.
 */
function imageToBase64(imagePath, resizeResult) {
  if (resizeResult) {
    const ext = path.extname(imagePath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    return `data:${mimeType};base64,${resizeResult.buffer.toString('base64')}`;
  }

  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image file not found: ${imagePath}`);
  }
  const buffer = fs.readFileSync(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

/**
 * Validate that 4 corners form a reasonable quadrilateral.
 * Rejects degenerate cases: duplicate points, zero/tiny area, wrong ordering.
 * @param {Array} corners - [[x,y],[x,y],[x,y],[x,y]] in TL,TR,BR,BL order
 * @param {number} imgW - image width (for scaling thresholds)
 * @param {number} imgH - image height
 * @returns {string|null} - error message if invalid, null if valid
 */
function validateCorners(corners, imgW, imgH) {
  // 1. Any two points must be sufficiently apart
  const minDist = Math.min(imgW, imgH) * 0.05; // 5% of shorter side
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const dx = corners[i][0] - corners[j][0];
      const dy = corners[i][1] - corners[j][1];
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        return `${CORNER_LABELS[i]}与${CORNER_LABELS[j]}坐标过于接近（距离${dist.toFixed(0)}px < ${minDist.toFixed(0)}px），检测结果不可靠`;
      }
    }
  }

  // 2. Quadrilateral area must be reasonable (shoelace formula)
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = corners[i];
    const [x2, y2] = corners[(i + 1) % 4];
    area += x1 * y2 - x2 * y1;
  }
  area = Math.abs(area) / 2;
  const minArea = imgW * imgH * 0.02; // at least 2% of image area
  if (area < minArea) {
    return `四边形面积过小（${area.toFixed(0)}px² < ${minArea.toFixed(0)}px²），检测结果不可靠`;
  }

  // 3. Basic ordering check: top edge should be above bottom edge
  const [tl, tr, br, bl] = corners;
  const midTopY = (tl[1] + tr[1]) / 2;
  const midBotY = (bl[1] + br[1]) / 2;
  if (midBotY <= midTopY) {
    return `角点顺序异常（上边y=${midTopY.toFixed(0)}不高于下边y=${midBotY.toFixed(0)}），检测结果不可靠`;
  }

  return null;
}

/**
 * Call OpenAI Compatible Vision API to detect court corners.
 *
 * Two-stage strategy:
 * 1. (Optional) CV auto-detection provides approximate corner coordinates
 *    as a hint — passed in via cvHintCorners (original image pixel space).
 * 2. The LLM vision model refines these into precise coordinates.
 *
 * Image handling (same as CV auto-detect): resize the image to MAX_IMAGE_DIM
 * before sending to the LLM vision model.  The LLM works in the resized
 * coordinate space and returns coordinates relative to the resized image.
 * We then scale the coordinates back to the original pixel dimensions.
 *
 * CV hint corners are scaled from original space → LLM space before being
 * included in the prompt, so the LLM sees consistent coordinates.
 *
 * @param {object} modelConfig - { apiUrl, apiKey, modelId }
 * @param {string} targetImagePath - path to the court template image
 * @param {string} referenceImagePath - path to the reference/example image
 * @param {Array|null} cvHintCorners - optional [[x,y],[x,y],[x,y],[x,y]] in
 *        original image pixel space (TL,TR,BR,BL order), from CV auto-detect
 * @returns {Promise<{success, corners, error}>} corners in original image space
 */
async function detectCornersWithLLM(modelConfig, targetImagePath, referenceImagePath, cvHintCorners) {
  // --- Step 1: resize images for LLM vision processing ---
  let targetResized, refResized;
  let targetBase64, refBase64;
  let llmWidth, llmHeight; // The dimensions we tell the LLM

  try {
    targetResized = await resizeImage(targetImagePath);
    refResized = await resizeImage(referenceImagePath);
    llmWidth = targetResized.width;
    llmHeight = targetResized.height;

    targetBase64 = imageToBase64(targetImagePath, targetResized);
    refBase64 = imageToBase64(referenceImagePath, refResized);
  } catch (e) {
    return { success: false, error: '图片处理失败: ' + e.message };
  }

  // Calculate scale factors using ACTUAL file dimensions (not passed params)
  const actualWidth = targetResized.origWidth;
  const actualHeight = targetResized.origHeight;
  const scaleX = actualWidth / llmWidth;
  const scaleY = actualHeight / llmHeight;

  console.log('[LLMDetect] Original:', actualWidth + 'x' + actualHeight,
    '→ Resized:', llmWidth + 'x' + llmHeight,
    '(scaleX:', scaleX.toFixed(4), 'scaleY:', scaleY.toFixed(4) + ')');

  // Scale CV hint corners from original image space → LLM space
  let cvHintLLM = null;
  if (cvHintCorners && Array.isArray(cvHintCorners) && cvHintCorners.length === 4) {
    cvHintLLM = cvHintCorners.map(([x, y]) => [
      Math.round(x / scaleX),
      Math.round(y / scaleY),
    ]);
    console.log('[LLMDetect] CV hint (original):', JSON.stringify(cvHintCorners));
    console.log('[LLMDetect] CV hint (LLM space):', JSON.stringify(cvHintLLM));
  } else {
    console.log('[LLMDetect] No CV hint provided (LLM will detect from scratch)');
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: USER_PROMPT_TEMPLATE(llmWidth, llmHeight, cvHintLLM) },
        { type: 'image_url', image_url: { url: targetBase64, detail: 'high' } },
        { type: 'image_url', image_url: { url: refBase64, detail: 'high' } },
      ],
    },
  ];

  const apiUrl = modelConfig.apiUrl.replace(/\/+$/, '');
  const endpoint = `${apiUrl}/chat/completions`;

  console.log('[LLMDetect] Calling:', endpoint, 'model:', modelConfig.modelId,
    cvHintLLM ? '(with CV hint)' : '(no hint)');

  // --- Retry loop: retry on empty content, parse failure, or validation failure ---
  let lastError = '';
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    console.log(`[LLMDetect] Attempt ${attempt}/${MAX_RETRY_ATTEMPTS}`);

    const attemptResult = await _attemptLLMDetection(
      modelConfig, endpoint, messages, llmWidth, llmHeight, scaleX, scaleY, attempt
    );

    if (attemptResult.success) {
      if (attempt > 1) {
        console.log(`[LLMDetect] Succeeded on attempt ${attempt}`);
      }
      return attemptResult;
    }

    lastError = attemptResult.error;
    console.log(`[LLMDetect] Attempt ${attempt} failed: ${lastError}`);

    // Determine if this error is retryable
    const isRetryable = attemptResult.retryable;
    if (!isRetryable || attempt === MAX_RETRY_ATTEMPTS) {
      break;
    }

    // Brief delay before retry (skip on last attempt)
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // All retries exhausted — if we have CV hint corners, use them as fallback
  // (CV detection is usually decent; better than failing entirely)
  if (cvHintCorners && cvHintCorners.length === 4) {
    console.log('[LLMDetect] All retries failed — falling back to CV hint corners:', JSON.stringify(cvHintCorners));
    return { success: true, corners: cvHintCorners, fallback: 'cv' };
  }

  return { success: false, error: lastError };
}

/**
 * Single attempt at calling the LLM API and parsing the result.
 * Returns { success, corners, error, retryable }.
 * - retryable=true means the caller should retry (empty content / parse / validation failure)
 * - retryable=false means a hard error (HTTP error / network / timeout)
 */
async function _attemptLLMDetection(modelConfig, endpoint, messages, llmWidth, llmHeight, scaleX, scaleY, attempt) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

    // On retry, add a reminder message to encourage proper JSON output
    const retryMessages = attempt > 1
      ? [...messages, {
          role: 'assistant',
          content: '(上一次返回无效，请严格按照格式重新输出)',
        }, {
          role: 'user',
          content: '请重新返回严格的 JSON 格式，包含4个不同的角点坐标。只返回 JSON，不要任何解释。',
        }]
      : messages;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${modelConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: modelConfig.modelId,
        messages: retryMessages,
        max_tokens: 1024,
        temperature: attempt > 1 ? 0.3 : 0.1, // slightly increase temperature on retry
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return {
        success: false,
        error: `LLM API 错误 (${response.status}): ${errText.slice(0, 200)}`,
        retryable: false
      };
    }

    const data = await response.json();

    // Extract content from response
    const message = data.choices?.[0]?.message;
    const content = getEffectiveContent(message);

    if (!content) {
      console.log('[LLMDetect] No effective content found');
      return { success: false, error: 'LLM 返回内容为空', retryable: true };
    }

    // Parse corners from response text (in LLM/resized coordinate space)
    const cornersLLM = parseCornersFromResponse(content, llmWidth, llmHeight);

    if (!cornersLLM) {
      return {
        success: false,
        error: `无法从 LLM 返回中解析出有效的4个角点坐标。原始返回：${content.slice(0, 300)}`,
        retryable: true
      };
    }

    // Validate quadrilateral quality (reject duplicate/degenerate corners)
    const validationError = validateCorners(cornersLLM, llmWidth, llmHeight);
    if (validationError) {
      console.log('[LLMDetect] Validation FAILED:', validationError);
      console.log('[LLMDetect] Rejected LLM space:', JSON.stringify(cornersLLM));
      return {
        success: false,
        error: '检测结果质量校验失败：' + validationError,
        retryable: true
      };
    }

    // Scale coordinates back to original image dimensions
    const corners = cornersLLM.map(([x, y]) => [
      Math.round(x * scaleX),
      Math.round(y * scaleY),
    ]);

    console.log('[LLMDetect] LLM space:', JSON.stringify(cornersLLM));
    console.log('[LLMDetect] Original space:', JSON.stringify(corners));

    return { success: true, corners };
  } catch (e) {
    if (e.name === 'AbortError') {
      // Timeout — retryable (server may be temporarily slow)
      return { success: false, error: 'LLM API 调用超时（55秒）', retryable: true };
    }
    console.error('[LLMDetect] API call error:', e.message);
    // Network errors (fetch failed, ECONNRESET, etc.) are retryable —
    // the server may recover on the next attempt
    return { success: false, error: 'LLM API 调用失败: ' + e.message, retryable: true };
  }
}

/**
 * Get effective content from a response message.
 * For reasoning models (e.g. Qwen/DeepSeek-R1), content may be null
 * while the actual answer is in reasoning_content. This function tries
 * content first, then falls back to extracting from reasoning_content.
 */
function getEffectiveContent(message) {
  if (!message) return '';

  // 1. Try direct content (string or array with text parts)
  if (message.content) {
    if (typeof message.content === 'string') {
      const trimmed = message.content.trim();
      if (trimmed) return trimmed;
    }
    if (Array.isArray(message.content)) {
      const textParts = message.content
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join('\n');
      if (textParts) return textParts;
    }
  }

  // 2. For reasoning models: extract answer from reasoning_content
  if (message.reasoning_content) {
    console.log('[LLMDetect] Content is null, extracting from reasoning_content');
    // First try to find a JSON block in the reasoning content directly
    // (some models write the final answer within reasoning_content)
    const jsonFromReasoning = extractJsonFromReasoning(message.reasoning_content);
    if (jsonFromReasoning) {
      console.log('[LLMDetect] Found JSON block in reasoning_content');
      return jsonFromReasoning;
    }
    // Fall back to label-based extraction
    return extractFromReasoningContent(message.reasoning_content);
  }

  return '';
}

/**
 * Scan reasoning_content for a JSON block containing corners.
 * Reasoning models sometimes write their final answer as JSON inside
 * the reasoning trace, even when content is null.
 */
function extractJsonFromReasoning(text) {
  // Look for ```json ... ``` blocks containing "corners"
  const codeBlockRegex = /```(?:json)?\s*(\{[\s\S]*?"corners"[\s\S]*?\})\s*```/g;
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.corners && Array.isArray(parsed.corners) && parsed.corners.length === 4) {
        return JSON.stringify(parsed);
      }
    } catch (e) { /* not valid JSON, continue */ }
  }

  // Look for raw JSON object with "corners" key (no code block)
  const rawJsonRegex = /(\{"corners"\s*:\s*\[[\s\S]*?\]\})/g;
  while ((match = rawJsonRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.corners && Array.isArray(parsed.corners) && parsed.corners.length === 4) {
        return JSON.stringify(parsed);
      }
    } catch (e) { /* not valid JSON, continue */ }
  }

  // Look for a bare JSON array of 4 coordinate pairs: [[x,y],[x,y],[x,y],[x,y]]
  const arrayRegex = /\[\s*\[\s*\d+\s*,\s*\d+\s*\]\s*,\s*\[\s*\d+\s*,\s*\d+\s*\]\s*,\s*\[\s*\d+\s*,\s*\d+\s*\]\s*,\s*\[\s*\d+\s*,\s*\d+\s*\]\s*\]/g;
  while ((match = arrayRegex.exec(text)) !== null) {
    try {
      const arr = JSON.parse(match[0]);
      if (Array.isArray(arr) && arr.length === 4) {
        // Wrap in the expected format
        return JSON.stringify({
          corners: arr.map((c, i) => ({ label: CORNER_LABELS[i], x: c[0], y: c[1] }))
        });
      }
    } catch (e) { /* not valid JSON, continue */ }
  }

  return null;
}

/**
 * Extract corner coordinates from the model's reasoning_content.
 * Reasoning models put their thinking process here; we scan for
 * corner label mentions and extract nearby coordinate pairs.
 */
function extractFromReasoningContent(text) {
  const labelPatterns = [
    { label: '左上', fullLabel: '左上角' },
    { label: '右上', fullLabel: '右上角' },
    { label: '右下', fullLabel: '右下角' },
    { label: '左下', fullLabel: '左下角' },
  ];

  const results = [];
  for (const { label, fullLabel } of labelPatterns) {
    const coordinates = findCoordsNearFullLabel(text, fullLabel);
    if (coordinates) {
      results.push({ label, x: coordinates.x, y: coordinates.y });
    }
  }

  // Detect and reject the case where ANY two corners share identical coords
  // (a clear sign of a buggy extraction from a sparse reasoning trace)
  if (results.length === 4) {
    let hasDuplicate = false;
    for (let i = 0; i < 4 && !hasDuplicate; i++) {
      for (let j = i + 1; j < 4; j++) {
        if (results[i].x === results[j].x && results[i].y === results[j].y) {
          hasDuplicate = true;
          break;
        }
      }
    }
    if (hasDuplicate) {
      console.log('[LLMDetect] Duplicate corner coords detected in reasoning — rejecting as buggy');
      results.length = 0;
    }
  }

  if (results.length === 4) {
    const cornersJson = {
      corners: results.map(r => ({ label: r.label, x: r.x, y: r.y }))
    };
    console.log('[LLMDetect] Extracted from reasoning:', JSON.stringify(cornersJson));
    return JSON.stringify(cornersJson);
  }

  // Fallback: try a global pattern scan
  if (results.length < 4) {
    console.log('[LLMDetect] Full label found', results.length, '/4, trying global scan');
    const fallback = extractCornersByGlobalScan(text);
    if (fallback && fallback.length === 4) {
      const xs2 = new Set(fallback.map(r => r.x));
      const ys2 = new Set(fallback.map(r => r.y));
      if (xs2.size <= 1 && ys2.size <= 1) {
        console.log('[LLMDetect] Global scan produced identical coords — rejecting');
        return '';
      }
      const cornersJson = { corners: fallback };
      console.log('[LLMDetect] Extracted by global scan:', JSON.stringify(cornersJson));
      return JSON.stringify(cornersJson);
    }
  }

  console.log('[LLMDetect] Could only extract', results.length, 'corners from reasoning');
  return '';
}

/**
 * Find the estimate closest to a full corner label mention.
 */
function findCoordsNearFullLabel(text, fullLabel) {
  let pos = 0;
  const labelLen = fullLabel.length;

  while (true) {
    const idx = text.indexOf(fullLabel, pos);
    if (idx === -1) break;

    const searchWindow = text.slice(idx + labelLen, idx + labelLen + 800);
    const coords = extractCoordPair(searchWindow);
    if (coords) return coords;

    pos = idx + labelLen;
  }

  return null;
}

/**
 * Global scan: find label-coordinate patterns anywhere in the text.
 */
function extractCornersByGlobalScan(text) {
  const cornerMap = {
    '左上': ['左上角', '左上'], '右上': ['右上角', '右上'],
    '右下': ['右下角', '右下'], '左下': ['左下角', '左下'],
  };

  const result = [];
  for (const [label, aliases] of Object.entries(cornerMap)) {
    let bestCoords = null;
    let bestDist = Infinity;

    for (const alias of aliases) {
      let pos = 0;
      while (true) {
        const idx = text.indexOf(alias, pos);
        if (idx === -1) break;

        const window = text.slice(idx + alias.length, idx + alias.length + 400);
        const match = window.match(
          /x\s*[=:：≈约]\s*(\d{2,4})\s*[,，\s]+y\s*[=:：≈约]\s*(\d{2,4})/
        );
        if (match) {
          const dist = match.index;
          if (dist < bestDist) {
            bestDist = dist;
            bestCoords = { x: parseInt(match[1]), y: parseInt(match[2]) };
          }
        }

        pos = idx + alias.length;
      }
    }

    if (bestCoords) {
      result.push({ label, x: bestCoords.x, y: bestCoords.y });
    }
  }

  return result.length === 4 ? result : null;
}

/**
 * Try to extract an (x, y) coordinate pair from a text snippet.
 */
function extractCoordPair(text) {
  // Pattern 1: (number, number) — also handles Chinese parens （）
  let match = text.match(/[\(（]\s*(\d{2,4})\s*[,，]\s*(\d{2,4})\s*[\)）]/);
  if (match) return { x: parseInt(match[1]), y: parseInt(match[2]) };

  // Pattern 1b: [number, number]
  match = text.match(/\[\s*(\d{2,4})\s*[,，]\s*(\d{2,4})\s*\]/);
  if (match) return { x: parseInt(match[1]), y: parseInt(match[2]) };

  // Pattern 2: x = number, y = number
  match = text.match(/x\s*[=:：≈约]\s*(\d{2,4})\s*[,，\s]+y\s*[=:：≈约]\s*(\d{2,4})/);
  if (match) return { x: parseInt(match[1]), y: parseInt(match[2]) };

  // Pattern 3: y = number, x = number (reversed)
  match = text.match(/y\s*[=:：≈约]\s*(\d{2,4})\s*[,，\s]+x\s*[=:：≈约]\s*(\d{2,4})/);
  if (match) return { x: parseInt(match[2]), y: parseInt(match[1]) };

  // Pattern 4: Multi-line bullet format
  match = text.match(/\*\s*x\s*[=:：]\s*(\d{2,4})\s*\n\s*\*\s*y\s*[=:：]\s*(\d{2,4})/);
  if (match) return { x: parseInt(match[1]), y: parseInt(match[2]) };

  // Pattern 5: Separate x: and y: mentions nearby
  match = text.match(/x\s*[=:：≈约]\s*(\d{2,4})/);
  if (match) {
    const xVal = parseInt(match[1]);
    const yMatch = text.match(/y\s*[=:：≈约]\s*(\d{2,4})/);
    if (yMatch) return { x: xVal, y: parseInt(yMatch[1]) };
  }

  // Pattern 6: "坐标" followed by two numbers
  match = text.match(/坐标[为是约：:\s]*\(?\s*(\d{2,4})\s*[,，]\s*(\d{2,4})/);
  if (match) return { x: parseInt(match[1]), y: parseInt(match[2]) };

  // Pattern 7: Two bare numbers right after a label (e.g. "左上角 300 200")
  match = text.match(/(\d{2,4})\s*[,，\s]\s*(\d{2,4})/);
  if (match) return { x: parseInt(match[1]), y: parseInt(match[2]) };

  return null;
}

/**
 * Extract and validate corner coordinates from LLM response text
 */
function parseCornersFromResponse(text, imageWidth, imageHeight) {
  let jsonStr = text.trim();

  // Try extracting JSON from markdown code block first
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // Try to find JSON object directly
  const jsonObjMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonObjMatch) {
    jsonStr = jsonObjMatch[0];
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    console.error('[LLMDetect] JSON parse failed:', e.message, '| Input:', jsonStr.slice(0, 200));
    return null;
  }

  // Support both { corners: [...] } and direct array format
  const cornersArray = parsed.corners || (Array.isArray(parsed) ? parsed : null);
  if (!cornersArray || !Array.isArray(cornersArray) || cornersArray.length !== 4) {
    console.error('[LLMDetect] Invalid corners array length:', cornersArray?.length);
    return null;
  }

  const corners = cornersArray.map((item) => {
    let x, y;
    if (Array.isArray(item)) {
      x = Number(item[0]);
      y = Number(item[1]);
    } else if (typeof item === 'object' && item !== null) {
      x = Number(item.x);
      y = Number(item.y);
    } else {
      return null;
    }

    if (isNaN(x) || isNaN(y)) return null;
    x = Math.max(0, Math.min(Math.round(x), imageWidth));
    y = Math.max(0, Math.min(Math.round(y), imageHeight));

    return [x, y];
  });

  if (corners.some(c => c === null)) {
    console.error('[LLMDetect] Some corners are invalid after parsing');
    return null;
  }

  return corners;
}

/**
 * Get default model config for a user
 */
async function getDefaultModelConfig(ModelConfigModel, userId) {
  const defaultConfig = await ModelConfigModel.getRow({ userId, isDefault: true });
  if (defaultConfig) return defaultConfig;

  const list = await ModelConfigModel.getRows(
    { userId },
    { create_at: -1 },
    1
  );

  return list && list.length > 0 ? list[0] : null;
}

module.exports = {
  detectCornersWithLLM,
  getDefaultModelConfig,
};
