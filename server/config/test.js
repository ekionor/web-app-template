module.exports = {
  database: {
    database: "users",
    username: "my-db-user",
    password: "my-db-password",
    dialect: "sqlite",
    storage: ":memory:",
    logging: false,
  },
  mail: {
    host: "localhost",
    port: Math.floor(Math.random() * 2000) + 10000,
    tls: { rejectUnauthorized: false },
  },
};
