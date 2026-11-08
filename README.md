# 三国杀 · 星河

三国杀桌面对战程序。标准包 108 张牌，42 名武将，可以单机，也可以和朋友在局域网或手机上一起玩。

## 下载

Windows 版：

https://cdn.jsdelivr.net/gh/RainxButterfly/sgs@main/updates/sanguosha-xinghe-win64-0.1.0.zip

解压后运行 `sanguosha.exe`。

## 内容

- 42 名武将：标准包 25 名 + 风火林山精选 17 名
- 5–8 人身份场，2–8 人自定义对局
- 判定、出牌响应、濒死求桃、身份胜负结算
- 视为技、锁定技、主公技、主动技、觉醒、拼点、翻面、不屈
- 武将详情、武将图鉴、人机对局
- 局域网联机，断线后由电脑接管
- 手机浏览器扫码加入，与电脑同局

## 联机

房主打开「局域网联机 → 创建房间」，把界面上的地址和房间码发给朋友；朋友在「加入房间」里填写。

手机和电脑连接同一个 WiFi，扫描大厅里的二维码，输入昵称即可加入。

不在同一网络时，可以先用 ZeroTier、Radmin VPN 等工具组成虚拟局域网。

首次创建房间时如果 Windows 弹出防火墙提示，请允许「专用网络」访问。

## 自定义

单机和联机大厅都可以选择「自定义对局」，可以调整初始手牌、摸牌数、体力上限、手牌上限、身份是否公开、武将技能、延时锦囊、无懈可击、装备牌和人数。

## 自动更新

程序会读取仓库中的 `latest-portable.json`，从 jsDelivr、ghfast、ghproxy 等地址下载更新包，校验后替换程序并重启。

建议把程序解压到桌面、文档等可写目录，不要放在 `Program Files`。

发布步骤见 [docs/RELEASE.md](docs/RELEASE.md)。

## 开发

```bash
npm install
npm run dev
npm run desktop
npm run desktop:build:portable
```

构建桌面版需要 Rust、Tauri 和 WebView2。

## 作者

星河一叶Roxy  
ck_xuv@vip.qq.com

https://github.com/RainxButterfly/sgs
