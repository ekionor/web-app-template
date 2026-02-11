const app = require("./src/app");
const sequelize = require("./config/database");

sequelize.sync();

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
