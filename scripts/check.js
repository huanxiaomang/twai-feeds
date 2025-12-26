// scripts/check.js

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

// 项目根目录（脚本所在目录的上一级）
const rootDir = path.resolve(__dirname, "..");

// 使用 fetch（Node.js 18+ 原生支持，如果版本更低请安装 node-fetch）
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

async function checkUrl(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "twai-feeds-checker/1.0 (+https://github.com/your-repo)",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        valid: false,
        reason: `HTTP ${response.status} ${response.statusText}`,
      };
    }

    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();

    try {
      JSON.parse(text);
      const isJsonContentType = contentType.includes("application/json");
      return {
        valid: true,
        reason: isJsonContentType
          ? "Valid JSON"
          : "Parsable as JSON (but Content-Type not application/json)",
      };
    } catch (parseError) {
      return { valid: false, reason: "Response not valid JSON" };
    }
  } catch (err) {
    if (err.name === "AbortError") {
      return { valid: false, reason: "Request timeout (10s)" };
    }
    return { valid: false, reason: err.message || "Network error" };
  }
}

async function main() {
  console.log("=== twai-feeds RSS URL 检查开始 ===\n");

  const configFiles = [];
  const feedsDir = path.join(rootDir, "twai-feeds");

  if (!fs.existsSync(feedsDir)) {
    console.error(`错误：未找到目录 ${feedsDir}`);
    process.exit(1);
  }

  const subdirs = fs
    .readdirSync(feedsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory());

  for (const dirent of subdirs) {
    const configPath = path.join(feedsDir, dirent.name, "config.json");
    if (fs.existsSync(configPath)) {
      configFiles.push(configPath);
    }
  }

  if (configFiles.length === 0) {
    console.log("未找到任何 twai-feeds/*/config.json 文件");
    return;
  }

  console.log(`找到 ${configFiles.length} 个 config.json 文件：\n`);
  configFiles.forEach((p) => console.log(`  - ${path.relative(rootDir, p)}`));
  console.log("");

  let totalUrls = 0;
  let validCount = 0;
  const invalidList = [];

  for (const configPath of configFiles) {
    const relativePath = path.relative(rootDir, configPath);
    console.log(`正在处理：${relativePath}`);

    let config;
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch (e) {
      console.log(`  ❌ config.json 解析失败: ${e.message}\n`);
      continue;
    }

    const rssUrls = config.rss_urls || [];
    if (!Array.isArray(rssUrls) || rssUrls.length === 0) {
      console.log(`  ⚠️  rss_urls 为空或不是数组，跳过\n`);
      continue;
    }

    for (const url of rssUrls) {
      totalUrls++;
      process.stdout.write(`  检查 ${url} ... `);
      const result = await checkUrl(url.trim());

      if (result.valid) {
        validCount++;
        console.log(`✅ 可用 (${result.reason})`);
      } else {
        console.log(`❌ 不可用 (${result.reason})`);
        invalidList.push({ file: relativePath, url, reason: result.reason });
      }
    }
    console.log("");
  }

  // 最终统计
  console.log("=== 检查完成 ===");
  console.log(`总计检查 URL 数量：${totalUrls}`);
  console.log(`✅ 可用：${validCount}`);
  console.log(`❌ 不可用：${totalUrls - validCount}`);

  if (invalidList.length > 0) {
    console.log("\n不可用 URL 列表：");
    invalidList.forEach((item) => {
      console.log(`  - 文件：${item.file}`);
      console.log(`    URL：${item.url}`);
      console.log(`    原因：${item.reason}\n`);
    });
  } else {
    console.log("\n🎉 所有 RSS URL 均可用！");
  }
}

main().catch((err) => {
  console.error("脚本执行出错：", err);
  process.exit(1);
});
