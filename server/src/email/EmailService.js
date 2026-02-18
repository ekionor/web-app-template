const transporter = require("../config/emailTransporter");

const sendAccountActivationEmail = async (email, token) => {
  await transporter.sendMail({
    from: "My App <info@my-app.com>",
    to: email,
    subject: "Account Activation",
    html: `Please click <a href="http://localhost:3000/activate/${token}">here</a> to activate your account.`,
  });
};

module.exports = { sendAccountActivationEmail };
