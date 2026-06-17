import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildFeatureFlagRegistry,
  featureFlagDefinitions,
  getFeatureFlagSnapshot,
  isEnabled,
} from './feature-flags';

test('feature flag registry exposes the required Phase 6 flags with safe defaults', () => {
  const registry = buildFeatureFlagRegistry({});

  assert.equal(registry.scopedAuthorizationEnforcement, true);
  assert.equal(registry.auditLogging, true);
  assert.equal(registry.aiSafetyGuard, true);
  assert.equal(registry.antiFraudSignalGeneration, true);
  assert.equal(registry.gradebookSummaries, true);
  assert.equal(registry.deploymentCheckpoints, false);
  assert.equal(featureFlagDefinitions.length, 6);
});

test('feature flag registry parses common env boolean values', () => {
  const registry = buildFeatureFlagRegistry({
    FEATURE_SCOPED_AUTHORIZATION_ENFORCEMENT: 'off',
    FEATURE_AUDIT_LOGGING: '0',
    FEATURE_AI_SAFETY_GUARD: 'false',
    FEATURE_ANTI_FRAUD_SIGNAL_GENERATION: 'no',
    FEATURE_GRADEBOOK_SUMMARIES: 'disabled',
    FEATURE_DEPLOYMENT_CHECKPOINTS: 'enabled',
  });

  assert.equal(registry.scopedAuthorizationEnforcement, false);
  assert.equal(registry.auditLogging, false);
  assert.equal(registry.aiSafetyGuard, false);
  assert.equal(registry.antiFraudSignalGeneration, false);
  assert.equal(registry.gradebookSummaries, false);
  assert.equal(registry.deploymentCheckpoints, true);
});

test('feature flag helper and snapshot are typed and do not expose secrets', () => {
  const registry = buildFeatureFlagRegistry({
    FEATURE_DEPLOYMENT_CHECKPOINTS: 'true',
    JWT_SECRET: 'do-not-leak',
  });
  const snapshot = getFeatureFlagSnapshot(registry);

  assert.equal(isEnabled('deploymentCheckpoints', registry), true);
  assert.equal(snapshot.some((flag) => flag.env === 'JWT_SECRET'), false);
  assert.equal(snapshot.find((flag) => flag.key === 'deploymentCheckpoints')?.enabled, true);
});

test('invalid env values fall back to safe defaults', () => {
  const registry = buildFeatureFlagRegistry({
    FEATURE_SCOPED_AUTHORIZATION_ENFORCEMENT: 'definitely',
    FEATURE_DEPLOYMENT_CHECKPOINTS: 'maybe',
  });

  assert.equal(registry.scopedAuthorizationEnforcement, true);
  assert.equal(registry.deploymentCheckpoints, false);
});
