const TokenService = require("../auth/TokenService");

const tokenAuthentication = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return next();
  }
  if (authorization) {
    const token = authorization.substring(7);
    try {
      const user = await TokenService.verifyToken(token);
      req.authenticatedUser = user;
    } catch (err) {}

    next();
  }
};

module.exports = tokenAuthentication;
