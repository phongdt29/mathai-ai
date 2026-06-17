export type FeatureFlagName =
  | 'scopedAuthorizationEnforcement'
  | 'auditLogging'
  | 'aiSafetyGuard'
  | 'antiFraudSignalGeneration'
  | 'gradebookSummaries'
  | 'deploymentCheckpoints';

export interface FeatureFlagDefinition {
  readonly key: FeatureFlagName;
  readonly env: string;
  readonly description: string;
  readonly defaultEnabled: boolean;
  readonly safeDefaultReason: string;
}

export type FeatureFlagRegistry = Readonly<Record<FeatureFlagName, boolean>>;

type EnvReader = Pick<NodeJS.ProcessEnv, string>;

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off', 'disabled']);

export const featureFlagDefinitions = [
  {
    key: 'scopedAuthorizationEnforcement',
    env: 'FEATURE_SCOPED_AUTHORIZATION_ENFORCEMENT',
    description: 'Enforce scoped RBAC decisions for student, teacher, parent, and admin resources.',
    defaultEnabled: true,
    safeDefaultReason: 'Security boundary should remain enforced unless an incident rollback explicitly disables it.',
  },
  {
    key: 'auditLogging',
    env: 'FEATURE_AUDIT_LOGGING',
    description: 'Persist security and administrative audit events.',
    defaultEnabled: true,
    safeDefaultReason: 'Audit visibility is safe-by-default and supports deployment rollback investigations.',
  },
  {
    key: 'aiSafetyGuard',
    env: 'FEATURE_AI_SAFETY_GUARD',
    description: 'Evaluate AI inputs and outputs with the MathAI safety guard.',
    defaultEnabled: true,
    safeDefaultReason: 'Safety checks should remain active unless a controlled fallback is required.',
  },
  {
    key: 'antiFraudSignalGeneration',
    env: 'FEATURE_ANTI_FRAUD_SIGNAL_GENERATION',
    description: 'Generate anti-fraud signals and anomaly metadata for review workflows.',
    defaultEnabled: true,
    safeDefaultReason: 'Signal generation is observational and supports integrity monitoring.',
  },
  {
    key: 'gradebookSummaries',
    env: 'FEATURE_GRADEBOOK_SUMMARIES',
    description: 'Expose gradebook summary aggregation for teacher and student progress views.',
    defaultEnabled: true,
    safeDefaultReason: 'Existing gradebook summary behavior remains available by default.',
  },
  {
    key: 'deploymentCheckpoints',
    env: 'FEATURE_DEPLOYMENT_CHECKPOINTS',
    description: 'Enable deployment checkpoint metadata and rollback readiness workflows.',
    defaultEnabled: false,
    safeDefaultReason: 'New deployment automation is opt-in until P6.3-P6.5 operational rollout.',
  },
] as const satisfies readonly FeatureFlagDefinition[];

export const featureFlagEnvKeys = featureFlagDefinitions.map((definition) => definition.env);

const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) {
    return true;
  }

  if (FALSE_VALUES.has(normalized)) {
    return false;
  }

  return defaultValue;
};

export const buildFeatureFlagRegistry = (env: EnvReader = process.env): FeatureFlagRegistry => {
  return featureFlagDefinitions.reduce((registry, definition) => {
    registry[definition.key] = parseBoolean(env[definition.env], definition.defaultEnabled);
    return registry;
  }, {} as Record<FeatureFlagName, boolean>);
};

export const featureFlags = buildFeatureFlagRegistry();

export const isEnabled = (
  flag: FeatureFlagName,
  registry: FeatureFlagRegistry = featureFlags,
): boolean => registry[flag] === true;

export const getFeatureFlagSnapshot = (
  registry: FeatureFlagRegistry = featureFlags,
): ReadonlyArray<FeatureFlagDefinition & { enabled: boolean }> =>
  featureFlagDefinitions.map((definition) => ({
    ...definition,
    enabled: registry[definition.key],
  }));
