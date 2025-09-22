import { EventEmitter } from 'events';
import { appLogger } from './logger';
import { monitoringSystem } from './monitoring';
import { securityManager } from './security';

export interface ErrorContext {
  operation?: string;
  userId?: string;
  requestId?: string;
  strategy?: string;
  additionalData?: any;
}

export interface RecoveryAction {
  type: 'retry' | 'fallback' | 'circuit_breaker' | 'alert' | 'restart';
  maxAttempts?: number;
  delay?: number;
  fallbackFunction?: () => Promise<any>;
  threshold?: number;
}

export class ErrorHandler extends EventEmitter {
  private static instance: ErrorHandler;
  private errorCounts: Map<string, number> = new Map();
  private circuitBreakers: Map<string, { failures: number; lastFailure: number; state: 'closed' | 'open' | 'half-open' }> = new Map();
  private readonly MAX_ERRORS_PER_OPERATION = 10;
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 300000; // 5 minutes

  private constructor() {
    super();
    this.setupGlobalErrorHandlers();
  }

  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  private setupGlobalErrorHandlers(): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      this.handleError(error, {
        operation: 'uncaught_exception',
        additionalData: { type: 'uncaught_exception' }
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      this.handleError(error, {
        operation: 'unhandled_rejection',
        additionalData: { type: 'unhandled_rejection', promise: promise.toString() }
      });
    });

    // Handle SIGTERM
    process.on('SIGTERM', () => {
      this.handleError(new Error('SIGTERM received'), {
        operation: 'sigterm',
        additionalData: { type: 'sigterm' }
      });
    });

    // Handle SIGINT
    process.on('SIGINT', () => {
      this.handleError(new Error('SIGINT received'), {
        operation: 'sigint',
        additionalData: { type: 'sigint' }
      });
    });
  }

  /**
   * Handle errors with context and recovery actions
   */
  public async handleError(
    error: Error,
    context: ErrorContext = {},
    recoveryActions: RecoveryAction[] = []
  ): Promise<any> {
    const errorKey = this.getErrorKey(error, context);
    
    // Log the error
    appLogger.logError(error, context);

    // Update error counts
    this.updateErrorCount(errorKey);

    // Check circuit breaker
    if (this.isCircuitBreakerOpen(errorKey)) {
      throw new Error(`Circuit breaker is open for operation: ${context.operation}`);
    }

    // Record security event if it's a security-related error
    if (this.isSecurityError(error)) {
      const securityEvent = securityManager.createSecurityEvent(
        'error',
        'high',
        `Security error: ${error.message}`,
        { ...context, error: error.message }
      );
      monitoringSystem.recordSecurityEvent(securityEvent);
    }

    // Execute recovery actions
    for (const action of recoveryActions) {
      try {
        const result = await this.executeRecoveryAction(action, error, context);
        if (result !== undefined) {
          return result;
        }
      } catch (recoveryError) {
        appLogger.logError(recoveryError as Error, {
          operation: 'recovery_action_failed',
          originalError: error.message,
          recoveryAction: action.type
        });
      }
    }

    // Emit error event for external handling
    this.emit('error', { error, context, errorKey });

    // If no recovery actions succeeded, re-throw the error
    throw error;
  }

  /**
   * Execute a recovery action
   */
  private async executeRecoveryAction(
    action: RecoveryAction,
    error: Error,
    context: ErrorContext
  ): Promise<any> {
    switch (action.type) {
      case 'retry':
        return await this.retryOperation(action, error, context);
      
      case 'fallback':
        return await this.executeFallback(action, error, context);
      
      case 'circuit_breaker':
        return await this.handleCircuitBreaker(action, error, context);
      
      case 'alert':
        return await this.sendAlert(action, error, context);
      
      case 'restart':
        return await this.restartService(action, error, context);
      
      default:
        throw new Error(`Unknown recovery action type: ${action.type}`);
    }
  }

  /**
   * Retry operation with exponential backoff
   */
  private async retryOperation(
    action: RecoveryAction,
    error: Error,
    context: ErrorContext
  ): Promise<any> {
    const maxAttempts = action.maxAttempts || 3;
    const baseDelay = action.delay || 1000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Wait before retry (exponential backoff)
        if (attempt > 1) {
          const delay = baseDelay * Math.pow(2, attempt - 2);
          await this.sleep(delay);
        }

        appLogger.logSystemEvent('Retrying operation', {
          operation: context.operation,
          attempt,
          maxAttempts,
          error: error.message
        });

        // Re-throw the original error to trigger retry
        throw error;

      } catch (retryError) {
        if (attempt === maxAttempts) {
          throw retryError;
        }
      }
    }
  }

  /**
   * Execute fallback function
   */
  private async executeFallback(
    action: RecoveryAction,
    error: Error,
    context: ErrorContext
  ): Promise<any> {
    if (!action.fallbackFunction) {
      throw new Error('Fallback function not provided');
    }

    appLogger.logSystemEvent('Executing fallback', {
      operation: context.operation,
      error: error.message
    });

    return await action.fallbackFunction();
  }

  /**
   * Handle circuit breaker logic
   */
  private async handleCircuitBreaker(
    action: RecoveryAction,
    error: Error,
    context: ErrorContext
  ): Promise<any> {
    const threshold = action.threshold || this.CIRCUIT_BREAKER_THRESHOLD;
    const errorKey = this.getErrorKey(error, context);
    
    const circuitBreaker = this.circuitBreakers.get(errorKey) || {
      failures: 0,
      lastFailure: 0,
      state: 'closed' as const
    };

    circuitBreaker.failures++;
    circuitBreaker.lastFailure = Date.now();

    if (circuitBreaker.failures >= threshold) {
      circuitBreaker.state = 'open';
      appLogger.logSystemEvent('Circuit breaker opened', {
        operation: context.operation,
        failures: circuitBreaker.failures,
        threshold
      });
    }

    this.circuitBreakers.set(errorKey, circuitBreaker);
    throw error;
  }

  /**
   * Send alert notification
   */
  private async sendAlert(
    action: RecoveryAction,
    error: Error,
    context: ErrorContext
  ): Promise<void> {
    appLogger.logSystemEvent('Sending alert', {
      operation: context.operation,
      error: error.message,
      severity: 'high'
    });

    // In a real implementation, you would send alerts via email, Slack, etc.
    // For now, we'll just log it as a high-priority event
    const securityEvent = securityManager.createSecurityEvent(
      'error',
      'critical',
      `Critical error requiring attention: ${error.message}`,
      { ...context, error: error.message }
    );
    monitoringSystem.recordSecurityEvent(securityEvent);
  }

  /**
   * Restart service
   */
  private async restartService(
    action: RecoveryAction,
    error: Error,
    context: ErrorContext
  ): Promise<void> {
    appLogger.logSystemEvent('Restarting service', {
      operation: context.operation,
      error: error.message
    });

    // In a real implementation, you would restart the service
    // For now, we'll just exit the process
    process.exit(1);
  }

  /**
   * Check if circuit breaker is open
   */
  private isCircuitBreakerOpen(errorKey: string): boolean {
    const circuitBreaker = this.circuitBreakers.get(errorKey);
    if (!circuitBreaker) {
      return false;
    }

    if (circuitBreaker.state === 'open') {
      // Check if timeout has passed
      if (Date.now() - circuitBreaker.lastFailure > this.CIRCUIT_BREAKER_TIMEOUT) {
        circuitBreaker.state = 'half-open';
        this.circuitBreakers.set(errorKey, circuitBreaker);
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Update error count for an operation
   */
  private updateErrorCount(errorKey: string): void {
    const currentCount = this.errorCounts.get(errorKey) || 0;
    this.errorCounts.set(errorKey, currentCount + 1);

    // Clean up old error counts periodically
    if (currentCount > this.MAX_ERRORS_PER_OPERATION) {
      this.errorCounts.delete(errorKey);
    }
  }

  /**
   * Get unique key for error tracking
   */
  private getErrorKey(error: Error, context: ErrorContext): string {
    return `${context.operation || 'unknown'}-${error.name}`;
  }

  /**
   * Check if error is security-related
   */
  private isSecurityError(error: Error): boolean {
    const securityKeywords = [
      'unauthorized',
      'forbidden',
      'authentication',
      'authorization',
      'permission',
      'access denied',
      'invalid signature',
      'rate limit',
      'suspicious'
    ];

    const errorMessage = error.message.toLowerCase();
    return securityKeywords.some(keyword => errorMessage.includes(keyword));
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get error statistics
   */
  public getErrorStatistics(): {
    totalErrors: number;
    errorCounts: Record<string, number>;
    circuitBreakers: Record<string, any>;
  } {
    return {
      totalErrors: Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0),
      errorCounts: Object.fromEntries(this.errorCounts),
      circuitBreakers: Object.fromEntries(this.circuitBreakers)
    };
  }

  /**
   * Reset error counts and circuit breakers
   */
  public reset(): void {
    this.errorCounts.clear();
    this.circuitBreakers.clear();
    appLogger.logSystemEvent('Error handler reset');
  }
}

// Export singleton instance
export const errorHandler = ErrorHandler.getInstance();
