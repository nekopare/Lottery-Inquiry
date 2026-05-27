# 彩票查询 - 网页版

超级大乐透开奖结果查询网页应用，支持最新查询、历史查询、同日查询。

## 功能

- 最新一期开奖结果查询
- 历史开奖按期号、年份、日期查询
- 上月同日、上六个月同日、上一年同日查询
- 开奖详情查看

## 技术栈

- HTML5 + CSS3 + JavaScript
- 响应式设计，支持手机和电脑访问
- 数据源: Huiniao 免费开奖接口

## 部署方式

### Vercel 部署

1. Fork 本仓库
2. 在 Vercel 导入项目
3. 自动部署完成

### GitHub Pages 部署

1. 推送到 GitHub
2. 进入仓库 Settings → Pages
3. Source 选择 main 分支
4. 保存后自动部署

## 本地运行

直接打开 `index.html` 文件即可，或使用本地服务器：

```bash
# Python
python -m http.server 8000

# Node.js
npx serve .
```

## 数据说明

- 数据来源: 公开开奖接口
- 中国体育彩票开奖结果为最终依据
- 历史数据范围从 2015-01-03 开始
