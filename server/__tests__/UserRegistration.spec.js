const request = require("supertest");
const app = require("../src/app");
const User = require("../src/user/User");
const sequelize = require("../src/config/database");

beforeAll(async () => {
  await sequelize.sync();
});

beforeEach(async () => {
  await User.destroy({ truncate: true });
});

describe("User Registration", () => {
  const validUser = {
    username: "user1",
    email: "user1@mail.com",
    password: "P4ssword",
  };

  const postUser = (user = validUser) => {
    return request(app).post("/api/1.0/users").send(user);
  };

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

  it("returns Username cannot be null when username is null", async () => {
    const response = await postUser({
      ...validUser,
      username: null,
    });
    const body = response.body;
    expect(body.validationErrors.username).toBe("Username cannot be null");
  });

  it("returns Email cannot be null when email is null", async () => {
    const response = await postUser({
      ...validUser,
      email: null,
    });
    const body = response.body;
    expect(body.validationErrors.email).toBe("Email cannot be null");
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

  it("returns password cannot be null when password is null", async () => {
    const response = await postUser({
      ...validUser,
      password: null,
    });
    const body = response.body;
    expect(body.validationErrors.password).toBe("Password cannot be null");
  });
});
