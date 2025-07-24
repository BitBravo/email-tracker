const { Sequelize, DataTypes } = require("sequelize");

const sequelize = new Sequelize(
  "postgres://user:password@localhost:5432/email_tracker"
);
const EmailLog = sequelize.define("EmailLog", {
  email_id: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false },
  people: { type: DataTypes.STRING, allowNull: false },
  status: { type: DataTypes.STRING, defaultValue: "Sent" },
  opened_at: { type: DataTypes.DATE },
  sent_at: { type: DataTypes.DATE, defaultValue: Sequelize.NOW },
});

module.exports = { sequelize, EmailLog };
