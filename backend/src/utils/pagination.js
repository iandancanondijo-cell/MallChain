/**
 * Advanced Pagination Utilities
 * Implements offset, cursor-based, and keyset pagination patterns
 * 
 * Features:
 * - Cursor-based pagination (efficient for large datasets)
 * - Offset-based pagination (familiar for clients)
 * - Keyset pagination (optimal for ordered data)
 * - Automatic query building
 */

const promClient = require('prom-client');

const paginationUsageCounter = new promClient.Counter({
  name: 'pagination_requests_total',
  help: 'Total pagination requests by method',
  labelNames: ['method', 'page_size'],
});

/**
 * Offset-based pagination
 * Traditional page/limit approach
 * Suitable for: small datasets, admin UIs
 * Drawback: O(n) skip performance on large collections
 */
class OffsetPagination {
  static parse(query) {
    const page = Math.max(1, parseInt(query.page || 1, 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || 20, 10)));

    return {
      page,
      limit,
      skip: (page - 1) * limit,
    };
  }

  static async paginate(collection, filter, pagination, sort = { _id: -1 }) {
    const { skip, limit, page } = pagination;

    // Get total count
    const total = await collection.countDocuments(filter);

    // Get documents
    const docs = await collection
      .find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .toArray();

    return {
      docs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }
}

/**
 * Cursor-based pagination
 * Efficient for large datasets
 * Uses base64-encoded cursors pointing to document positions
 * Suitable for: infinite scrolling, large datasets, APIs
 */
class CursorPagination {
  /**
   * Encode cursor from document
   * Cursor encodes the sort key value for resuming pagination
   */
  static encodeCursor(doc, sortField = '_id') {
    const value = doc[sortField];
    const cursor = {
      [sortField]: value,
      _id: doc._id,
    };
    return Buffer.from(JSON.stringify(cursor)).toString('base64');
  }

  /**
   * Decode cursor back to filter
   */
  static decodeCursor(cursorStr, direction = 'next') {
    try {
      const cursor = JSON.parse(Buffer.from(cursorStr, 'base64').toString('utf-8'));
      return cursor;
    } catch (err) {
      return null;
    }
  }

  /**
   * Build query filter from cursor
   */
  static buildCursorFilter(baseFilter, cursor, sortField = '_id', direction = 'next') {
    if (!cursor) return baseFilter;

    const operator = direction === 'next' ? '$gt' : '$lt';
    const cursorValue = cursor[sortField];

    return {
      ...baseFilter,
      [sortField]: { [operator]: cursorValue },
    };
  }

  /**
   * Parse cursor pagination request
   */
  static parse(query) {
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || 20, 10)));
    const cursor = query.cursor || null;
    const sortField = query.sort_by || '_id';
    const direction = query.direction === 'prev' ? 'prev' : 'next';

    return { limit, cursor, sortField, direction };
  }

  /**
   * Paginate using cursors
   */
  static async paginate(collection, baseFilter, pagination, sort = { _id: -1 }) {
    const { limit, cursor, sortField, direction } = pagination;

    // Build filter with cursor
    const filter = cursor
      ? this.buildCursorFilter(baseFilter, this.decodeCursor(cursor), sortField, direction)
      : baseFilter;

    // Fetch limit + 1 to detect if there are more results
    const docs = await collection
      .find(filter)
      .sort(sort)
      .limit(limit + 1)
      .toArray();

    // Check if there are more results
    const hasMore = docs.length > limit;
    if (hasMore) {
      docs.pop(); // Remove the extra document
    }

    // Generate next/prev cursors
    const nextCursor = docs.length > 0
      ? this.encodeCursor(docs[docs.length - 1], sortField)
      : null;

    const prevCursor = cursor ? cursor : null; // Keep track of current cursor for backward nav

    return {
      docs,
      pagination: {
        cursor: nextCursor,
        prevCursor,
        hasMore,
        count: docs.length,
        limit,
      },
    };
  }
}

/**
 * Keyset pagination (seek method)
 * Most efficient for large datasets with guaranteed order
 * Uses the last row's sort key to find next page
 * Suitable for: API results, large datasets, consistent ordering required
 */
class KeysetPagination {
  /**
   * Build keyset filter
   */
  static buildKeysetFilter(baseFilter, keysetValues, sortFields, direction = 'next') {
    if (!keysetValues) return baseFilter;

    const operator = direction === 'next' ? '$gt' : '$lt';

    // Build compound filter for multiple sort fields
    const keysetFilter = {
      $or: sortFields.map((field, index) => {
        const conditions = { ...baseFilter };

        // All fields before this one must match exactly
        for (let i = 0; i < index; i++) {
          conditions[sortFields[i]] = keysetValues[i];
        }

        // This field must be greater/less than the keyset value
        conditions[field] = { [operator]: keysetValues[index] };

        return conditions;
      }),
    };

    return keysetFilter;
  }

  /**
   * Extract keyset from last document
   */
  static extractKeyset(doc, sortFields) {
    return sortFields.map(field => doc[field]);
  }

  /**
   * Parse keyset pagination request
   */
  static parse(query) {
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || 20, 10)));
    const keyset = query.keyset ? JSON.parse(Buffer.from(query.keyset, 'base64').toString('utf-8')) : null;
    const sortFields = query.sort_by ? query.sort_by.split(',') : ['_id'];
    const direction = query.direction === 'prev' ? 'prev' : 'next';

    return { limit, keyset, sortFields, direction };
  }

  /**
   * Paginate using keyset
   */
  static async paginate(collection, baseFilter, pagination, sortObj = { _id: -1 }) {
    const { limit, keyset, sortFields, direction } = pagination;

    // Build filter
    const filter = keyset
      ? this.buildKeysetFilter(baseFilter, keyset, sortFields, direction)
      : baseFilter;

    // Build sort from sortObj
    const sortArray = Object.entries(sortObj).map(([field, order]) => [field, order]);

    // Fetch limit + 1 to detect if there are more results
    const docs = await collection
      .find(filter)
      .sort(sortObj)
      .limit(limit + 1)
      .toArray();

    const hasMore = docs.length > limit;
    if (hasMore) {
      docs.pop();
    }

    // Generate next keyset
    const nextKeyset = docs.length > 0
      ? Buffer.from(JSON.stringify(this.extractKeyset(docs[docs.length - 1], sortFields))).toString('base64')
      : null;

    return {
      docs,
      pagination: {
        keyset: nextKeyset,
        hasMore,
        count: docs.length,
        limit,
      },
    };
  }
}

/**
 * Pagination factory with intelligent selection
 */
class PaginationFactory {
  static create(query, type = 'auto') {
    if (type === 'cursor' || (type === 'auto' && query.cursor)) {
      return {
        type: 'cursor',
        params: CursorPagination.parse(query),
        paginate: (col, filter, sort) => CursorPagination.paginate(col, filter, this.params, sort),
      };
    }

    if (type === 'keyset' || (type === 'auto' && query.keyset)) {
      return {
        type: 'keyset',
        params: KeysetPagination.parse(query),
        paginate: (col, filter, sort) => KeysetPagination.paginate(col, filter, this.params, sort),
      };
    }

    // Default to offset
    return {
      type: 'offset',
      params: OffsetPagination.parse(query),
      paginate: (col, filter, sort) => OffsetPagination.paginate(col, filter, this.params, sort),
    };
  }
}

/**
 * Helper middleware for pagination
 */
function paginationMiddleware(req, res, next) {
  // Attach pagination parser to request
  req.paginate = {
    offset: (query = req.query) => OffsetPagination.parse(query),
    cursor: (query = req.query) => CursorPagination.parse(query),
    keyset: (query = req.query) => KeysetPagination.parse(query),
    auto: (query = req.query, type = 'auto') => PaginationFactory.create(query, type),
  };

  next();
}

module.exports = {
  OffsetPagination,
  CursorPagination,
  KeysetPagination,
  PaginationFactory,
  paginationMiddleware,
  paginationUsageCounter,
};
