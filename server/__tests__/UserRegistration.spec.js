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
});
