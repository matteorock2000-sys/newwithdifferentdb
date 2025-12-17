# Error Handling Guide

## Overview
This application uses a standardized error handling system with retry logic, graceful degradation, and user-friendly error messages.

## Error Response Format
All API routes return errors in this format:
{
  success: false,
  error: {
    code: 'ERROR_CODE',
    message: 'Technical message',
    userMessage: 'User-friendly message',
    recoverySteps: ['Step 1', 'Step 2'],
    retryable: true/false
  }
}

## Retry Logic
Critical operations automatically retry with exponential backoff:
- Scenario generation: 3 attempts, 2s initial delay
- Map generation: 3 attempts, 3s initial delay
- Slot updates: 2 attempts, 500ms initial delay

## Error Types
- NETWORK_TIMEOUT: Connection issues
- API_QUOTA_EXCEEDED: Service rate limited
- SCENARIO_GENERATION_FAILED: AI generation failed
- MAP_GENERATION_FAILED: Map creation failed
- SLOT_UPDATE_FAILED: Character slot sync failed
- ROOM_NOT_FOUND: Invalid room code
- UNAUTHORIZED: Authentication required
- VALIDATION_ERROR: Invalid input
- DATABASE_ERROR: Server error

## Graceful Degradation
- Map generation failure: Continue without custom map
- Vote loading failure: Show cached votes, retry on reconnect
- Slot update failure: Rollback to previous state, show error

## User Feedback
- Toast notifications for transient errors
- Error boundaries for critical failures
- Loading states during retries
- Recovery step guidance in error messages

## Testing Error Scenarios
1. Network failures: Disable network in DevTools
2. API quota: Trigger rate limits
3. Database errors: Simulate timeouts
4. Validation errors: Submit invalid data
