const request = require("supertest");
const app = require("../src/app");
const User = require("../src/user/User");
const sequelize = require("../src/config/database");
const bcrypt = require("bcrypt");
const AuthenticationRouter = require("../src/auth/AuthenticationRouter");
const Token = require("../src/auth/Token");

beforeAll(async () => {
  await sequelize.sync();
});

beforeEach(async () => {
  await User.destroy({ truncate: { cascade: true } });
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

const postLogout = async (options = {}) => {
  const agent = request(app).post("/api/1.0/logout");
  if (options.token) {
    agent.set("Authorization", `Bearer ${options.token}`);
  }
  return agent.send();
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

  it("returns user id, username, image and token when login successful", async () => {
    const user = await addUser();
    const response = await postAuthentication({
      email: "user1@example.com",
      password: "P4ssword",
    });
    expect(response.body.id).toBe(user.id);
    expect(response.body.username).toBe(user.username);
    expect(Object.keys(response.body)).toEqual([
      "id",
      "username",
      "image",
      "token",
    ]);
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

  it("returns token in response body when credentials are correct", async () => {
    await addUser();
    const response = await postAuthentication({
      email: "user1@example.com",
      password: "P4ssword",
    });
    expect(response.body.token).toBeDefined();
  });
});

describe("Logout", () => {
  it("returns 200 ok when auauthorized request sent for logout", async () => {
    const response = await postLogout();
    expect(response.status).toBe(200);
  });

  it("removes the token from database", async () => {
    await addUser();
    const response = await postAuthentication({
      email: "user1@example.com",
      password: "P4ssword",
    });
    const token = response.body.token;
    await postLogout({ token: token });
    const tokenInDb = await Token.findOne({ where: { token: token } });
    expect(tokenInDb).toBeNull();
  });
});

describe("Token expiration", () => {
  const putUser = async (id = 5, body = null, options = {}) => {
    let agent = request(app);

    agent = request(app).put(`/api/1.0/users/${id}`);

    if (options.token) {
      agent.set("Authorization", `Bearer ${options.token}`);
    }
    return agent.send(body);
  };

  it("returns 403 when token is older than 1 week", async () => {
    const savedUser = await addUser();
    const token = "test-token";
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - 1); // 1 week and 1 millisecond ago
    await Token.create({
      token: token,
      userId: savedUser.id,
      lastUsedAt: oneWeekAgo,
    });

    const validUpdate = { username: "updatedUser" };
    const response = await putUser(savedUser.id, validUpdate, { token: token });
    expect(response.status).toBe(403);
  });

  it("refreshes token lastUsedAt when used", async () => {
    const savedUser = await addUser();
    const token = "test-token";
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000 - 1); // 4 days and 1 millisecond ago
    await Token.create({
      token: token,
      userId: savedUser.id,
      lastUsedAt: fourDaysAgo,
    });

    const validUpdate = { username: "updatedUser" };
    const rightBeforeUpdate = new Date();
    await putUser(savedUser.id, validUpdate, { token: token });
    const tokenInDb = await Token.findOne({ where: { token: token } });
    expect(tokenInDb.lastUsedAt.getTime()).toBeGreaterThan(
      rightBeforeUpdate.getTime(),
    );
  });

  it("refreshes token lastUsedAt when used for unauthenticated requests", async () => {
    const savedUser = await addUser();
    const token = "test-token";
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000 - 1); // 4 days and 1 millisecond ago
    await Token.create({
      token: token,
      userId: savedUser.id,
      lastUsedAt: fourDaysAgo,
    });

    const rightBeforeUpdate = new Date();
    await request(app)
      .get("/api/1.0/users/5")
      .set("Authorization", `Bearer ${token}`);
    const tokenInDb = await Token.findOne({ where: { token: token } });
    expect(tokenInDb.lastUsedAt.getTime()).toBeGreaterThan(
      rightBeforeUpdate.getTime(),
    );
  });
});
