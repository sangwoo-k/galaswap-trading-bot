import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { loggingConfig } from '../config';
import { SecurityEvent } from '../types';

// Ensure logs directory exists
const logDir = path.dirname(loggingConfig.filePath);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...meta
    });
  })
);

// Create logger instance
export const logger = winston.createLogger({
  level: loggingConfig.level,
  format: logFormat,
  defaultMeta: { service: 'galaswap-trading-bot' },
  transports: [
    // File transport for all logs
    new winston.transports.File({
      filename: loggingConfig.filePath,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    // Separate file for errors
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    // Separate file for security events
    new winston.transports.File({
      filename: path.join(logDir, 'security.log'),
      level: 'info',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      tailable: true,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

export class Logger {
  private static instance: Logger;

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Log trading activity
   */
  public logTrade(
    action: string,
    details: {
      tokenIn: string;
      tokenOut: string;
      amountIn: string;
      amountOut: string;
      price: number;
      transactionHash?: string;
    }
  ): void {
    logger.info('Trade executed', {
      type: 'trade',
      action,
      ...details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log API calls
   */
  public logApiCall(
    method: string,
    endpoint: string,
    statusCode: number,
    responseTime: number,
    requestData?: any,
    responseData?: any
  ): void {
    logger.info('API call', {
      type: 'api',
      method,
      endpoint,
      statusCode,
      responseTime,
      requestData: this.sanitizeLogData(requestData),
      responseData: this.sanitizeLogData(responseData)
    });
  }

  /**
   * Log security events
   */
  public logSecurityEvent(event: SecurityEvent): void {
    const logLevel = this.getSecurityLogLevel(event.severity);
    
    logger.log(logLevel, 'Security event', {
      type: 'security',
      eventType: event.type,
      severity: event.severity,
      message: event.message,
      metadata: event.metadata,
      timestamp: event.timestamp.toISOString()
    });
  }

  /**
   * Log errors with context
   */
  public logError(
    error: Error,
    context?: {
      operation?: string;
      userId?: string;
      requestId?: string;
      additionalData?: any;
    }
  ): void {
    logger.error('Error occurred', {
      type: 'error',
      message: error.message,
      stack: error.stack,
      ...context,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log performance metrics
   */
  public logPerformance(
    operation: string,
    duration: number,
    metrics?: Record<string, number>
  ): void {
    logger.info('Performance metric', {
      type: 'performance',
      operation,
      duration,
      metrics,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log system events
   */
  public logSystemEvent(
    event: string,
    details?: Record<string, any>
  ): void {
    logger.info('System event', {
      type: 'system',
      event,
      ...details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get log level based on security event severity
   */
  private getSecurityLogLevel(severity: SecurityEvent['severity']): string {
    switch (severity) {
      case 'low':
        return 'info';
      case 'medium':
        return 'warn';
      case 'high':
        return 'error';
      case 'critical':
        return 'error';
      default:
        return 'info';
    }
  }

  /**
   * Sanitize sensitive data from logs
   */
  private sanitizeLogData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sensitiveKeys = [
      'privateKey',
      'password',
      'secret',
      'token',
      'key',
      'signature'
    ];

    const sanitized = { ...data };

    for (const key of sensitiveKeys) {
      if (key in sanitized) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Create audit trail for trading operations
   */
  public createAuditTrail(
    operation: string,
    userId: string,
    details: Record<string, any>
  ): void {
    logger.info('Audit trail', {
      type: 'audit',
      operation,
      userId,
      details: this.sanitizeLogData(details),
      timestamp: new Date().toISOString(),
      ip: details.ip || 'unknown',
      userAgent: details.userAgent || 'unknown'
    });
  }
}

// Export singleton instance
export const appLogger = Logger.getInstance();
