const request = require("supertest");
const app = require("../src/app");
const User = require("../src/user/User");
const sequelize = require("../src/config/database");
const SMTPServer = require("smtp-server").SMTPServer;

let lastmail, server;
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
        lastmail = mailBody;
        callback();
      });
    },
  });
  await server.listen(8587, "localhost");
  await sequelize.sync();
});

beforeEach(async () => {
  simulatedSmtpFailure = false;
  await User.destroy({ truncate: true });
});

afterAll(async () => {
  await server.close();
});

const validUser = {
  username: "user1",
  email: "user1@mail.com",
  password: "P4ssword",
};

const postUser = (user = validUser) => {
  return request(app).post("/api/1.0/users").send(user);
};

describe("User Registration", () => {
  it("returns 200 when signup request is valid", async () => {
    const response = await postUser();
    expect(response.status).toBe(200);
  });

  it("returns success message when signup request is valid", async () => {
    const response = await postUser();
    expect(response.body.message).toBe("User created");
  });

  it("saves user to database", async () => {
    await postUser();
    const users = await User.findAll();
    expect(users.length).toBe(1);
  });

  it("saves username and email to database", async () => {
    await postUser();
    const [user] = await User.findAll();
    expect(user.username).toBe("user1");
    expect(user.email).toBe("user1@mail.com");
  });

  it("hashes the password", async () => {
    await postUser();
    const [user] = await User.findAll();
    expect(user.password).not.toBe("P4ssword");
  });

  it("returns 400 when username is null", async () => {
    const response = await postUser({
      ...validUser,
      username: null,
    });
    expect(response.status).toBe(400);
  });

  it("returns validationErrors field in response body when validation errors occur", async () => {
    const response = await postUser({
      ...validUser,
      username: null,
    });
    const body = response.body;
    expect(body.validationErrors).toBeDefined();
  });

  it("returns errors for both when username and email are null", async () => {
    const response = await postUser({
      ...validUser,
      username: null,
      email: null,
    });
    const body = response.body;
    expect(Object.keys(body.validationErrors)).toEqual(["username", "email"]);
  });

  it.each`
    field         | value         | expectedMessage
    ${"username"} | ${null}       | ${"Username cannot be null"}
    ${"email"}    | ${null}       | ${"Email cannot be null"}
    ${"password"} | ${null}       | ${"Password cannot be null"}
    ${"email"}    | ${"mail.com"} | ${"Email is not valid"}
  `(
    "returns errors for $field when $field is $value",
    async ({ field, value, expectedMessage }) => {
      const user = { ...validUser };
      user[field] = value;
      const response = await postUser(user);
      const body = response.body;
      expect(body.validationErrors[field]).toBe(expectedMessage);
    },
  );

  it("returns Email in use when same email is already in use", async () => {
    await postUser(validUser);
    const response = await postUser({
      ...validUser,
      email: validUser.email,
    });
    const body = response.body;
    expect(response.body.validationErrors.email).toBe("Email in use");
  });

  it("creates user in inactive mode", async () => {
    await postUser();
    const [user] = await User.findAll();
    expect(user.inactive).toBe(true);
  });

  it("creates user in inactive mode even if in request body inactive is set to false", async () => {
    await postUser({ ...validUser, inactive: false });
    const [user] = await User.findAll();
    expect(user.inactive).toBe(true);
  });

  it("creates an activation token for user", async () => {
    await postUser();
    const [user] = await User.findAll();
    expect(user.activationToken).toBeTruthy();
  });

  it("sends an account activation email with activation token", async () => {
    await postUser();
    const [user] = await User.findAll();
    expect(lastmail).toContain("user1@mail.com");
    expect(lastmail).toContain(user.activationToken);
  });

  it("returns 502 Bad Gateway when sending email fails", async () => {
    simulatedSmtpFailure = true;
    const response = await postUser();
    expect(response.status).toBe(502);
  });

  it("returns Email failure message when sending email fails", async () => {
    simulatedSmtpFailure = true;
    const response = await postUser();
    expect(response.body.message).toBe("Email failure");
  });

  it("does not save user to database when activation email fails", async () => {
    simulatedSmtpFailure = true;
    await postUser();
    const users = await User.findAll();
    expect(users.length).toBe(0);
  });

  it("returns validation Failure message in error response body when validation fails", async () => {
    const response = await postUser({
      ...validUser,
      username: null,
    });
    expect(response.body.message).toBe("Validation Failure");
  });
});

describe("Account activation", () => {
  it("activates the account when correct token is sent", async () => {
    await postUser();
    let [user] = await User.findAll();
    const token = user.activationToken;
    await request(app)
      .post("/api/1.0/users/token/" + token)
      .send();
    [user] = await User.findAll();
    expect(user.inactive).toBe(false);
  });

  it("removes the token from user table after successful activation", async () => {
    await postUser();
    let [user] = await User.findAll();
    const token = user.activationToken;
    await request(app)
      .post("/api/1.0/users/token/" + token)
      .send();
    [user] = await User.findAll();
    expect(user.activationToken).toBeFalsy();
  });

  it("does not activate user when token is not valid", async () => {
    await postUser();
    const token = "invalid";
    await request(app)
      .post("/api/1.0/users/token/" + token)
      .send();
    [user] = await User.findAll();
    expect(user.inactive).toBe(true);
  });

  it("returns bad request when token is wrong", async () => {
    await postUser();
    const token = "invalid";
    const response = await request(app)
      .post("/api/1.0/users/token/" + token)
      .send();
    expect(response.status).toBe(400);
  });

  it("returns This account is either active or the token is invalid when token is wrong", async () => {
    await postUser();
    const token = "invalid";
    const response = await request(app)
      .post("/api/1.0/users/token/" + token)
      .send();
    expect(response.body.message).toBe(
      "This account is either active or the token is invalid",
    );
  });

  it("returns Account is activated when token is correct", async () => {
    await postUser();
    let [user] = await User.findAll();
    const token = user.activationToken;
    const response = await request(app)
      .post("/api/1.0/users/token/" + token)
      .send();
    expect(response.body.message).toBe("Account is activated");
  });
});

describe("Error model", () => {
  it("returns path, timestamp, message and validationErrors when validation fails", async () => {
    const response = await postUser({ ...validUser, username: null });
    expect(Object.keys(response.body)).toEqual([
      "path",
      "timestamp",
      "message",
      "validationErrors",
    ]);
  });

  it("returns path, timestamp and message when request fails other than validation errors", async () => {
    const token = "invalid";
    const response = await request(app)
      .post("/api/1.0/users/token/" + token)
      .send();
    expect(Object.keys(response.body)).toEqual([
      "path",
      "timestamp",
      "message",
    ]);
  });

  it("returns path in error body", async () => {
    const token = "invalid";
    const response = await request(app)
      .post("/api/1.0/users/token/" + token)
      .send();
    expect(response.body.path).toEqual("/api/1.0/users/token/" + token);
  });

  it("returns timestamp in milliseconds withing 5 seconds values in error body", async () => {
    const nowInMillis = new Date().getTime();
    const fiveSecondsLaterInMillis = nowInMillis + 5 * 1000;
    const token = "invalid";
    const response = await request(app)
      .post("/api/1.0/users/token/" + token)
      .send();
    expect(response.body.timestamp).toBeGreaterThanOrEqual(nowInMillis);
    expect(response.body.timestamp).toBeLessThanOrEqual(
      fiveSecondsLaterInMillis,
    );
  });
});
