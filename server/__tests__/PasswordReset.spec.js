const request = require("supertest");
const app = require("../src/app");
const User = require("../src/user/User");
const sequelize = require("../src/config/database");
const bcrypt = require("bcrypt");
const AuthenticationRouter = require("../src/auth/AuthenticationRouter");
const SMTPServer = require("smtp-server").SMTPServer;
const config = require("config");
const { passwordResetRequest } = require("../src/user/UserService");

let lastMail, server;
let simulatedSmtpFailure = false;

beforeAll(async () => {
  server = new SMTPServer({
    authOptional: true,
    onData(stream, session, callback) {
      let mailBody;
      stream.on("data", (data) => {
        mailBody += data.toString();
      });
      stream.on("end", () => {
        if (simulatedSmtpFailure) {
          const err = new Error("Invalid mailbox");
          err.responseCode = 553;
          return callback(err);
        }
        lastMail = mailBody;
        callback();
      });
    },
  });
  await server.listen(config.mail.port, "localhost");
  await sequelize.sync();
  jest.setTimeout(20000);
});

beforeEach(async () => {
  simulatedSmtpFailure = false;
  await User.destroy({ truncate: { cascade: true } });
});

afterAll(async () => {
  await server.close();
  jest.setTimeout(5000);
});

const activeUser = {
  username: "user1",
  email: "user1@example.com",
  password: "P4ssword",
  inactive: false,
};

const addUser = async (user = { ...activeUser }) => {
  const hash = await bcrypt.hashSync(user.password, 10);
  user.password = hash;
  return await User.create(user);
};

const postPasswordReset = async (email = "user1@example.com", options = {}) => {
  const agent = request(app).post("/api/1.0/user/password");
  return agent.send({ email });
};

describe("Password Reset Flow", () => {
  it("returns 404 when password reset request is sent from unknown email", async () => {
    const response = await postPasswordReset();
    expect(response.status).toBe(404);
  });

  it("returns error body with message Email not found when unauthorized request", async () => {
    const nowInMillis = new Date().getTime();
    const response = await postPasswordReset();
    expect(response.body.path).toBe("/api/1.0/user/password");
    expect(response.body.timestamp).toBeGreaterThan(nowInMillis);
    expect(response.body.message).toBe("Email not found");
  });

  it("returns 400 with validation error response when request does not have valid email", async () => {
    const response = await postPasswordReset((email = "invalid-email"));
    expect(response.body.validationErrors.email).toBe("Email is not valid");
    expect(response.status).toBe(400);
  });

  it("returns 200 ok when a password reset request is sent for known email", async () => {
    const user = await addUser();
    const response = await postPasswordReset(user.email);
    expect(response.status).toBe(200);
  });

  it("returns Check your email for resetting your password when a password reset request is sent for known email", async () => {
    const user = await addUser();
    const response = await postPasswordReset(user.email);
    expect(response.body.message).toBe(
      "Check your email for resetting your password",
    );
  });

  it("creates passwordResetToken when a password reset request is sent for known email", async () => {
    const user = await addUser();
    await postPasswordReset(user.email);
    const userInDB = await User.findOne({ where: { email: user.email } });
    expect(userInDB.passwordResetToken).toBeTruthy();
  });

  it("sends a password reset email with passwordResetToken", async () => {
    const user = await addUser();
    await postPasswordReset(user.email);
    const userInDB = await User.findOne({ where: { email: user.email } });
    const passwordResetToken = userInDB.passwordResetToken;
    expect(lastMail).toContain("user1@example.com");
    expect(lastMail).toContain(passwordResetToken);
  });

  it("returns 502 Bad Gateway when sending email fails", async () => {
    simulatedSmtpFailure = true;
    const user = await addUser();
    const response = await postPasswordReset(user.email);
    expect(response.status).toBe(502);
  });
});

describe("Password update", () => {
  it("returns 403 when password update request does not have the valid password reset token", async () => {
    const response = await request(app)
      .put("/api/1.0/user/password")
      .send({ password: "P4ssword", passwordResetToken: "token" });
    expect(response.status).toBe(403);
  });
});
