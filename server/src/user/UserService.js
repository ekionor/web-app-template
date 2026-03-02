const User = require("./User");
const Sequelize = require("sequelize");
const bcrypt = require("bcrypt");
const EmailService = require("../email/EmailService");
const sequelize = require("../config/database");
const EmailException = require("../email/EmailException");
const InvalidTokenException = require("./InvalidTokenException");
const UserNotFoundException = require("./UserNotFoundException");
const { randomString } = require("../shared/generator");
const TokenService = require("../auth/TokenService");
const NotFoundException = require("../error/NotFoundException");

const save = async (body) => {
  const { username, email, password } = body;
  const hash = await bcrypt.hashSync(password, 10);
  const user = {
    username,
    email,
    password: hash,
    activationToken: randomString(16),
  };
  const transaction = await sequelize.transaction();
  await User.create(user, { transaction });
  try {
    await EmailService.sendAccountActivationEmail(email, user.activationToken);
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw new EmailException();
  }
};

const findByEmail = async (email) => {
  return await User.findOne({ where: { email } });
};

const activate = async (token) => {
  const user = await User.findOne({ where: { activationToken: token } });
  if (!user) {
    throw new InvalidTokenException();
  }
  user.inactive = false;
  user.activationToken = null;
  await user.save();
};

const getUsers = async (page, size, authenticatedUser) => {
  const id = authenticatedUser ? authenticatedUser.id : 0;
  const usersWithCount = await User.findAndCountAll({
    where: {
      inactive: false,
      id: { [Sequelize.Op.not]: id },
    },
    attributes: ["id", "username", "email"],
    limit: size,
    offset: page * size,
  });
  return {
    content: usersWithCount.rows,
    page,
    size,
    totalPages: Math.ceil(usersWithCount.count / size),
  };
};

const getUserById = async (id) => {
  const user = await User.findOne({
    where: { id: id, inactive: false },
    attributes: ["id", "username", "email"],
  });
  if (!user) {
    throw new NotFoundException("User not found");
  }
  return user;
};

const updateUser = async (id, body) => {
  const user = await User.findOne({ where: { id } });
  user.username = body.username;
  await user.save();
};

const deleteUser = async (id) => {
  await User.destroy({ where: { id } });
};

const passwordResetRequest = async (email) => {
  const user = await findByEmail(email);
  if (!user) {
    throw new NotFoundException("Email not found");
  }
  user.passwordResetToken = randomString(16);
  await user.save();
  try {
    await EmailService.sendPasswordReset(email, user.passwordResetToken);
  } catch (err) {
    throw new EmailException();
  }
};

module.exports = {
  save,
  findByEmail,
  activate,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  passwordResetRequest,
};
