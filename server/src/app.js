const express = require("express");
const app = express();
const UserRouter = require("./user/UserRouter");
const AuthenticationRouter = require("./auth/AuthenticationRouter");
const errorHandler = require("./error/ErrorHandler");
const tokenAuthentication = require("./middleware/tokenAuthentication");

app.use(express.json());

app.use(tokenAuthentication);

app.use(UserRouter);
app.use(AuthenticationRouter);

app.use(errorHandler);

module.exports = app;
