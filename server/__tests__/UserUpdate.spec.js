const request = require("supertest");
const app = require("../src/app");
const User = require("../src/user/User");
const sequelize = require("../src/config/database");
const bcrypt = require("bcrypt");
const AuthenticationRouter = require("../src/auth/AuthenticationRouter");
const fs = require("fs");
const path = require("path");
const config = require("config");

const { uploadDir, profileDir } = config;
const profileDirectory = path.join(".", uploadDir, profileDir);

const validUser = {
  username: "user1",
  email: "user1@example.com",
  password: "P4ssword",
};

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

const putUser = async (id = 5, body = null, options = {}) => {
  let agent = request(app);

  let token;
  if (options.auth) {
    const response = await agent.post("/api/1.0/auth").send(options.auth);
    token = response.body.token;
  }
  agent = request(app).put(`/api/1.0/users/${id}`);
  if (token) {
    agent.set("Authorization", `Bearer ${token}`);
  }
  if (options.token) {
    agent.set("Authorization", `Bearer ${options.token}`);
  }
  return agent.send(body);
};

const readFileAsBase64 = (file = "test-png.png") => {
  const filePath = path.join(".", "__tests__", "resources", file);
  return fs.readFileSync(filePath, { encoding: "base64" });
};

describe("User Update", () => {
  it("returns forbidden when request is sent without basic authorization", async () => {
    const response = await putUser();
    expect(response.status).toBe(403);
  });

  it("returns error body with message You are not authorized to update this user when unauthorized request", async () => {
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

  it("returns 403 when token is not valid", async () => {
    const response = await putUser(5, null, { token: "123" });
    expect(response.status).toBe(403);
  });

  it("saves the user image when update contains image as base64", async () => {
    const fileInBase64 = readFileAsBase64();
    const savedUser = await addUser();
    const validUpdate = { username: "updated-user", image: fileInBase64 };
    await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: "P4ssword" },
    });
    const inDBUser = await User.findOne({ where: { id: savedUser.id } });
    expect(inDBUser.image).toBeTruthy();
  });

  it("returns success body having only id, username, email and image", async () => {
    const fileInBase64 = readFileAsBase64();
    const savedUser = await addUser();
    const validUpdate = { username: "updated-user", image: fileInBase64 };
    const response = await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: "P4ssword" },
    });

    expect(Object.keys(response.body)).toEqual([
      "id",
      "username",
      "email",
      "image",
    ]);
  });

  it("saves the user image to upload folder and stores filename in user when update has image", async () => {
    const fileInBase64 = readFileAsBase64();
    const savedUser = await addUser();
    const validUpdate = { username: "updated-user", image: fileInBase64 };
    await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: "P4ssword" },
    });
    const inDBUser = await User.findOne({ where: { id: savedUser.id } });
    const profileImagePath = path.join(profileDirectory, inDBUser.image);
    expect(fs.existsSync(profileImagePath)).toBe(true);
  });

  it("removes the old image after user uploads new one", async () => {
    const fileInBase64 = readFileAsBase64();
    const savedUser = await addUser();
    const validUpdate = { username: "updated-user", image: fileInBase64 };
    const response = await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: "P4ssword" },
    });
    const firstImage = response.body.image;
    await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: "P4ssword" },
    });

    const profileImagePath = path.join(profileDirectory, firstImage);
    expect(fs.existsSync(profileImagePath)).toBe(false);
  });

  it.each`
    field         | value   | message
    ${"username"} | ${null} | ${"Username cannot be null"}
  `(
    "returns bad request with $message when username is updated with $value",
    async ({ field, value, message }) => {
      const savedUser = await addUser();
      const invalidUpdate = { username: value };
      const response = await putUser(savedUser.id, invalidUpdate, {
        auth: { email: savedUser.email, password: "P4ssword" },
      });
      expect(response.status).toBe(400);
      expect(response.body.validationErrors.username).toBe(message);
    },
  );

  it("returns 200 when image size is 2mb", async () => {
    const testPng = readFileAsBase64();
    const pngByte = Buffer.from(testPng, "base64").length;
    const twoMB = 1024 * 1024 * 2;
    const filling = "a".repeat(twoMB - pngByte);
    const fillBase64 = Buffer.from(filling).toString("base64");
    const savedUser = await addUser();
    const validUpdate = {
      username: "updated-user",
      image: testPng + fillBase64,
    };
    const response = await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: "P4ssword" },
    });
    expect(response.status).toBe(200);
  });

  it("returns 200 when image size exceeds 2mb", async () => {
    const fileExceeding2MB = "a".repeat(1024 * 1024 * 2) + "a";
    const fileInBase64 = Buffer.from(fileExceeding2MB).toString("base64");
    const savedUser = await addUser();
    const invalidUpdate = { username: "updated-user", image: fileInBase64 };
    const response = await putUser(savedUser.id, invalidUpdate, {
      auth: { email: savedUser.email, password: "P4ssword" },
    });
    expect(response.status).toBe(400);
  });

  it("keeps the old image after user only updates username", async () => {
    const fileInBase64 = readFileAsBase64();
    const savedUser = await addUser();
    const validUpdate = { username: "updated-user", image: fileInBase64 };
    const response = await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: "P4ssword" },
    });
    const firstImage = response.body.image;
    await putUser(
      savedUser.id,
      { username: "updated-user-again" },
      {
        auth: { email: savedUser.email, password: "P4ssword" },
      },
    );

    const profileImagePath = path.join(profileDirectory, firstImage);
    expect(fs.existsSync(profileImagePath)).toBe(true);

    const userInDB = await User.findOne({ where: { id: savedUser.id } });
    expect(userInDB.image).toBe(firstImage);
  });

  it("returns Image cannot be bigger than 2MB when file size exceeds 2 MB", async () => {
    const fileExceeding2MB = "a".repeat(1024 * 1024 * 2) + "a";
    const fileInBase64 = Buffer.from(fileExceeding2MB).toString("base64");
    const savedUser = await addUser();
    const invalidUpdate = { username: "updated-user", image: fileInBase64 };
    const response = await putUser(savedUser.id, invalidUpdate, {
      auth: { email: savedUser.email, password: "P4ssword" },
    });
    expect(response.body.validationErrors.image).toBe(
      "Image cannot be bigger than 2MB",
    );
  });

  it.each`
    file              | status
    ${"test-gif.gif"} | ${400}
    ${"test-pdf.pdf"} | ${400}
    ${"test-txt.txt"} | ${400}
    ${"test-png.png"} | ${200}
    ${"test-jpg.jpg"} | ${200}
  `(
    "returns $status when uploading $file as image",
    async ({ file, status }) => {
      const fileInBase64 = readFileAsBase64(file);
      const savedUser = await addUser();
      const updateBody = { username: "updated-user", image: fileInBase64 };
      const response = await putUser(savedUser.id, updateBody, {
        auth: { email: savedUser.email, password: "P4ssword" },
      });
      expect(response.status).toBe(status);
    },
  );

  it.each`
    file              | message
    ${"test-gif.gif"} | ${"Only PNG or JPEG files are allowed"}
    ${"test-pdf.pdf"} | ${"Only PNG or JPEG files are allowed"}
    ${"test-txt.txt"} | ${"Only PNG or JPEG files are allowed"}
  `(
    "returns $message when uploading $file as image",
    async ({ file, message }) => {
      const fileInBase64 = readFileAsBase64(file);
      const savedUser = await addUser();
      const updateBody = { username: "updated-user", image: fileInBase64 };
      const response = await putUser(savedUser.id, updateBody, {
        auth: { email: savedUser.email, password: "P4ssword" },
      });
      expect(response.body.validationErrors.image).toBe(message);
    },
  );
});
