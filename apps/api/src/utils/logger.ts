import winston from 'winston';

// Define log formats
// printf previously emitted only `message`, so every structured meta object
// passed as logger.error(msg, { err, alert }) was silently discarded - which is
// why failures showed up as a bare line with no context and why alert keys
// never reached an operator. Meta is now appended as JSON when present.
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info as Record<string, unknown>;
    // Winston stores interpolation args under a symbol key; ignore those and
    // keep only real meta fields.
    const fields = Object.keys(meta).filter((k) => typeof k === 'string' && meta[k] !== undefined);
    let suffix = '';
    if (fields.length > 0) {
      const payload: Record<string, unknown> = {};
      for (const k of fields) payload[k] = meta[k];
      try {
        suffix = ` ${JSON.stringify(payload)}`;
      } catch {
        // A value that cannot be serialised (a cycle, a BigInt) must not take
        // the log line down with it.
        suffix = ' [meta not serialisable]';
      }
    }
    return `${timestamp} [${level}]: ${message}${suffix}`;
  })
);

// Create the logger instance
const logger = winston.createLogger({
  level: 'info', // Default log level
  format: logFormat,
  transports: [
    new winston.transports.Console({ format: logFormat }), // Output to the console
    new winston.transports.File({ filename: 'app.log' })   // Log to a file
  ],
});

// Optionally, add a transport for error logging
/* istanbul ignore next */
if (process.env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      level: 'error',
      filename: 'error.log', // Separate log file for errors
    })
  );
}

export default logger;
