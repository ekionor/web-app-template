module.exports = function UserNotFoundException(id) {
  this.status = 404;
  this.message = "User not found";
};
