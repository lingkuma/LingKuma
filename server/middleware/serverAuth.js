const crypto = require('crypto');

const SERVER_API_SECRET = process.env.SERVER_API_SECRET || 'default-server-secret';

const verifyServerRequest = (req, res, next) => {
  const signature = req.headers['x-server-signature'];
  const timestamp = req.headers['x-server-timestamp'];
  const serverId = req.headers['x-server-id'];

  if (!signature || !timestamp || !serverId) {
    return res.status(401).json({
      success: false,
      message: 'Missing server authentication headers'
    });
  }

  const currentTime = Date.now();
  const requestTime = parseInt(timestamp);

  if (Math.abs(currentTime - requestTime) > 300000) {
    return res.status(401).json({
      success: false,
      message: 'Request timestamp expired'
    });
  }

  const method = req.method;
  const path = req.originalUrl;
  const body = JSON.stringify(req.body);

  const dataToSign = `${method}:${path}:${timestamp}:${body}`;

  const expectedSignature = crypto
    .createHmac('sha256', SERVER_API_SECRET)
    .update(dataToSign)
    .digest('hex');

  if (signature !== expectedSignature) {
    // console.error('Server signature mismatch:', {
    //   expected: expectedSignature,
    //   received: signature,
    //   serverId
    // });
    return res.status(401).json({
      success: false,
      message: 'Invalid server signature'
    });
  }

  req.serverId = serverId;
  next();
};

const signServerRequest = (method, path, body = {}) => {
  const timestamp = Date.now();
  const bodyStr = JSON.stringify(body);
  const dataToSign = `${method}:${path}:${timestamp}:${bodyStr}`;

  const signature = crypto
    .createHmac('sha256', SERVER_API_SECRET)
    .update(dataToSign)
    .digest('hex');

  return {
    'x-server-signature': signature,
    'x-server-timestamp': timestamp.toString(),
    'x-server-id': process.env.SERVER_ID || 'unknown'
  };
};

module.exports = {
  verifyServerRequest,
  signServerRequest
};
