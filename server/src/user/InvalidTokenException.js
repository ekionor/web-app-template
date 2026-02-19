module.exports = function InvalidTokenException() {
  this.message = "This account is either active or the token is invalid";
  this.status = 400;
};
