const express = require("express");
const router = express.Router();
const UserService = require("./UserService");
const { check, validationResult } = require("express-validator");
const ValidationException = require("../error/ValidationException");

router.post(
  "/api/1.0/users",
  check("username")
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage("Username cannot be null"),
  check("email")
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage("Email cannot be null")
    .bail()
    .isEmail()
    .withMessage("Email is not valid")
    .bail()
    .custom(async (email) => {
      const user = await UserService.findByEmail(email);
      if (user) {
        throw new Error("Email in use");
      }
    }),
  check("password")
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage("Password cannot be null"),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ValidationException(errors.array()));
    }
    try {
      await UserService.save(req.body);
      return res.send({ message: "User created" });
    } catch (error) {
      next(error);
    }
  },
);

router.post("/api/1.0/users/token/:token", async (req, res, next) => {
  const token = req.params.token;
  try {
    await UserService.activate(token);
    return res.send({ message: "Account is activated" });
  } catch (err) {
    next(err);
  }
});
module.exports = router;
