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

const putUser = (id = 5, body = null, options = {}) => {
  let agent = request(app).put(`/api/1.0/users/${id}`);
  if (options.auth) {
    const { email, password } = options.auth;
    agent = agent.auth(email, password);
  }
  return agent.send(body);
};

describe("User Update", () => {
  it("returns forbidden when request is sent without basic authorization", async () => {
    const response = await putUser();
    expect(response.status).toBe(403);
  });

  it("returns error body with message You are not authorized to update this user when unaothorized request", async () => {
    const nowInMillis = new Date().getTime();
    const response = await putUser();
    expect(response.body.path).toBe("/api/1.0/users/5");
    expect(response.body.timestamp).toBeGreaterThan(nowInMillis);
    expect(response.body.message).toBe(
      "You are not authorized to update this user",
    );
  });

  it("returns forbidden when request is sent with incorrect email in basic authorization", async () => {
    await addUser();
    const response = await putUser(5, null, {
      auth: { email: "wrong@example.com", password: "P4ssword" },
    });
    expect(response.status).toBe(403);
  });

  it("returns forbidden when request is sent with incorrect password in basic authorization", async () => {
    await addUser();
    const response = await putUser(5, null, {
      auth: { email: "user1@example.com", password: "wrongpassword" },
    });
    expect(response.status).toBe(403);
  });

  it("returns forbidden when request is sent with correct credentials but for a different user", async () => {
    await addUser();
    const userToBeUpdated = await addUser({
      ...activeUser,
      email: "user2@example.com",
    });
    const response = await putUser(userToBeUpdated.id, null, {
      auth: { email: "user1@example.com", password: "P4ssword" },
    });
    expect(response.status).toBe(403);
  });

  it("returns forbidden when request is sent by inactive user with correct credentials", async () => {
    const inactiveUser = await addUser({ ...activeUser, inactive: true });
    const response = await putUser(inactiveUser.id, null, {
      auth: { email: "user1@example.com", password: "P4ssword" },
    });
    expect(response.status).toBe(403);
  });

  it("returns 200 when valid updated request is sent from autorized user", async () => {
    const savedUser = await addUser();
    const validUpdate = { username: "updated-user" };
    const response = await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: "P4ssword" },
    });
    expect(response.status).toBe(200);
  });

  it("updates username in database when valid updated request is sent from autorized user", async () => {
    const savedUser = await addUser();
    const validUpdate = { username: "updated-user" };
    await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: "P4ssword" },
    });
    const inDBUser = await User.findOne({ where: { id: savedUser.id } });
    expect(inDBUser.username).toBe("updated-user");
  });
});
