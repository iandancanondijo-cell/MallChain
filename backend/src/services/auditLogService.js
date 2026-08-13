const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

/**
 * Log an audit event
 * @param {Object} params - Audit log parameters
 * @param {string} params.action - Action performed (e.g., 'campaign.create', 'balance.credit')
 * @param {string} params.actor - User ID or system identifier
 * @param {string} [params.actorType] - Type of actor ('user', 'admin', 'system')
 * @param {string} [params.resourceType] - Type of resource affected
 * @param {string} [params.resourceId] - ID of resource affected
 * @param {Object} [params.details] - Additional details about the action
 * @param {string} [params.outcome] - Outcome ('success', 'failure', 'partial')
 * @param {string} [params.errorMessage] - Error message if outcome is failure
 * @param {Object} req - Express request object for IP, user agent, request ID
 */
async function logAuditEvent(params, req = null) {
  try {
    const {
      action,
      actor,
      actorType = 'user',
      resourceType,
      resourceId,
      details = {},
      outcome = 'success',
      errorMessage,
    } = params;

    if (!action || !actor) {
      throw new Error('action and actor are required for audit logging');
    }

    const auditLog = await AuditLog.create({
      action,
      actor,
      actorType,
      resourceType,
      resourceId,
      details,
      ipAddress: req?.ip || req?.socket?.remoteAddress,
      userAgent: req?.headers?.['user-agent'],
      requestId: req?.id,
      outcome,
      errorMessage,
    });

    logger.info('Audit log created', {
      auditId: auditLog._id,
      action,
      actor,
      outcome,
    });

    return auditLog;
  } catch (error) {
    // Don't throw - audit logging failures should not break the main flow
    logger.error('Failed to create audit log', { error: error.message, params });
    return null;
  }
}

/**
 * Query audit logs with filters
 * @param {Object} filters - Query filters
 * @param {string} [filters.action] - Filter by action
 * @param {string} [filters.actor] - Filter by actor
 * @param {string} [filters.resourceType] - Filter by resource type
 * @param {string} [filters.resourceId] - Filter by resource ID
 * @param {Date} [filters.startDate] - Start date for range query
 * @param {Date} [filters.endDate] - End date for range query
 * @param {number} [filters.limit] - Maximum number of results
 * @param {number} [filters.skip] - Number of results to skip
 */
async function queryAuditLogs(filters = {}) {
  try {
    const {
      action,
      actor,
      resourceType,
      resourceId,
      startDate,
      endDate,
      limit = 100,
      skip = 0,
    } = filters;

    const query = {};

    if (action) query.action = action;
    if (actor) query.actor = actor;
    if (resourceType) query.resourceType = resourceType;
    if (resourceId) query.resourceId = resourceId;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = startDate;
      if (endDate) query.createdAt.$lte = endDate;
    }

    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    const total = await AuditLog.countDocuments(query);

    return { logs, total };
  } catch (error) {
    logger.error('Failed to query audit logs', { error: error.message, filters });
    throw error;
  }
}

module.exports = {
  logAuditEvent,
  queryAuditLogs,
};
