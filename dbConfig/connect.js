const mysql = require("mysql");
require("dotenv").config();

var pool = mysql.createPool({
    connectionLimit: 10,
    port: process.env.DB_PORT,
    host: process.env.HOST_NAME,
    user: process.env.USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_HRMS,
  });

  var pool1 = mysql.createPool({
    connectionLimit: 10,
    port: process.env.DB_PORT,
    host: process.env.HOST_NAME,
    user: process.env.USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_A2I,
  });

  module.exports = { pool,pool1};