const request = require("supertest");
const app = require("../src/app");
const User = require("../src/user/User");
const sequelize = require("../src/config/database");
const bcrypt = require("bcrypt");
const AuthenticationRouter = require("../src/auth/AuthenticationRouter");

beforeAll(async () => {
  await sequelize.sync();
});

beforeEach(async () => {
  await User.destroy({ truncate: true });
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

const postAuthentication = async (credentials) => {
  return await request(app).post("/api/1.0/auth").send(credentials);
};

describe("Authentication", () => {
  it("returns 200 when credentials are correct", async () => {
    await addUser();
    const response = await postAuthentication({
      email: "user1@example.com",
      password: "P4ssword",
    });
    expect(response.status).toBe(200);
  });

  it("returns only user id and username when login successful", async () => {
    const user = await addUser();
    const response = await postAuthentication({
      email: "user1@example.com",
      password: "P4ssword",
    });
    expect(response.body.id).toBe(user.id);
    expect(response.body.username).toBe(user.username);
    expect(Object.keys(response.body)).toEqual(["id", "username"]);
  });

  it("returns 401 when user does not exist", async () => {
    const response = await postAuthentication({
      email: "user1@example.com",
      password: "P4ssword",
    });
    expect(response.status).toBe(401);
  });

  it("returns proper error body when authentication fails", async () => {
    const nowInMillis = new Date().getTime();
    const response = await postAuthentication({
      email: "user1@example.com",
      password: "P4ssword",
    });
    const error = response.body;
    expect(error.path).toBe("/api/1.0/auth");
    expect(error.timestamp).toBeGreaterThan(nowInMillis);
    expect(Object.keys(error)).toEqual(["path", "timestamp", "message"]);
  });

  it("returns Incorrect credentials message when authentication fails", async () => {
    const response = await postAuthentication({
      email: "user1@example.com",
      password: "P4ssword",
    });
    expect(response.body.message).toBe("Incorrect credentials");
  });

  it("returns 401 when password is incorrect", async () => {
    await addUser();
    const response = await postAuthentication({
      email: "user1@example.com",
      password: "wrong-password",
    });
    expect(response.status).toBe(401);
  });

  it("returns 403 when logging in with an inactive user", async () => {
    await addUser({ ...activeUser, inactive: true });
    const response = await postAuthentication({
      email: "user1@example.com",
      password: "P4ssword",
    });
    expect(response.status).toBe(403);
  });

  it("returns proper error body with inactive authentication failure", async () => {
    await addUser({ ...activeUser, inactive: true });
    const nowInMillis = new Date().getTime();
    const response = await postAuthentication({
      email: "user1@example.com",
      password: "P4ssword",
    });
    const error = response.body;
    expect(error.path).toBe("/api/1.0/auth");
    expect(error.timestamp).toBeGreaterThan(nowInMillis);
    expect(Object.keys(error)).toEqual(["path", "timestamp", "message"]);
  });

  it("returns Account is inactive message when authentication fails", async () => {
    await addUser({ ...activeUser, inactive: true });
    const response = await postAuthentication({
      email: "user1@example.com",
      password: "P4ssword",
    });
    expect(response.body.message).toBe("Account is inactive");
  });

  it("returns 401 when email is not valid", async () => {
    const response = await postAuthentication({
      password: "P4ssword",
    });
    expect(response.status).toBe(401);
  });

  it("returns 401 when password is not valid", async () => {
    const response = await postAuthentication({
      email: "user1@example.com",
    });
    expect(response.status).toBe(401);
  });
});
