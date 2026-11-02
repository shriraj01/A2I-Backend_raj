const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const path = require("path");

const logDir = path.join(__dirname, "../loggers");

const logger = winston.createLogger({
  level: "info",
  transports: [
    // Console
    // new winston.transports.Console({
    //   format: winston.format.combine(
    //     winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    //     winston.format.printf(({ timestamp, level, message }) =>
    //       `${timestamp} [${level}] ${message}`
    //     )
    //   ),
    // }),
    
    new DailyRotateFile({
      filename: path.join(logDir, "info-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      level: "info",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format(info => {
          return info.level === 'info' ? info : false;
        })(),
        winston.format.json(),
        winston.format.prettyPrint()  // Removed prettyPrint() for cleaner logs
      ),
    }),
    
    // Error logs - directly in loggers folder
    new DailyRotateFile({
      filename: path.join(logDir, "error-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      level: "error",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.prettyPrint() // Removed prettyPrint() for cleaner logs
      ),
    }),
  ],
});

module.exports = logger;