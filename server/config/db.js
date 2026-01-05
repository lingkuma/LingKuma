const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // 解析MongoDB URI以提取认证信息
    const mongoURI = process.env.MONGODB_URI;

    // mongoose连接选项
    const options = {
      // 如果URI中没有authSource参数，这里会作为备用
      authSource: 'admin',
      // 其他推荐的连接选项
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    // console.log('Attempting to connect to MongoDB...');
    // console.log('URI (password hidden):', mongoURI.replace(/:[^:@]+@/, ':****@'));

    const conn = await mongoose.connect(mongoURI, options);

    // console.log(`MongoDB Connected: ${conn.connection.host}`);
    // console.log(`Database: ${conn.connection.name}`);
  } catch (error) {
    // console.error(`MongoDB Connection Error: ${error.message}`);
    // if (error.name === 'MongoServerError') {
    //   console.error(`Error Code: ${error.code}`);
    //   console.error(`Error Details: ${JSON.stringify(error.errInfo || {})}`);
    // }
    process.exit(1);
  }
};

module.exports = connectDB;

