import { describe, test, expect } from '@jest/globals';
import { hasActiveObservation } from '../../../src/server/services/rlFeedbackLogger.js';

describe('rlFeedbackLogger', () => {
  test('hasActiveObservation returns false for unknown session', () => {
    expect(hasActiveObservation('nonexistent')).toBe(false);
  });
});
