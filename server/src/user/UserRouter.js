const express = require("express");
const router = express.Router();
const UserService = require("./UserService");
const { check, validationResult } = require("express-validator");
const ValidationException = require("../error/ValidationException");
const pagination = require("../middleware/pagination");
const UserNotFoundException = require("./UserNotFoundException");
const User = require("./User");
const ForbiddenException = require("../error/ForbiddenException");
const NotFoundException = require("../error/NotFoundException");
const FileService = require("../file/FileService");

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

router.get(
  "/api/1.0/users",
  pagination,

  async (req, res) => {
    const authenticatedUser = req.authenticatedUser;
    const { page, size } = req.pagination;
    const users = await UserService.getUsers(page, size, authenticatedUser);
    res.send(users);
  },
);

router.get("/api/1.0/users/:id", async (req, res, next) => {
  try {
    const user = await UserService.getUserById(req.params.id);
    res.send(user);
  } catch (err) {
    next(err);
  }
});

router.put(
  "/api/1.0/users/:id",
  check("username")
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage("Username cannot be null"),
  check("image").custom(async (imageAsBase64String) => {
    if (!imageAsBase64String) {
      return true;
    }
    const buffer = Buffer.from(imageAsBase64String, "base64");
    if (!FileService.isLessThan2MB(buffer)) {
      throw new Error("Image cannot be bigger than 2MB");
    }
    const supportedType = await FileService.isSupportedFileType(buffer);
    if (!supportedType) {
      throw new Error("Only PNG or JPEG files are allowed");
    }
    return true;
  }),
  async (req, res, next) => {
    const authenticatedUser = req.authenticatedUser;
    if (!authenticatedUser || authenticatedUser.id != req.params.id) {
      return next(
        new ForbiddenException("You are not authorized to update this user"),
      );
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ValidationException(errors.array()));
    }
    const user = await UserService.updateUser(req.params.id, req.body);
    res.send(user);
  },
);

router.delete(
  "/api/1.0/users/:id",

  async (req, res, next) => {
    const authenticatedUser = req.authenticatedUser;
    if (!authenticatedUser || authenticatedUser.id != req.params.id) {
      return next(
        new ForbiddenException("You are not authorized to delete this user"),
      );
    }
    await UserService.deleteUser(req.params.id);
    res.send();
  },
);

router.post(
  "/api/1.0/user/password",
  check("email").isEmail().withMessage("Email is not valid"),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ValidationException(errors.array()));
    }
    try {
      await UserService.passwordResetRequest(req.body.email);
      return res.send({
        message: "Check your email for resetting your password",
      });
    } catch (err) {
      next(err);
    }
  },
);

const passwordResetTokenValidator = async (req, res, next) => {
  const user = await UserService.findByPasswordResetToken(
    req.body.passwordResetToken,
  );

  if (!user) {
    return next(
      new ForbiddenException("You are not authorized to update your password"),
    );
  }
  next();
};

router.put(
  "/api/1.0/user/password",
  passwordResetTokenValidator,
  async (req, res, next) => {
    await UserService.updatePassword(req.body);
    res.send();
  },
);

module.exports = router;
