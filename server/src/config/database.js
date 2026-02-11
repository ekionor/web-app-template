const Sequelize = require("sequelize");

const sequelize = new Sequelize("users", "my-db-user", "my-db-password", {
  dialect: "sqlite",
  storage: "./database.sqlite",
  logging: false,
});

module.exports = sequelize;
