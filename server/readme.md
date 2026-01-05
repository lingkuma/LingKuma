# Lingkuma Server

Lingkuma 云端同步服务器，提供单词、短语等数据的云端存储和同步服务。

## 自建服务器配置

1. 首先安装MongoDB
2. 然后运行一键搭建和更新的Docker代码
```bash
docker pull lingkuma/lingkuma-server:latest
docker rm -f lingkuma-server
docker run -d \
  --name lingkuma-server \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e MONGODB_URI=mongodb://localhost:27017/lingkuma_db \
  -e JWT_SECRET=your-JWT-password \
  -e ADMIN_PASSWORD=your-admin-password \
  -e REGISTER_MODE=localhost \
  lingkuma/lingkuma-server:latest
```


## 环境变量配置

### 必需变量

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `NODE_ENV` | 运行环境 | `production` 或 `development` |
| `PORT` | 服务端口 | `3000` |
| `MONGODB_URI` | MongoDB 连接字符串 | `mongodb://用户名:密码@主机:端口/数据库名?authSource=admin` |
| `JWT_SECRET` | JWT 加密密钥 | `your-jwt-secret-key`（所有服务器必须相同） |
| `REGISTER_MODE` | 注册模式 | `localhost`（本地模式）或 `afdian`（爱发电模式） |
| `ADMIN_PASSWORD` | 管理员密码 | `admin123` |


### 可选变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `TRIAL_DAYS` | 试用天数 | `7` |
| `SERVER_ID` | 服务器ID | `official-server`（官方）或唯一ID（自建） |
| `SERVER_API_SECRET` | 服务器间通信密钥 | `your-server-api-secret`（所有服务器必须相同） |
| `AFDIAN_CLIENT_ID` | 爱发电客户端ID | - |
| `AFDIAN_CLIENT_SECRET` | 爱发电客户端密钥 | - |
| `AFDIAN_REDIRECT_URI` | 爱发电回调地址 | `https://lingkuma.org/api/auth/afdian/callback` |
| `CORS_ORIGINS` | CORS 允许的域名 | `*`（全部允许） |





## 验证部署

访问健康检查接口：

```bash
curl http://localhost:3000/health
```


## 注册模式说明

### localhost 模式

- 直接注册，无需验证
- 99年试用时长
- 适合个人使用或测试环境

### afdian 模式

- 验证爱发电用户后才能注册
- 32天使用时长
- 适合需要用户管理的生产环境