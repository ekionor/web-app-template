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
  const postValidUser = () => {
    return request(app).post("/api/1.0/users").send({
      username: "user1",
      email: "user1@mail.com",
      password: "P4ssword",
    });
  };

  it("returns 200 when signup request is valid", async () => {
    const response = await postValidUser();
    expect(response.status).toBe(200);
  });

  it("returns success message when signup request is valid", async () => {
    const response = await postValidUser();
    expect(response.body.message).toBe("User created");
  });

  it("saves user to database", async () => {
    await postValidUser();
    const users = await User.findAll();
    expect(users.length).toBe(1);
  });

  it("saves username and email to database", async () => {
    await postValidUser();
    const [user] = await User.findAll();
    expect(user.username).toBe("user1");
    expect(user.email).toBe("user1@mail.com");
  });

  it("hashes the password", async () => {
    await postValidUser();
    const [user] = await User.findAll();
    expect(user.password).not.toBe("P4ssword");
  });
});
