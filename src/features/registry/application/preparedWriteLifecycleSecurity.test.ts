import { expect, test } from 'bun:test';

import {
  createPreparedWriteSecurityFixture as createFixture,
  preparePreparedWriteSecurityFixtureAsync as prepareAsync,
  rejectPreparedWriteSecurityFixtureAsync as rejectsAsync,
  securityApprovalInput as approvalInput,
  securityContext as context,
} from './preparedWriteLifecycleSecurityFixture.js';

test('rejects unauthorized accounts and missing approvals before mutation', async () => {
  const unauthorized = createFixture();
  await rejectsAsync(
    unauthorized.registry.prepareWriteAsync(
      'fixture.write',
      {},
      {
        actorId: 'operator',
        allowedAccounts: ['other'],
      },
    ),
    'account-not-allowed',
  );
  expect(unauthorized.state.calls).toBe(0);

  const missing = createFixture();
  await prepareAsync(missing.registry);
  await rejectsAsync(
    missing.registry.executeAsync('fixture.write', {}, context),
    'accepts only an approvalId',
  );
  expect(missing.state.calls).toBe(0);
});

test('rejects expired, reused, and tool-bound approvals before mutation', async () => {
  const expired = createFixture();
  await prepareAsync(expired.registry);
  await rejectsAsync(
    expired.registry.executeAsync('fixture.write', { approvalId: 'expired' }, context),
    'denied, expired, replayed',
  );
  expect(expired.state.calls).toBe(0);

  const tool = createFixture({
    claimProposal: (proposal) => ({ ...proposal, toolId: 'fixture.other' }),
  });
  await prepareAsync(tool.registry);
  await rejectsAsync(
    tool.registry.executeAsync('fixture.write', approvalInput, context),
    'bound to another operation',
  );
  expect(tool.state.calls).toBe(0);

  const replay = createFixture();
  await prepareAsync(replay.registry);
  await replay.registry.executeAsync('fixture.write', approvalInput, context);
  await rejectsAsync(
    replay.registry.executeAsync('fixture.write', approvalInput, context),
    'denied, expired, replayed',
  );
  expect(replay.state.calls).toBe(1);
});

test('authorizes the trusted actor and account before consuming an approval', async () => {
  const fixture = createFixture();
  await prepareAsync(fixture.registry);
  await rejectsAsync(
    fixture.registry.executeAsync('fixture.write', approvalInput, {
      actorId: 'other-operator',
      allowedAccounts: ['account'],
    }),
    'denied, expired, replayed',
  );
  expect(fixture.state.consumed).toBeFalse();
  expect(fixture.state.calls).toBe(0);
  await rejectsAsync(
    fixture.registry.executeAsync('fixture.write', approvalInput, {
      actorId: 'operator',
      allowedAccounts: ['other-account'],
    }),
    'denied, expired, replayed',
  );
  expect(fixture.state.consumed).toBeFalse();
  expect(fixture.state.calls).toBe(0);
  await fixture.registry.executeAsync('fixture.write', approvalInput, context);
  expect(fixture.state.consumed).toBeTrue();
  expect(fixture.state.calls).toBe(1);
});

test('rejects changed original proposals and fingerprints before a human approval can be used', async () => {
  const changed = createFixture({
    storedProposal: (proposal) => ({
      ...proposal,
      payload: { ...proposal.payload, serialized: '{}' },
    }),
  });
  await rejectsAsync(
    changed.registry.prepareWriteAsync('fixture.write', {}, context),
    'did not preserve',
  );

  const fingerprint = createFixture({
    snapshotFingerprint: 'tampered',
  });
  await rejectsAsync(
    fingerprint.registry.prepareWriteAsync('fixture.write', {}, context),
    'did not preserve',
  );
  expect(changed.state.calls + fingerprint.state.calls).toBe(0);
});

test('claims concurrent executions once and never retries an indeterminate provider call', async () => {
  const concurrent = createFixture();
  await prepareAsync(concurrent.registry);
  const results = await Promise.allSettled([
    concurrent.registry.executeAsync('fixture.write', approvalInput, context),
    concurrent.registry.executeAsync('fixture.write', approvalInput, context),
  ]);
  expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
  expect(concurrent.state.calls).toBe(1);

  const indeterminate = createFixture({ executeFails: true });
  await prepareAsync(indeterminate.registry);
  await rejectsAsync(
    indeterminate.registry.executeAsync('fixture.write', approvalInput, context),
    'execution failed',
  );
  expect(indeterminate.state.calls).toBe(1);
  expect(indeterminate.state.settlements).toEqual([
    { outcome: 'indeterminate', reasonCode: 'provider-outcome-unknown' },
  ]);
  expect(indeterminate.state.audit.map(({ outcome }) => outcome)).toEqual([
    'intent_persisted',
    'provider_call_started',
    'indeterminate',
  ]);
  await rejectsAsync(
    indeterminate.registry.executeAsync('fixture.write', approvalInput, context),
    'denied, expired, replayed',
  );
  expect(indeterminate.state.calls).toBe(1);
});

test('settles only a verified provider result as executed', async () => {
  const fixture = createFixture();
  await prepareAsync(fixture.registry);

  expect(await fixture.registry.executeAsync('fixture.write', approvalInput, context)).toEqual({
    ok: true,
  });

  expect(fixture.state.calls).toBe(1);
  expect(fixture.state.settlements).toEqual([{ outcome: 'executed' }]);
  expect(fixture.state.audit.map(({ outcome }) => outcome)).toEqual([
    'intent_persisted',
    'provider_call_started',
    'mutation_verified',
  ]);
});

test('preserves an indeterminate provider outcome without another mutation', async () => {
  const fixture = createFixture({ auditOutcome: 'indeterminate' });
  await prepareAsync(fixture.registry);

  expect(await fixture.registry.executeAsync('fixture.write', approvalInput, context)).toEqual({
    ok: true,
  });

  expect(fixture.state.calls).toBe(1);
  expect(fixture.state.settlements).toEqual([{ outcome: 'indeterminate' }]);
  expect(fixture.state.audit.map(({ outcome }) => outcome)).toEqual([
    'intent_persisted',
    'provider_call_started',
    'indeterminate',
  ]);
});

test('settles a failed provider outcome classification as indeterminate', async () => {
  const fixture = createFixture({ auditOutcomeThrows: true });
  await prepareAsync(fixture.registry);

  await rejectsAsync(
    fixture.registry.executeAsync('fixture.write', approvalInput, context),
    'execution failed',
  );

  expect(fixture.state.calls).toBe(1);
  expect(fixture.state.settlements).toEqual([
    { outcome: 'indeterminate', reasonCode: 'provider-outcome-unknown' },
  ]);
  expect(fixture.state.audit.map(({ outcome }) => outcome)).toEqual([
    'intent_persisted',
    'provider_call_started',
    'indeterminate',
  ]);
});

test('durably settles verification rejection and provider verification exceptions without mutation', async () => {
  const rejected = createFixture({ stateMatches: false });
  await prepareAsync(rejected.registry);
  await rejectsAsync(
    rejected.registry.executeAsync('fixture.write', approvalInput, context),
    'state no longer matches',
  );
  expect(rejected.state.calls).toBe(0);
  expect(rejected.state.settlements).toEqual([
    { outcome: 'not_applied', reasonCode: 'state-mismatch' },
  ]);

  const errored = createFixture({ verificationThrows: true });
  await prepareAsync(errored.registry);
  await rejectsAsync(
    errored.registry.executeAsync('fixture.write', approvalInput, context),
    'verification failed',
  );
  expect(errored.state.calls).toBe(0);
  expect(errored.state.settlements).toEqual([
    { outcome: 'not_applied', reasonCode: 'verification-error' },
  ]);
});

test('fails closed for audit loss and consumes stale state without a provider mutation', async () => {
  const before = createFixture({ auditFailsFor: 'intent_persisted' });
  await prepareAsync(before.registry);
  await rejectsAsync(
    before.registry.executeAsync('fixture.write', approvalInput, context),
    'durable audit',
  );
  expect(before.state.calls).toBe(0);

  const after = createFixture({ auditFailsFor: 'mutation_verified' });
  await prepareAsync(after.registry);
  await rejectsAsync(
    after.registry.executeAsync('fixture.write', approvalInput, context),
    'durable audit',
  );
  expect(after.state.calls).toBe(1);
  expect(after.state.settlements).toEqual([{ outcome: 'executed' }]);

  const stale = createFixture({ stateMatches: false });
  await prepareAsync(stale.registry);
  await rejectsAsync(
    stale.registry.executeAsync('fixture.write', approvalInput, context),
    'state no longer matches',
  );
  expect(stale.state.calls).toBe(0);
  await rejectsAsync(
    stale.registry.executeAsync('fixture.write', approvalInput, context),
    'denied, expired, replayed',
  );
});
