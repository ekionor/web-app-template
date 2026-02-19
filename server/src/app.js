const express = require("express");
const app = express();
const UserRouter = require("./user/UserRouter");
const errorHandler = require("./error/ErrorHandler");

app.use(express.json());
app.use(UserRouter);

app.use(errorHandler);

module.exports = app;
